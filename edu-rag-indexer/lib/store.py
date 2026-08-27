"""PostgreSQL + pgvector 저장·검색 레이어 (스키마는 SPEC 5절)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

import psycopg

from .chunking import Chunk
from .embedding import to_pgvector
from .pdf_parse import Page

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

CREATE TABLE IF NOT EXISTS edu_pages (
  id SERIAL PRIMARY KEY,
  document_id INT REFERENCES edu_documents(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  content TEXT NOT NULL,
  UNIQUE (document_id, page_number)
);

CREATE INDEX IF NOT EXISTS edu_pages_document_idx
  ON edu_pages (document_id);

CREATE TABLE IF NOT EXISTS edu_articles (
  id SERIAL PRIMARY KEY,
  document_id INT REFERENCES edu_documents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  page_start INT NOT NULL,
  page_end INT NOT NULL,
  topic_summary TEXT,
  target_stat_key TEXT CHECK (target_stat_key IN (
    'JUDGMENT_ACCURACY', 'DISCLOSURE_CHECK_RATE', 'RISK_MANAGEMENT_SCORE', 'IMPULSIVE_TRADING',
    'LOSS_AVERSION', 'CONFIRMATION_BIAS', 'DIVERSIFICATION', 'GAMBLING_SIGNAL'
  )),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS edu_articles_document_idx
  ON edu_articles (document_id);
CREATE INDEX IF NOT EXISTS edu_articles_stat_key_idx
  ON edu_articles (target_stat_key);
"""

# Kotlin SessionStatKey enum과 동일 — 자료실 글을 /pt 맞춤 퀴즈가 쓰는 8개 약점 지표와
# 같은 어휘로 태깅해서 필터링 가능하게 함.
STAT_KEYS = [
    "JUDGMENT_ACCURACY", "DISCLOSURE_CHECK_RATE", "RISK_MANAGEMENT_SCORE", "IMPULSIVE_TRADING",
    "LOSS_AVERSION", "CONFIRMATION_BIAS", "DIVERSIFICATION", "GAMBLING_SIGNAL",
]


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


def get_document_by_id(conn: psycopg.Connection, document_id: int) -> Optional[Dict[str, Any]]:
    row = conn.execute(
        "SELECT id, title, org_name FROM edu_documents WHERE id = %s", (document_id,)
    ).fetchone()
    return {"id": row[0], "title": row[1], "org_name": row[2]} if row else None


def upsert_document(conn: psycopg.Connection, meta, file_hash: str) -> int:
    """문서 메타데이터를 넣거나 갱신하고 id를 준다. (청크·페이지는 안 건드림 —
    각각 insert_chunks/insert_pages가 필요할 때만 따로 갈아끼운다.)"""
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
    return int(row[0])


def insert_chunks(
    conn: psycopg.Connection,
    document_id: int,
    chunks: Sequence[Chunk],
    topic_tags: Sequence[str],
    embeddings: Sequence[Sequence[float]],
) -> int:
    """검색용(edu_chunks) — 기존 청크를 지우고 새로 넣는다."""
    conn.execute("DELETE FROM edu_chunks WHERE document_id = %s", (document_id,))
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


def insert_pages(conn: psycopg.Connection, document_id: int, pages: Sequence[Page]) -> int:
    """읽기용(edu_pages) — 기존 페이지를 지우고 새로 넣는다. 오버랩 없는 원문 그대로."""
    conn.execute("DELETE FROM edu_pages WHERE document_id = %s", (document_id,))
    rows = [(document_id, page.number, page.text) for page in pages]
    with conn.cursor() as cursor:
        cursor.executemany(
            "INSERT INTO edu_pages (document_id, page_number, content) VALUES (%s, %s, %s)",
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
    pages = conn.execute("SELECT count(*) FROM edu_pages").fetchone()[0]
    return {"documents": int(documents), "chunks": int(chunks), "pages": int(pages)}


def get_pages(conn: psycopg.Connection, document_id: int) -> List[Dict[str, Any]]:
    """문서의 모든 페이지(오버랩 없는 원문) — page_number 순서."""
    rows = conn.execute(
        "SELECT page_number, content FROM edu_pages WHERE document_id = %s ORDER BY page_number",
        (document_id,),
    ).fetchall()
    return [{"page_number": r[0], "content": r[1]} for r in rows]


def delete_articles(conn: psycopg.Connection, document_id: int) -> None:
    conn.execute("DELETE FROM edu_articles WHERE document_id = %s", (document_id,))


def insert_article(
    conn: psycopg.Connection,
    document_id: int,
    title: str,
    body: str,
    page_start: int,
    page_end: int,
    topic_summary: str,
    target_stat_key: Optional[str] = None,
) -> int:
    row = conn.execute(
        """
        INSERT INTO edu_articles (document_id, title, body, page_start, page_end, topic_summary, target_stat_key)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (document_id, title, body, page_start, page_end, topic_summary, target_stat_key),
    ).fetchone()
    return int(row[0])


def get_articles_missing_stat_key(conn: psycopg.Connection, document_id: int) -> List[Dict[str, Any]]:
    """target_stat_key 태깅 이전에 만들어진 글들 — 백필용."""
    rows = conn.execute(
        "SELECT id, title, topic_summary FROM edu_articles WHERE document_id = %s AND target_stat_key IS NULL ORDER BY id",
        (document_id,),
    ).fetchall()
    return [{"id": r[0], "title": r[1], "topic_summary": r[2]} for r in rows]


def set_article_stat_key(conn: psycopg.Connection, article_id: int, stat_key: str) -> None:
    conn.execute("UPDATE edu_articles SET target_stat_key = %s WHERE id = %s", (stat_key, article_id))
