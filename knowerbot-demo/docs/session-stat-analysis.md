# 트레이딩 짐 — 모의투자 세션 스탯 채점(AI) 정리

모의투자 세션 하나가 끝나면(`completeSession`) `SessionSummaryService.finalizeAndPersistStats()`가 그 세션의 8개 세부 지표를 AI로 한 번에 채점해서 `session_stats`에 영구 저장함. 이 문서는 이때 **LLM에게 실제로 뭘 넘기고, 프롬프트가 어떻게 생겼는지**를 정리함.

파이프라인: `DB(trades/turn_logs/news) → SessionSummaryService(순수 코드) → SessionStatAnalysisPrompt(순수 코드, 자연어 조립) → LLM 호출 1번 → SessionStatAnalysisPrompt.parse()`. AI가 관여하는 건 딱 한 단계뿐 — 데이터를 모으고 문장으로 조립하는 건 전부 결정론적 코드임.

## 1. 자료 — 어디서 뭘 골라오나

`SessionSummaryService.getSessionSummary()`가 `trades` + `turn_logs` + `stock_news`를 턴 단위로 합쳐서 `SessionSummaryResponse`(Kotlin data class)를 만듦. **JSON으로 넘기지 않고**, 이 객체를 바로 다음 단계에서 자연어 문장으로 풀어씀.

### 1-1. 세션 요약 (한 줄)

시작자금, 최종자산, 수익률, 총 턴수, 매매건수(매수/매도), 관망턴수, 반대매매횟수, 신용거래건수, 거래종목수, 매수 중 공시확인건수.

### 1-2. 턴별 원본 기록 — 매매마다 `trades` 테이블에서 9개 필드만 추림

`trades` 테이블 원본 컬럼(`id, stockCode, orderType, limitPrice, filled, price, dayOpenPrice, dayHighPrice, dayLowPrice, isCredit, leverageRatio, tradeType, viewedDisclosure, reasonText, turnNumber, simulatedTradeDate, createdAt` 등) 중 행동 판단에 필요한 것만 `Trade.toSummary()`가 골라서 `TradeSummaryResponse`로 추림:

| 보내는 필드 | 빼는 필드 | 빼는 이유 |
|---|---|---|
| `side`, `stockName`, `quantity`, `price` | `id`, `stockCode`(원본 코드) | DB 식별자·중복 정보 |
| `isCredit`, `leverageRatio` | `orderType`, `limitPrice`, `filled` | 체결된 것만 프롬프트에 나오니 주문 방식 자체는 불필요 |
| `tradeType`(반대매매 여부만 사용) | `dayOpenPrice`/`dayHighPrice`/`dayLowPrice` | 그날 가격 범위는 행동 판단과 무관 |
| `viewedDisclosure`, `reasonText` | `turnNumber`, `simulatedTradeDate`, `createdAt` | 이미 턴 블록 헤더에 나와서 중복 |

`reasonText`는 유저가 매매할 때 KnowerBot이 "왜 샀어요?"라고 물어서 받은 자유 텍스트 원문 — AI가 지어내는 게 아니라 실제 유저 입력을 그대로 인용부호 안에 끼워 넣음. 관망(HOLD) 턴도 같은 방식으로 `holdReason`이 매매 없는 턴에 기록됨.

### 1-3. 뉴스

그 턴이 걸쳐 있던 기간(직전 턴 날짜 다음날 ~ 이 턴 날짜) 안에 실제로 있었던 뉴스 전부(`stock_news`, 종목 무관) — `TurnLogDtos.kt`/`SimulationService.newsForTurnPeriod()` 참고. 뉴스가 났는데 매매 이유에 반영이 안 됐는지, 아니면 뉴스에 휩쓸려 충동적으로 반응했는지 AI가 참고하라고 프롬프트에서 명시적으로 지시함.

## 2. 자연어 변환 — `SessionStatAnalysisPrompt.build()` / `toPromptBlock()`

전부 코틀린 문자열 템플릿(`"""..."""` + `${변수}` 보간, `if/else`, `joinToString`)이지 LLM 호출이 아님. 실제로 프롬프트에 들어가는 턴 한 줄 예시:

```
[턴 1] 2025-09-15 (TRADED)
  - BUY 삼천당제약 20주 @ 211000원(신용 3.0배) · 공시확인 안함 · 이유: "친구가 단톡방에서 삼천당제약 무조건 오른다고 해서 신용까지 써서 바로 샀어요"

[턴 2] 2025-09-22 (HELD)
  (매매 없음)
  📰 (2025-09-22 000250) 삼천당제약 강세…신약 기대감에 매수세
```

## 3. 완성된 프롬프트 전체 구조

```
너는 '트레이딩 짐'이라는 모의투자 교육 서비스의 AI 코치야. 사용자가 방금 끝낸 모의투자
세션 하나를 턴 순서대로 아래에 줄게(관망한 턴도 포함, 각 매매마다 사용자가 직접 쓴
이유 텍스트도 같이 있어). 일부 턴에는 그 기간에 실제로 있었던 뉴스(📰)도 같이
붙어있으니, 그 뉴스가 났는데도 매매 이유에 반영이 안 됐는지, 아니면 뉴스에 휩쓸려
충동적으로 반응했는지도 판단에 참고해줘. 이걸 다 읽고 8개 지표를 각각 0~100점으로
채점해줘.

세션 요약: 시작자금 {startingCash}원, 최종자산 {finalPortfolioValue}원
(수익률 {returnPct}%), 총 {turnCount}턴, 매매 {totalTradeCount}건
(매수 {buyCount}/매도 {sellCount}), 관망 턴 {holdTurnCount}회,
반대매매 {forcedLiquidationCount}회, 신용거래 {creditTradeCount}건,
거래한 종목 수 {uniqueStockCount}개, 매수 중 공시확인 {disclosureCheckedBuyCount}건.

턴별 기록:
{턴별 블록 전부 — 위 2번 형식}

아래 8개 지표를 각각 판단해서 채점해줘 — 전부 "값이 높을수록 바람직한 투자 습관"
방향으로 통일해서 채점해(예: 위험 신호가 적으면 높은 점수). reasonText도 꼭 같이
읽고 판단에 반영해:
판단 정확도(JUDGMENT_ACCURACY), 공시 확인율(DISCLOSURE_CHECK_RATE),
리스크 관리(RISK_MANAGEMENT_SCORE), 충동매매 억제(IMPULSIVE_TRADING),
손실회피 성향 억제(LOSS_AVERSION), 확증편향 억제(CONFIRMATION_BIAS),
분산투자(DIVERSIFICATION), 도박성 매매 신호 억제(GAMBLING_SIGNAL)

아래 형식 그대로만, 8줄만 출력해(다른 말 절대 덧붙이지 마):
JUDGMENT_ACCURACY: <0~100 점수> | <한 문장 이유>
DISCLOSURE_CHECK_RATE: <0~100 점수> | <한 문장 이유>
... (8개 키 전부 같은 형식)
```

출력을 JSON이 아니라 `KEY: 점수 | 이유` 라인 형식으로 강제하는 이유는 이 프로젝트 전반의 컨벤션 — LLM이 JSON보다 이 형식을 더 안정적으로 지킴(퀴즈 생성 프롬프트도 동일한 이유로 라인 프리픽스 씀, `rag-features.md` 참고).

## 4. 실제 호출 + 파싱

- 활성 프로바이더가 `codex-cli`면 `CodexCli.run(prompt, timeoutSeconds=90)`이 `codex exec --skip-git-repo-check --sandbox read-only --output-last-message <file> <prompt>`를 서브프로세스로 실행(ChatGPT 로그인 기반, API 과금과 무관). anthropic/openai/gemini/stub 어댑터도 있음(`ai.provider` 설정).
- 응답은 `SessionStatAnalysisPrompt.parse()`가 정규식(`"${key.name}\s*[:=]?\s*(\d{1,3})\s*\|\s*(.+)"`)으로 8줄을 관대하게 찾아 파싱. 8개 다 못 찾으면 `null` 반환.
- 파싱 실패하거나 LLM 호출 자체가 실패하면 `fallbackResult()`로 대체 — 숫자로 바로 계산 가능한 3개(공시확인율, 분산투자, 반대매매 기반 리스크관리)는 룰 기반으로 정확히 채우고, reasonText 해석이 필요한 나머지 5개는 중립값 50점 + "지금은 AI 분석을 만들지 못했어요" 문구로 채움.

## 5. 이후 계산 (참고, 이 문서 범위 밖)

이 AI 채점 결과(8개 세부 지표)는 이후 두 곳에서 순수 코드로 추가 가공됨 — 여기부턴 LLM 호출 없음:

- **3개 성향 카테고리(정확성/침착성/공격성)**: `SessionStatCategoryMapper`가 8개를 고정 매핑으로 묶어 평균(공격성은 일부 지표를 100-score로 뒤집어서 평균 — 세부는 코드 주석 참고)
- **퀴즈 정답 반영**: `AggregateStatService`가 유저의 전체 세션 평균에 답한 퀴즈의 정답 여부(정답=100/오답=0 표본, 세션 표본 대비 절반 가중치)까지 가중평균으로 합쳐서 "학습으로 스탯을 보완"하는 루프를 만듦

## 6. 관련 파일

| 역할 | 파일 |
|---|---|
| 세션 자료 조립(트리거: `completeSession`) | `backend/.../service/SessionSummaryService.kt` |
| 프롬프트 조립 + 파싱 + 폴백 (공용) | `backend/.../service/ai/SessionStatAnalysisPrompt.kt` |
| 세션→DTO 매핑(`Trade.toSummary()` 등) | `backend/.../service/SessionSummaryService.kt` 하단 |
| codex-cli 서브프로세스 호출 | `backend/.../service/ai/CodexCli.kt` |
| 채점 어댑터(5종) | `backend/.../service/ai/*SessionStatAnalyzer.kt` |
| 저장 테이블 | `session_stats`(세부 8개), `session_stat_categories`(카테고리 3개) |
| 3개 카테고리 매핑 | `backend/.../service/SessionStatCategoryMapper.kt` |
| 퀴즈 정답 반영 집계 | `backend/.../service/AggregateStatService.kt` |
