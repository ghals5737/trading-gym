# 트레이딩 짐 — RAG 활용 기능 정리

두 기능(채팅 RAG 검색, 맞춤 퀴즈 자동생성) 모두 `edu-rag-indexer`(파이썬, 별도 프로세스 `web_search.py` :8123)의 `/api/search`를 같이 씀. 임베딩 모델(bge-m3)이 파이썬 전용 라이브러리라 백엔드(Kotlin)는 이 검색을 항상 **HTTP로만** 호출함 — RAG 자체를 백엔드가 들고 있지 않음.

공통 원칙: **검색이 항상 먼저, 확정적으로 일어남.** LLM이 "검색할지 말지"를 스스로 판단하는 agentic 방식이 아니라, 백엔드가 매번 검색부터 하고 그 결과를 프롬프트에 강제로 끼워 넣음. 순서: `백엔드 → 파이썬(벡터 검색) → 백엔드 → LLM → 백엔드`.

## 1. 채팅 중 RAG 검색 (KnowerBot 자유 대화)

`ChatService.sendMessage()`가 매 메시지마다 아래 순서로 처리함.

| 단계 | 담당 | 하는 일 |
|---|---|---|
| 1 | `SearchQueryRewriter` | 유저 메시지를 독립적인 검색어로 변환 |
| 2 | `EducationSearchClient` | 그 검색어로 RAG 검색 |
| 3 | `ChatReplyGenerator` | 검색 결과를 근거로 답변 생성 |
| 4 | `ChatService.buildSourceFootnote()` | 실제 사용된 근거를 출처 각주로 결정적으로 붙임 |

### 1-1. 검색어 재작성 (`SearchQueryRewriter`)

"그거 왜 위험한데?"처럼 대명사만 있는 메시지를 그대로 검색하면 헛돔 — 최근 대화 6턴을 참고해서 독립적인 검색어로 먼저 바꿈.

```kotlin
val searchQuery = searchQueryRewriter.rewrite(recentHistory, text)
```

프롬프트(`SearchQueryRewritePrompt.build`) 핵심 규칙:
- 대명사·접속사는 실제로 가리키는 대상으로 치환
- 인사말·감탄사·잡담 제거, 핵심 주제만 남김
- 5~20자 명사구로, 문장 아님
- 잡담이면 원문 그대로 짧게 반환해도 됨

실패하거나 응답이 이상하면(`SearchQueryRewritePrompt.parse`) 원래 메시지를 그대로 검색어로 씀(`fallback`) — 재작성 이전 동작으로 안전하게 폴백.

### 1-2. RAG 검색 (`EducationSearchClient`)

```kotlin
val ragContext = educationSearchClient.search(searchQuery)
```

- `GET {base-url}/api/search?q={query}&top_k=3` — 파이썬이 bge-m3로 임베딩 후 `edu_chunks.embedding`과 코사인 유사도 top-k 반환
- 유사도 `0.5` 미만은 버림(`MIN_RELEVANT_SCORE`) — 실측 기준 관련 질의는 0.68~0.77, 약한 주제도 0.56~0.58, 무관하면 그보다 훨씬 낮음
- edu-rag-indexer가 죽어있거나 결과가 없으면 빈 리스트 → 근거 없이 평소처럼 답변(예외를 여기서 흡수, 위로 안 던짐)
- 쿼리 파라미터는 `.uri("/api/search?q={q}&top_k={topK}", query, topK)` 템플릿 플레이스홀더로 넘김(직접 URL 인코딩해서 문자열로 끼워넣으면 RestClient가 이중 인코딩함 — 실제로 겪었던 버그)

### 1-3. 답변 생성 + 출처 각주

```kotlin
val replyText = chatReplyGenerator.reply(recentHistory, text, ragContext)
val fullReplyText = replyText + buildSourceFootnote(ragContext)
```

출처 표기는 LLM이 답변 본문에 알아서 인용하게 맡기지 않음(생략할 때가 있었음) — `buildSourceFootnote()`가 **실제로 검색에 쓰인 자료 목록**을 가지고 항상 같은 형식(`📚 참고 자료`)으로 결정적으로 붙임. 같은 문서에서 나온 여러 청크는 한 줄로 묶어서 보여줌(안 그러면 "134쪽", "134-135쪽"처럼 중복 표시됨).

## 2. 맞춤 퀴즈 자동생성 (`/pt` "오늘의 PT")

`QuizGenerationService.generateForUser()`가 아래 순서로 처리함.

| 단계 | 하는 일 |
|---|---|
| 1 | `AggregateStatService`로 유저의 `session_stats` 평균 중 가장 낮은 지표 선정 |
| 2 | 그 지표를 고정 매핑 테이블로 자연어 검색어로 변환 |
| 3 | `EducationSearchClient.search()`로 RAG 검색 (top 3) |
| 4 | `QuizGenerator.generate()`로 LLM 문제 생성 |
| 5 | 파싱 후 `PersonalizedQuiz` + `PersonalizedQuizOption` 4개로 저장 |

### 2-1. 약점 지표 → 검색어 (고정 매핑, 개인화 아님)

```kotlin
val label = STAT_LABEL.getValue(weakest.statKey)
val searchQuery = STAT_SEARCH_QUERY.getValue(weakest.statKey)
```

`weakest.statKey`(어떤 지표가 약한지)는 유저마다 실제 데이터로 동적 계산되지만, **그 지표를 뭐라고 검색할지는 8개 중 하나로 고정된 문장**임 — 같은 지표가 약점으로 나온 유저는 전부 같은 검색어로 검색됨. 유저가 왜 그 점수를 받았는지(`session_stats.note`)는 검색어에 반영 안 됨.

| statKey | 검색어 |
|---|---|
| `JUDGMENT_ACCURACY` | 투자 판단을 정확하게 하는 방법 |
| `DISCLOSURE_CHECK_RATE` | 매수 전 공시를 확인해야 하는 이유 |
| `RISK_MANAGEMENT_SCORE` | 레버리지 신용거래 리스크 관리 |
| `IMPULSIVE_TRADING` | 충동매매 뇌동매매 위험성 |
| `LOSS_AVERSION` | 손실 회피 손절 기준 |
| `CONFIRMATION_BIAS` | 확증편향 투자 판단 |
| `DIVERSIFICATION` | 분산투자를 해야 하는 이유 |
| `GAMBLING_SIGNAL` | 손실 후 베팅을 키우는 도박성 매매 |

### 2-2. 문제 생성 프롬프트 (`QuizGenerationPrompt`)

라인 프리픽스 형식으로 출력을 강제함(JSON보다 LLM이 형식을 안정적으로 지킴 — 이 세션 전반에 쓰인 컨벤션).

```
QUESTION: <문제 한 문장>
OPTION1: <보기1>
OPTION2: <보기2>
OPTION3: <보기3>
OPTION4: <보기4>
CORRECT: <정답 번호, 1~4 중 하나만>
EXPLANATION: <정답 해설 2~3문장>
```

- 자료에 실제로 나온 내용만 근거로 삼도록 지시(지어내지 말 것)
- 세션이 하나도 없으면(`stats`가 빈 리스트) 400 에러 — "스파링을 먼저 끝내주세요"

### 2-3. 정답 미노출 설계

`PersonalizedQuizOptionResponse`에는 `isCorrect` 필드 자체가 없음 — 풀기 전에 정답이 API 응답에 노출되지 않도록 DTO 레벨에서 아예 뺌. `POST /api/quiz/{id}/answer`를 호출해야만 서버가 채점해서 정답 여부를 알려줌.

### 2-4. 관련 기능

- **다시 풀기**: 지난 퀴즈를 다시 불러와 `answer()`가 `answeredOptionId`를 덮어씀(재채점)
- **지표별 이력**: `GET /api/quiz/history`로 지금까지 만든 모든 퀴즈를 `targetStatKey`별로 그룹핑해서 보여줌

## 3. 자료실(`/library`)과의 관계 — RAG 검색은 아니지만 같은 데이터 기반

자료실은 실시간 RAG 검색을 쓰지 않고, `edu-rag-indexer/articlegen.py`가 **미리 배치로** `edu_pages`(오버랩 없는 원문)를 LLM 2단계(주제 구간 감지 → 블로그 글 재작성)로 가공해 `edu_articles`에 저장해둔 걸 그대로 보여줌. 이 글들도 `target_stat_key`로 태깅되어 있어서, 위 8개 지표로 자료실 글을 필터링할 수 있음 — 맞춤 퀴즈가 검색으로 근거를 찾아오는 것과 달리, 자료실은 지표별로 미리 분류해둔 읽을거리를 보여주는 방식.

## 4. 관련 파일

| 역할 | 파일 |
|---|---|
| RAG 검색 HTTP 클라이언트 | `backend/.../service/EducationSearchClient.kt` |
| 채팅 서비스(RAG 진입점) | `backend/.../service/ChatService.kt` |
| 검색어 재작성 어댑터 | `backend/.../service/ai/SearchQueryRewriter.kt`, `SearchQueryRewritePrompt.kt` |
| 퀴즈 생성 서비스 | `backend/.../service/QuizGenerationService.kt` |
| 퀴즈 생성 어댑터 | `backend/.../service/ai/QuizGenerator.kt`, `QuizGenerationPrompt.kt` |
| RAG 검색 서버(파이썬) | `edu-rag-indexer/web_search.py` |
| 자료실 배치 글 생성(파이썬) | `edu-rag-indexer/articlegen.py` |
