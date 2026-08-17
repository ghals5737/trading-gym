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

-- edu_chunks는 검색용(임베딩 품질을 위해 청크 경계끼리 오버랩됨) — 사람이 읽는 화면에는
-- 부적합. edu_pages는 그 반대로 오버랩 없는 원본 페이지 텍스트(PDF 쪽 단위, PyMuPDF 추출
-- 직후·청킹 이전 상태)를 그대로 보관해서 "자료실 본문 보기" 같은 읽기 용도로 쓴다.
CREATE TABLE IF NOT EXISTS edu_pages (
  id SERIAL PRIMARY KEY,
  document_id INT REFERENCES edu_documents(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  content TEXT NOT NULL,
  UNIQUE (document_id, page_number)
);

CREATE INDEX IF NOT EXISTS edu_pages_document_idx
  ON edu_pages (document_id);

-- edu_pages를 LLM 2단계(주제 구간 감지 → 블로그 형식으로 재작성)로 가공한 결과.
-- articlegen.py가 한 번 돌려서 채워두는 캐시성 테이블 — 요청마다 LLM을 다시 안 부르려고
-- 미리 만들어서 저장해둔다.
CREATE TABLE IF NOT EXISTS edu_articles (
  id SERIAL PRIMARY KEY,
  document_id INT REFERENCES edu_documents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  page_start INT NOT NULL,
  page_end INT NOT NULL,
  topic_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS edu_articles_document_idx
  ON edu_articles (document_id);
