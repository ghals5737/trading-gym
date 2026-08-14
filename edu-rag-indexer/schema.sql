-- edu-rag-indexer 스키마 (SPEC 5절)
-- indexer.py가 실행 시 자동으로 만들지만, 수동 확인·재생성용으로 남겨둔다.
-- embedding 차원은 임베딩 백엔드에 맞춰야 한다: bge-m3=1024, openai text-embedding-3-small=1536.

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
  topic_tags TEXT[],          -- 문서 메타데이터에서 상속
  embedding vector(1024)
);

CREATE INDEX IF NOT EXISTS edu_chunks_embedding_idx
  ON edu_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS edu_chunks_topic_tags_idx
  ON edu_chunks USING gin (topic_tags);
CREATE INDEX IF NOT EXISTS edu_chunks_document_idx
  ON edu_chunks (document_id);
