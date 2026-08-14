# RAG 인덱싱 파이프라인 (edu-rag-indexer) 명세서

## 1. 목적

수동으로 확보한 금융교육 PDF들을 파싱→청킹→임베딩하여 **검색 가능한 지식베이스**로 만드는 파이프라인. 산출물은 챗봇(KnowerBot)과 투자성향 기반 학습 추천이 공유하는 검색 레이어의 데이터가 된다.

구성은 두 부분:
- **인덱서(indexer)**: PDF → 청크 → 임베딩 → 벡터 DB 적재 (배치 실행)
- **검색 검증 CLI(search)**: 질의를 넣으면 상위 청크가 잘 나오는지 확인하는 도구

LLM 답변 생성(챗봇 응답)은 이 프로그램 범위가 아니다. 검색까지만.

## 2. 입력

### 2.1 원본 파일
- 위치: `data/raw/` (하위 폴더 구조 자유, 재귀 탐색)
- 형식: PDF (텍스트 레이어 있는 PDF 전제. 이미지 스캔본은 4.1 참조)

### 2.2 메타데이터 파일: `data/sources.csv`
API 승인 전이므로 카탈로그를 수동 작성한다. 컬럼:

```
filename, org_name, topic_tags, target, year, license, source_url, title
```

- filename: data/raw/ 기준 상대경로 (매칭 키)
- topic_tags: 세미콜론 구분 복수 태그 (예: `투자의기초;레버리지`)
- target: Y(청년기)/U(대학생)/A(중장년기) 등 — 수집기 명세의 코드 체계와 동일하게
- license: A/B (출처표시 자유이용/상업적이용금지)
- CSV에 없는 PDF는 인덱싱하지 말고 경고 출력 (메타데이터 없는 자료가 지식베이스에 섞이는 것 방지)

※ 추후 Open API 수집기의 catalog.jsonl이 생기면 이 CSV와 같은 스키마로 병합할 예정이므로, 메타데이터 로딩 부분은 소스 추가가 쉽게 함수 분리할 것.

## 3. 처리 파이프라인

```
1. sources.csv 로드, data/raw/ 스캔, 매칭 검증
2. PDF 파싱 (pymupdf 사용)
   - 페이지별 텍스트 추출, 페이지 번호 보존
   - 머리글/바닥글 반복 패턴 제거 (같은 문구가 전 페이지 반복되면 제거)
   - 목차 페이지는 휴리스틱으로 스킵 (선택)
3. 청킹
   - 기본: 800자 단위, 오버랩 150자
   - 문단 경계 우선 분할 (문단 중간에서 자르지 않도록)
   - 청크 최소 길이 100자 미만은 인접 청크에 병합
4. 임베딩
   - 설정으로 백엔드 선택 가능하게:
     a. openai: text-embedding-3-small (환경변수 OPENAI_API_KEY)
     b. local: sentence-transformers "BAAI/bge-m3" (한국어 성능 검증된 다국어 모델)
   - 기본값은 local (API 비용·키 없이 데모 가능하도록)
5. 저장: PostgreSQL + pgvector
   - 접속 정보는 환경변수 (DATABASE_URL)
   - 테이블 스키마는 5절 참조
   - 재실행 시 동일 파일(파일 해시 기준)은 스킵, 변경된 파일은 기존 청크 삭제 후 재적재
6. 실행 요약: 파일 수 / 청크 수 / 스킵 / 실패 출력
```

## 4. 구현 시 확인·검증 사항 (Claude Code가 직접 확인할 것)

1. **파싱 품질 샘플 검증**: 인덱싱 전에 PDF 2~3개를 골라 추출 텍스트 앞 2000자를 출력하고, 한글 깨짐·표 뭉개짐·세로쓰기 오류가 있는지 확인할 것. 깨지는 파일은 목록으로 보고하고 인덱싱에서 제외 (억지로 넣지 말 것)
2. **텍스트 레이어 없는 PDF 감지**: 추출 텍스트가 페이지당 50자 미만이면 스캔본으로 간주, status=NEEDS_OCR로 분류만 하고 스킵 (OCR은 범위 외)
3. **표 처리**: pymupdf 기본 추출로 표가 심하게 깨지는 파일이 있으면 보고. 완벽한 표 복원은 요구하지 않음
4. **임베딩 차원**: 선택한 모델의 차원 수에 맞게 pgvector 컬럼 정의 (openai small=1536, bge-m3=1024). 백엔드 전환 시 재인덱싱 필요함을 README에 명시

## 5. DB 스키마 (PostgreSQL + pgvector)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE edu_documents (
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

CREATE TABLE edu_chunks (
  id SERIAL PRIMARY KEY,
  document_id INT REFERENCES edu_documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  page_start INT,
  page_end INT,
  content TEXT NOT NULL,
  topic_tags TEXT[],          -- 문서 메타데이터에서 상속
  embedding vector(1024)      -- 모델 차원에 맞게
);

CREATE INDEX ON edu_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON edu_chunks USING gin (topic_tags);
```

topic_tags를 청크 레벨에 상속시키는 이유: 검색 시 "레버리지 태그 + 벡터 유사도" 하이브리드 필터를 걸기 위함.

## 6. 검색 검증 CLI

```
python search.py "레버리지 투자의 위험성" --top-k 5 [--tags 레버리지] [--target Y]
```

- 질의 임베딩 → 코사인 유사도 상위 k개 청크 출력
- 각 결과에 표시: 유사도 점수, 문서 제목, 기관, 페이지, 청크 앞 200자
- --tags / --target 지정 시 메타데이터 필터 AND 결합
- 목적: 회의·데모에서 "질의하면 금감원 자료 몇 페이지가 근거로 나온다"를 바로 보여주는 용도

## 7. 기술 요구사항

- Python 3.11+, 의존성: pymupdf, sentence-transformers(local 백엔드용), psycopg, (openai 백엔드 선택 시 openai)
- 실행:
  - `python indexer.py` (전체 인덱싱), `--limit N` (테스트), `--file {path}` (단일 파일)
  - `python search.py "질의"` (검색 검증)
- 설정: `config.yaml` — 청크 크기/오버랩, 임베딩 백엔드, 모델명
- Postgres가 로컬에 없으면 docker-compose.yml (pgvector 포함 이미지) 제공할 것

## 8. 범위 외 (하지 말 것)

- LLM 답변 생성 / 챗봇 응답 로직 (다음 단계)
- OCR (스캔본은 감지·보고까지만)
- Open API 호출 (승인 후 수집기가 담당)
- sources.csv에 없는 파일의 인덱싱

## 9. 완료 기준 (Acceptance Criteria)

- [ ] sources.csv 기준으로 data/raw/의 PDF가 인덱싱되고, CSV에 없는 파일은 경고와 함께 제외된다
- [ ] 파싱 품질 샘플 검증 결과가 보고되고, 깨진 파일·스캔본은 제외 목록으로 출력된다
- [ ] 재실행 시 변경 없는 파일은 스킵된다 (파일 해시 기준)
- [ ] `search.py "반대매매가 뭐야"` 실행 시 관련 청크가 문서명·페이지와 함께 상위에 나온다
- [ ] --tags, --target 필터가 검색 결과에 실제로 적용된다
