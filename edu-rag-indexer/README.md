# edu-rag-indexer

금융교육 PDF를 파싱→청킹→임베딩해서 **검색 가능한 지식베이스**로 만드는 파이프라인. 상세 요구사항은 [SPEC.md](SPEC.md).

- `indexer.py` — PDF → 청크 → 임베딩 → PostgreSQL(pgvector) 적재
- `search.py` — 질의를 넣어 상위 청크가 제대로 나오는지 확인하는 검증 CLI
- `inspect_parse.py` — 인덱싱 전에 추출 텍스트를 눈으로 보는 파싱 품질 검사 도구

LLM 답변 생성은 범위 외다. 검색까지만.

## 준비

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt      # 첫 설치 시 torch 포함 ~2GB
```

### 데이터베이스

pgvector가 있는 PostgreSQL이 필요하다. 로컬 Postgres를 쓴다면:

```bash
brew install pgvector          # 단, brew 포뮬러는 최신 PG 버전용으로 빌드된다.
                               # 서버가 구버전이면 소스 빌드가 필요하다 (아래 참고)
createdb trading_gym_rag
psql -d trading_gym_rag -c "CREATE EXTENSION vector;"
export DATABASE_URL="postgresql:///trading_gym_rag"   # 생략 시 config.yaml의 default_url
```

> **주의**: `brew install pgvector`는 Homebrew의 *기본* PostgreSQL 버전(현재 @17)용으로 설치된다.
> 서버가 postgresql@16이면 확장이 안 잡히므로 그 서버용으로 직접 빌드해야 한다:
> ```bash
> git clone --branch v0.8.0 --depth 1 https://github.com/pgvector/pgvector.git
> cd pgvector
> make        PG_CONFIG=/opt/homebrew/opt/postgresql@16/bin/pg_config
> make install PG_CONFIG=/opt/homebrew/opt/postgresql@16/bin/pg_config
> ```

로컬에 Postgres가 없으면 [docker-compose.yml](docker-compose.yml)로 띄운다(호스트 5432와 겹치지 않게 5433 사용):

```bash
docker compose up -d
export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/trading_gym_rag"
```

### 입력 데이터

```
data/
├── sources.csv     # 문서 메타데이터 (수기 작성)
└── raw/            # PDF 원본 (하위 폴더 자유, 재귀 탐색)
```

`sources.csv` 컬럼: `filename, org_name, topic_tags, target, year, license, source_url, title`
(`topic_tags`는 세미콜론 구분, `target`은 Y/U/A)

**CSV에 없는 PDF는 인덱싱하지 않고 경고만 낸다** — 출처를 모르는 자료가 지식베이스에 섞이지 않게 하기 위함.

## 실행

```bash
.venv/bin/python inspect_parse.py            # 먼저 파싱 품질 확인 (권장)
.venv/bin/python indexer.py                  # 전체 인덱싱
.venv/bin/python indexer.py --limit 1        # 1개만 (테스트)
.venv/bin/python indexer.py --file a.pdf     # 단일 파일
.venv/bin/python indexer.py --force          # 해시가 같아도 재인덱싱

.venv/bin/python search.py "레버리지 투자의 위험성" --top-k 5
.venv/bin/python search.py "반대매매가 뭐야" --tags 레버리지 --target U
```

재실행은 **파일 해시 기준**으로 스킵한다. 파일이 바뀌면 기존 청크를 지우고 다시 넣는다.
청킹 설정(`chunk_size` 등)을 바꿨을 때는 파일이 그대로라 스킵되므로 `--force`를 쓴다.

## 설정 (config.yaml)

청크 크기/오버랩, 임베딩 백엔드·모델, 파싱 임계값, 경로를 여기서 조정한다.

| 백엔드 | 모델 | 차원 | 비고 |
|---|---|---|---|
| `local` (기본) | BAAI/bge-m3 | 1024 | 키 불필요. 첫 실행 시 모델 ~2.2GB 다운로드 |
| `openai` | text-embedding-3-small | 1536 | `OPENAI_API_KEY` 필요 |

> **백엔드를 바꾸면 반드시 재인덱싱해야 한다.** 차원이 달라 기존 벡터를 재사용할 수 없다.
> 차원이 안 맞으면 인덱서가 안내 메시지와 함께 멈춘다. 비우고 다시 넣으려면:
> ```bash
> psql -d trading_gym_rag -c "DROP TABLE edu_chunks, edu_documents CASCADE;"
> ```

## 파싱 동작

- 페이지별 텍스트를 뽑고 **페이지 번호를 청크까지 보존**한다(검색 결과에 "몇 쪽"을 표시하려고).
- 전 페이지에 반복되는 짧은 줄은 머리글/바닥글로 보고 제거한다. 페이지 번호만 다른 경우도 같은 것으로 묶는다(숫자를 `#`로 정규화).
- 목차 페이지는 리더 문자(`......`, `・・・・・`) + 페이지번호 패턴으로 판정해 건너뛴다.
- **스캔본 감지**: 페이지당 평균 50자 미만이면 `NEEDS_OCR`로 분류만 하고 인덱싱에서 제외한다(OCR은 범위 외).
- **깨진 폰트 감지**: `(cid:123)`·`�` 비율이 임계값을 넘으면 `GARBLED`로 제외한다.

### ⚠️ Apple Silicon(mps)에서 임베딩이 깨지는 문제 — device를 cpu로 고정한 이유

`config.yaml`의 `embedding.local.device`가 `cpu`인 것은 성능 타협이 아니라 **정확성 때문**이다.

이 맥에서 bge-m3를 mps(애플 GPU)로 돌리면 **짧은 텍스트를 단독으로 인코딩할 때 벡터가 깨진다.**
같은 문장을 단독으로 넣을 때와 긴 문서와 함께 배치로 넣을 때를 비교한 실측값:

| 디바이스 | 질의 벡터 (단건 vs 배치 일치도) | 문서 벡터 | 질의·문서 유사도 (단건 / 배치) |
|---|---|---|---|
| mps | **0.2372** | 1.0000 | **0.1175** / 0.7156 |
| cpu | 1.0000 | 1.0000 | 0.7156 / 0.7156 |

검색은 구조상 항상 질의 한 건만 인코딩하므로, mps에서는 **검색이 통째로 망가진다.**
실제로 이 문제를 찾기 전에는 "금융사기를 예방하는 방법"을 넣으면 그 내용을 담은 청크(0.72가 나와야 함)가
0.19로 밀리고 목차 조각이 1위로 올라왔다. 인덱싱은 긴 텍스트를 배치로 넣어서 영향이 없었기 때문에
**적재된 벡터는 멀쩡한데 검색만 이상한** 형태로 나타나 원인이 잘 안 보였다.

증상이 의심되면 이렇게 확인한다(일치도가 1.0이 아니면 그 디바이스는 쓰면 안 된다):

```python
from sentence_transformers import SentenceTransformer
import numpy as np
m = SentenceTransformer('BAAI/bge-m3', device='mps')
q = "금융사기를 예방하는 방법"
single = m.encode([q], normalize_embeddings=True)[0]
batched = m.encode([q, "긴 문서 " * 200], normalize_embeddings=True)[0]
print(float(np.array(single) @ np.array(batched)))   # cpu: 1.0
```

### 검색 품질에 대해 (실측)

3개 자료(한국은행 경제금융용어 700선 / 금감원 대학생을 위한 실용금융 / 예보 대학생을 위한 금융 첫걸음,
약 2,400청크)로 확인한 결과:

| 질의 | 최고 유사도 | 결과 |
|---|---|---|
| 예금자보호 한도 | 0.77 | 금감원 실용금융 115–116쪽 (5천만원 초과 시 분산 예치) — 정확 |
| 금융사기를 예방하는 방법 | 0.76 | 예보 금융 첫걸음 409–410쪽 (사기 예방 금융습관) — 정확 |
| 레버리지 투자의 위험성 | 0.73 | 금감원 실용금융 134–135쪽 (레버리지 효과·손실 확대) — 정확 |
| 분산투자를 해야 하는 이유 | 0.68 | 예보 금융 첫걸음 203쪽 — 적절 |
| 반대매매가 뭐야 | 0.56 | 실용금융 222쪽(불건전 거래행위) — 주변부. 아래 참고 |

관련 자료가 있는 주제는 0.7 이상으로 정확한 페이지가 나온다.

**"반대매매"만 유독 약한 것은 코퍼스의 한계다.** 이 3개 자료에서 반대매매는 선물·차익거래의
청산을 뜻하는 용례로만 몇 번 스쳐 지나갈 뿐, **신용거래 담보부족에 따른 강제매도**라는 뜻으로
설명하는 대목이 없다(전체 6개 청크, 모두 파생상품 문맥). 트레이딩 짐의 핵심 시나리오인 만큼
신용거래·증거금·반대매매를 정면으로 다루는 자료를 추가로 확보해야 한다.

### 알려진 한계 — 표

pymupdf 기본 텍스트 추출은 표를 **셀 텍스트의 나열**로 뱉는다. 예를 들어 "복리와 단리 비교" 표는
`구분 / 단리 / 복리 / 이자 계산 방식 / 원금에만 이자 발생 / ...` 처럼 풀려서 **행·열 대응이 사라진다.**
내용 자체는 남아 있어 검색에는 걸리지만, 표의 구조를 그대로 읽어야 하는 질의에는 약하다.
SPEC 4-3이 "완벽한 표 복원은 요구하지 않음"이라 현 단계에서는 이 상태로 둔다.
필요해지면 `page.find_tables()` → `to_markdown()`으로 표만 따로 뽑아 청크에 얹는 방식이 다음 후보다.

## 다음 단계와의 연결

`lib/sources.py`는 메타데이터 소스를 함수로 분리해뒀다. Open API 승인 후
`edu-content-collector`가 만드는 `catalog.jsonl`을 `data/`에 두면 자동으로 병합된다
(같은 filename이 양쪽에 있으면 수기 CSV가 우선).
