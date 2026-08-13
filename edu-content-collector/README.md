# edu-content-collector

금감원 e-금융교육센터 Open API에서 RAG 지식베이스용 교육 콘텐츠의 **메타데이터를 수집하고, 라이선스 조건에 맞는 원본 파일을 내려받는** CLI. 상세 요구사항은 [SPEC.md](SPEC.md).

파싱·청킹·임베딩은 이 프로그램의 범위가 아니다. 산출물(`data/catalog.jsonl` + `data/raw/`)이 다음 단계 파이프라인의 입력이 된다.

## 실행

```bash
export FSS_EDU_API_KEY="발급받은32자리키"     # 신청: https://www.fss.or.kr/edu/api/openApiKey/forInsert.do

python3 collector.py --dry-run               # 조회·필터·카탈로그만 (파일 안 받음)
python3 collector.py                         # 본 실행
python3 collector.py --org 13                # 투자자교육협의회만
python3 collector.py --limit 5               # 다운로드 5건까지 (테스트용)
```

의존성 없음(표준 라이브러리만). Python 3.9에서 동작 확인.

## 산출물

```
data/
├── catalog.jsonl          # 콘텐츠당 1줄 (스키마는 SPEC 4절)
├── collector.log          # 상세 로그
└── raw/{기관명}/{id}_{제목}.{확장자}
```

`status` 값으로 확보 가능/불가 현황을 파악한다.

| status | 의미 |
|---|---|
| `DOWNLOADED` | 이번 실행에서 받음 |
| `SKIPPED_EXISTS` | 이미 받아둔 파일이 있어 건너뜀 (재실행 시) |
| `DOWNLOAD_FAILED` | 링크는 있으나 실패 (HTML 에러 페이지·타임아웃 등) |
| `NO_FILE` | 라이선스는 통과했지만 첨부파일 URL이 없음 (`external_url`만 존재) |
| `LICENSE_EXCLUDED` | 라이선스가 A/B가 아니라 파일을 받지 않음 |
| `PENDING_DOWNLOAD` | 받을 수 있지만 아직 안 받음 (`--dry-run`, `--limit` 초과분) |

> `PENDING_DOWNLOAD`는 SPEC 4절의 5개 status에 없는 값이다. dry-run/limit로 안 받은 걸
> `DOWNLOADED`로 적으면 카탈로그가 사실과 달라져서 따로 뒀다.

## 설정

`config.py`에서 조정한다 — 주제/대상/제작유형 코드 목록, 코드→이름 매핑, 호출 지연(기본 1초), 재시도(3회), 타임아웃.

주제를 추가하려면 `TOPICS`와 `TOPIC_NAMES`에 코드를 넣으면 된다.

## 동작 메모 (실제 확인한 것)

- **키가 틀리면 HTTP 200 + HTML 에러 페이지**가 온다 (4xx가 아님, 2026-08-13 확인). 그래서 JSON 파싱 실패로 90개 조합을 헛돌리지 않고, 첫 호출이 HTML이면 즉시 중단하고 안내한다.
- 응답 래퍼 키가 문서 예제엔 `reponse`(오타)로 돼 있어 `reponse`/`response` 둘 다 받는다. `result`가 단건일 때 배열이 아닌 객체로 오는 경우도 처리한다.
- 페이지네이션 파라미터가 문서에 없다. 조합을 주제코드 단위까지 잘게 쪼개 호출하고, `resultCnt`보다 적게 오면 잘림으로 보고 경고 + 요약에 해당 조합을 표시한다. 그때는 `--org`로 더 좁혀 재수집할 것.
- 다운로드 응답이 HTML이면(Content-Type + 본문 스니핑 이중 확인) 실패 처리한다.
- 재실행은 멱등적이다 — `{id}_*` 파일이 이미 있으면 HTTP 요청 자체를 하지 않는다.

## 개발용 검증

```bash
python3 selftest.py
```

로컬 가짜 API 서버를 띄워 인증 실패·HTML 응답·단건 dict 응답·라이선스 필터·중복 제거·파일명 슬러그·멱등 재실행 등 31개 항목을 확인한다. 실제 인증키 없이 돌아간다.
