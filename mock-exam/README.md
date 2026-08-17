# mock-exam — 모의고사 → 행동진단 → RAG 맞춤 퀴즈

모의고사를 풀게 하고, **왜 그렇게 판단했는지 적은 메모**를 분석해 행동 습관을 진단한 뒤,
`edu_chunks`(금융교육 자료 벡터 DB)에서 근거를 찾아 맞춤 퀴즈를 만드는 파이프라인.

대상 DB는 **로컬 `trading_gym_rag`** (RDS 아님).

```
모의고사 응시 ──▶ 진단 ──▶ RAG 검색 ──▶ 퀴즈 생성 ──▶ 저장
 (판단 + 메모)    (메모에서    (edu_chunks    (LLM/stub)   (근거 chunk_id
                  패턴 추출)    벡터 검색)                   함께 고정)
```

## 왜 메모가 핵심인가

매매 기록만 보면 "1턴에 매수했다"까지만 알 수 있다. 하지만 **왜 샀는지**를 모르면
같은 오답이라도 원인이 다른 걸 구분할 수 없다.

| 같은 "매수" 판단 | 메모 | 진단 | 찾아오는 자료 |
|---|---|---|---|
| 1턴 종목 A | "리딩방에서 마지막 기회라고 해서" | NEWS_CHASING | 정보 검증 없이 추천만 믿는 위험 |
| 3턴 종목 C | "평단가를 낮추려고" | LOSS_AVERSION | 손절 기준과 물타기의 위험 |
| 4턴 종목 D | "다들 사는 분위기라 그냥 느낌이" | HERD_FOLLOWING + NO_RATIONALE | 군중심리·테마주 과열 |

메모가 있어야 이 구분이 가능하고, 그래야 사람마다 다른 문제가 나온다.

## 실행

```bash
# 0) 스키마 + 목업 데이터
psql -d trading_gym_rag -f schema.sql
psql -d trading_gym_rag -f seed.sql          # 문제지 5턴
psql -d trading_gym_rag -f seed_attempt.sql  # 초보자 전형 응시 기록

# 1) 진단만 보기
DATABASE_URL='postgresql:///trading_gym_rag' \
  ../edu-rag-indexer/.venv/bin/python quizgen.py --user demo --diagnose

# 2) 퀴즈 생성 (ANTHROPIC_API_KEY 있으면 LLM, 없으면 stub)
DATABASE_URL='postgresql:///trading_gym_rag' \
  ../edu-rag-indexer/.venv/bin/python quizgen.py --user demo

# 3) 생성된 퀴즈 조회
DATABASE_URL='postgresql:///trading_gym_rag' \
  ../edu-rag-indexer/.venv/bin/python quizgen.py --user demo --show

# 4) 프론트용 JSON 추출
DATABASE_URL='postgresql:///trading_gym_rag' \
  ../edu-rag-indexer/.venv/bin/python export_mock.py
```

임베딩·벡터검색은 `../edu-rag-indexer/lib`를 그대로 재사용한다(중복 구현 방지).

## 테이블 구조

**문제지와 응시를 분리**했다. 같은 모의고사를 여러 명이 풀고, 재응시로 개선 여부를
봐야 하기 때문이다.

```
investor_profiles   투자성향 (온보딩 결과) — 응시의 컨텍스트

exam_papers         모의고사 1회분
  └ exam_turns      턴 = 문항. 차트·뉴스·공시를 JSONB로 자체 보유(시세 테이블 불필요)

exam_attempts       응시
  └ exam_responses  턴별 응답 + reason_memo(★) + viewed_disclosure
  └ exam_diagnoses  진단된 패턴 + evidence(근거 메모) + rag_query

quiz_sets           응시 1회 → 퀴즈 세트
  └ quiz_questions  문항 + source_chunk_id → edu_chunks(★ 근거 고정)
      └ quiz_options
      └ quiz_responses
```

설계상 눌러둔 지점 세 가지:

1. **턴이 자체 완결적이다.** 차트·뉴스·공시가 행 안에 JSONB로 있어 시세 테이블에
   의존하지 않는다. 모의고사는 큐레이션된 고정 문제라 실시간 시세가 필요 없고,
   API 장애·장 마감과 무관하게 데모가 된다.
2. **정답 영역이 분리돼 있다.** `outcome_*`·`ideal_*`은 응답 제출 후에만 노출한다.
   프론트에서 이 필드를 제출 전에 렌더하면 안 된다.
3. **`quiz_questions.source_chunk_id`가 `edu_chunks`를 직접 참조한다.** 문제마다
   "근거: 금감원 실용금융 159–160쪽"을 확정적으로 붙일 수 있어야 할루시네이션 방어가 된다.

## 진단 패턴

메모의 표현 + 행동으로 판정하는 규칙 기반이다. LLM이 아니라 규칙이라 **왜 그렇게
진단했는지 항상 설명할 수 있다**(심사 방어용). 패턴 정의는 `quizgen.py`의 `PATTERNS`에 있다.

| 패턴 | 감지 신호 | RAG 검색 질의 |
|---|---|---|
| `NEWS_CHASING` | 리딩방·추천·마지막 기회·실검 + 매수 | 정보를 검증하지 않고 추천만 믿고 매수하는 위험 |
| `HERD_FOLLOWING` | 다들·분위기·뒤처·인증 + 매수 | 군중심리와 과열된 테마주의 위험 |
| `PANIC_SELL` | 무서·불안·더 떨어질 + 매도 | 급락장에서 공포에 파는 심리와 대응 |
| `LOSS_AVERSION` | 평단·물타기·손실이 확정·버티 | 손절 기준 세우기와 물타기 회피 |
| `NO_RATIONALE` | 느낌·그냥·왠지 | 투자 판단 기준 세우기 |
| `DISCLOSURE_IGNORED` | 매수의 50%+ 에서 공시 미열람 | 재무제표·공시 확인 방법 |

심각도는 **틀린 판단 수**로 매긴다(2회 이상 HIGH). 패턴이 여러 개 잡히면 심각한 것부터
`--max-questions`(기본 3)개만 문제로 만든다.

## 목업 데이터

`seed.sql`의 5턴은 각각 다른 실수를 유도하도록 짰다. 종목명은 전부 익명 처리했다.

| 턴 | 상황 | 모범답안 | 결과 | 유도하는 실수 |
|---|---|---|---|---|
| 1 | 급등주 + 리딩방 "마지막 기회" (공시엔 적자·CB) | HOLD | -42% | 추격매수 |
| 2 | 급락장 우량주 (공시는 무차입·실적개선) | HOLD | +72% | 공포매도 |
| 3 | 보유종목 -18% + "평단 낮추세요" | SELL | -45% | 물타기 |
| 4 | 테마주 3주 +155% + 실검 1위 | HOLD | -63% | 군중심리 |
| 5 | 조용한 실적개선주 (분위기 최악) | BUY | +36% | 공시를 봐야 정답 |

`seed_attempt.sql`은 "리딩방 의존 초보자"가 5턴 중 4턴을 틀리는 응시 기록이다.
실행하면 진단 6개가 잡히고 퀴즈 3문항이 생성된다.

## 프론트 연동

`export_mock.py`가 `mock-data.json`을 만든다. 백엔드 API가 붙기 전까지 프론트는 이
파일을 import해서 화면을 만들면 되고, API가 생기면 같은 모양의 응답으로 갈아끼우면 된다
(그래서 필드명을 API 응답 가정으로 camelCase로 맞춰뒀다).

```jsonc
{
  "profile":  { "riskType": "AGGRESSIVE", "infoHabit": "DEPENDENT", ... },
  "paper":    { "title": "첫 모의고사 · 판단의 근거 찾기", "totalTurns": 5, ... },
  "turns":    [ { "turnNo": 1, "chartPoints": [...], "news": [...],
                  "disclosure": {...},          // '공시 보기' 눌렀을 때만 노출
                  "outcome": {...} } ],          // 제출 후에만 노출
  "attempt":  { "responses": [ { "action": "BUY", "reasonMemo": "...", ... } ] },
  "diagnoses":[ { "patternKey": "HERD_FOLLOWING", "severity": "HIGH", "evidence": [...] } ],
  "quizSet":  { "headline": "...", "questions": [ { "source": { "title", "pageStart" }, ... } ] }
}
```

### 화면 흐름 제안

```
[모의고사 진행]  차트 + 뉴스 3건 ─┬─ [공시 보기] (열람 여부를 기록 → 진단에 사용)
                                 └─ 매수 / 매도 / 관망 선택
                                    + 메모칸 "왜 그렇게 판단했나요?" (필수, 20자 이상 권장)
                                    ↓ 제출
[결과 공개]      이후 실제 주가 흐름 + 모범답안 + 학습 포인트
                                    ↓ 5턴 반복
[진단 리포트]    "남들 따라 사기 습관이 3번 보였어요" + 근거가 된 내 메모 인용
                                    ↓
[맞춤 퀴즈]      3문항 + 각 문항에 "왜 이 문제인지" + 근거 자료 쪽수
```

메모칸은 **필수**로 두는 게 좋다. 이게 없으면 진단이 행동 통계 수준으로 떨어지고,
"내 메모를 읽고 만든 문제"라는 이 서비스의 차별점이 사라진다.

## 현재 검증된 결과

목업 응시(5턴 중 4턴 오답, 공시 1회 열람) 기준:

- 진단 6개 — HERD_FOLLOWING/DISCLOSURE_IGNORED/NEWS_CHASING(HIGH), PANIC_SELL/LOSS_AVERSION/NO_RATIONALE(MEDIUM)
- 퀴즈 3문항, 각각 다른 턴을 인용(4턴·3턴·1턴)하고 근거 자료가 붙음
  - 공시 확인 문제 → 금감원 실용금융 159–160쪽 (유사도 0.696)
  - 추격매수 문제 → 금감원 실용금융 169–170쪽 (유사도 0.588)
  - 군중심리 문제 → 금감원 실용금융 543–544쪽 (유사도 0.551)

## 남은 것

- **LLM 생성 미검증** — `ANTHROPIC_API_KEY`가 없어 stub 경로만 확인했다. 키를 넣으면
  같은 파이프라인에서 LLM이 사용자의 실제 메모를 인용한 문제를 만든다(프롬프트는
  `build_prompt()`, 형식 검증은 `validate()`가 하고 실패 시 stub으로 자동 폴백).
- **자료 편중** — 3문항 모두 금감원 실용금융에서 나왔다. 자료가 3종뿐이라 그렇고,
  특히 군중심리 쪽은 유사도 0.55로 낮은 편이다. 자료를 늘리면 개선된다.
- **백엔드 이식** — 지금은 파이썬 CLI다. Kotlin 백엔드에 붙일 때 진단 로직(규칙)은
  그대로 옮기고, 벡터 검색만 `edu-rag-indexer/web_search.py`의 `/api/search`를 호출하면 된다.
