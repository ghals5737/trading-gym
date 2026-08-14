"""PostgreSQL + pgvector 저장·검색 레이어 (스키마는 SPEC 5절)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

import psycopg

from .chunking import Chunk
from .embedding import to_pgvector

SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS edu_documents (
  id SERIAL PRIMARY KEY,
  filename TEXT UNIQUE NOT NULL,
  file_hash TEXT NOT NULL,
  title TEXT,
  org_name TEXT,
  target TEXT,
  year TEXT,
  license TEXT,
  source_url TEXT,
  indexed_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS edu_chunks (
  id SERIAL PRIMARY KEY,
  document_id INT REFERENCES edu_documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  page_start INT,
  page_end INT,
  content TEXT NOT NULL,
  topic_tags TEXT[],
  embedding vector({dimension})
);

CREATE INDEX IF NOT EXISTS edu_chunks_embedding_idx
  ON edu_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS edu_chunks_topic_tags_idx
  ON edu_chunks USING gin (topic_tags);
CREATE INDEX IF NOT EXISTS edu_chunks_document_idx
  ON edu_chunks (document_id);
"""


def connect(url: str) -> psycopg.Connection:
    return psycopg.connect(url)


def existing_dimension(conn: psycopg.Connection) -> Optional[int]:
    """이미 만들어진 embedding 컬럼의 차원. vector 타입은 atttypmod에 차원이 들어간다."""
    row = conn.execute(
        """
        SELECT a.atttypmod
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        WHERE c.relname = 'edu_chunks' AND a.attname = 'embedding' AND a.attnum > 0
        """
    ).fetchone()
    if not row or row[0] is None or row[0] < 0:
        return None
    return int(row[0])


def ensure_schema(conn: psycopg.Connection, dimension: int) -> None:
    current = existing_dimension(conn)
    if current is not None and current != dimension:
        raise RuntimeError(
            "기존 테이블은 vector(%d)인데 설정은 %d차원입니다.\n"
            "  임베딩 백엔드를 바꾸면 벡터를 재사용할 수 없습니다. 비우고 다시 인덱싱하세요:\n"
            "    psql -d <DB> -c 'DROP TABLE edu_chunks, edu_documents CASCADE;'"
            % (current, dimension)
        )
    conn.execute(SCHEMA_SQL.format(dimension=dimension))
    conn.commit()


def get_document(conn: psycopg.Connection, filename: str) -> Optional[Dict[str, Any]]:
    row = conn.execute(
        "SELECT id, file_hash FROM edu_documents WHERE filename = %s", (filename,)
    ).fetchone()
    return {"id": row[0], "file_hash": row[1]} if row else None


def upsert_document(conn: psycopg.Connection, meta, file_hash: str) -> int:
    """문서를 넣거나 갱신하고 id를 준다. 해시가 바뀌었으면 기존 청크는 지운다."""
    row = conn.execute(
        """
        INSERT INTO edu_documents (filename, file_hash, title, org_name, target, year, license, source_url)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (filename) DO UPDATE SET
            file_hash = EXCLUDED.file_hash,
            title = EXCLUDED.title,
            org_name = EXCLUDED.org_name,
            target = EXCLUDED.target,
            year = EXCLUDED.year,
            license = EXCLUDED.license,
            source_url = EXCLUDED.source_url,
            indexed_at = now()
        RETURNING id
        """,
        (meta.filename, file_hash, meta.title, meta.org_name, meta.target,
         meta.year, meta.license, meta.source_url),
    ).fetchone()
    document_id = int(row[0])
    conn.execute("DELETE FROM edu_chunks WHERE document_id = %s", (document_id,))
    return document_id


def insert_chunks(
    conn: psycopg.Connection,
    document_id: int,
    chunks: Sequence[Chunk],
    topic_tags: Sequence[str],
    embeddings: Sequence[Sequence[float]],
) -> int:
    rows = [
        (document_id, chunk.index, chunk.page_start, chunk.page_end,
         chunk.content, list(topic_tags), to_pgvector(list(vector)))
        for chunk, vector in zip(chunks, embeddings)
    ]
    with conn.cursor() as cursor:
        cursor.executemany(
            """
            INSERT INTO edu_chunks
                (document_id, chunk_index, page_start, page_end, content, topic_tags, embedding)
            VALUES (%s, %s, %s, %s, %s, %s, %s::vector)
            """,
            rows,
        )
    return len(rows)


def search(
    conn: psycopg.Connection,
    query_vector: Sequence[float],
    top_k: int = 5,
    tags: Optional[Sequence[str]] = None,
    target: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """코사인 유사도 상위 k개. tags/target은 AND로 결합한다(SPEC 6절)."""
    conditions = []
    params: List[Any] = [to_pgvector(list(query_vector))]

    if tags:
        conditions.append("c.topic_tags && %s")
        params.append(list(tags))
    if target:
        conditions.append("d.target = %s")
        params.append(target)

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    # ORDER BY는 거리 연산자를 그대로 써야 HNSW 인덱스를 탄다. 그래서 벡터가 두 번 들어간다.
    params.append(to_pgvector(list(query_vector)))
    params.append(top_k)

    rows = conn.execute(
        f"""
        SELECT 1 - (c.embedding <=> %s::vector) AS score,
               d.title, d.org_name, d.target, d.filename, d.source_url,
               c.page_start, c.page_end, c.topic_tags, c.content, c.chunk_index
        FROM edu_chunks c
        JOIN edu_documents d ON d.id = c.document_id
        {where}
        ORDER BY c.embedding <=> %s::vector
        LIMIT %s
        """,
        params,
    ).fetchall()

    return [
        {
            "score": float(r[0]),
            "title": r[1],
            "org_name": r[2],
            "target": r[3],
            "filename": r[4],
            "source_url": r[5],
            "page_start": r[6],
            "page_end": r[7],
            "topic_tags": r[8] or [],
            "content": r[9],
            "chunk_index": r[10],
        }
        for r in rows
    ]


def stats(conn: psycopg.Connection) -> Dict[str, int]:
    documents = conn.execute("SELECT count(*) FROM edu_documents").fetchone()[0]
    chunks = conn.execute("SELECT count(*) FROM edu_chunks").fetchone()[0]
    return {"documents": int(documents), "chunks": int(chunks)}
