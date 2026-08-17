-- 모의고사 → 활동데이터 → RAG 퀴즈 스키마 (로컬 trading_gym_rag DB)
--
-- 설계 요지
--   1) 문제지(exam_papers/exam_turns)와 응시(exam_attempts/exam_responses)를 분리한다.
--      같은 모의고사를 여러 명이 풀고, 재응시로 개선 여부를 보려면 콘텐츠와 기록이 따로여야 한다.
--   2) 시세 테이블에 의존하지 않는다. 차트·뉴스·공시를 턴 안에 JSONB로 넣어 문항이 자체 완결이다.
--      (모의고사는 큐레이션된 고정 문제라 실시간 시세가 필요 없고, 데모 안정성이 높다)
--   3) exam_responses.reason_memo가 이 설계의 핵심이다. "왜 그렇게 판단했는지"라는 자유 서술이
--      있어야 단순 정답/오답을 넘어 '어떤 근거로 틀렸는지'를 진단할 수 있고, 그래야 RAG로
--      맞춤 퀴즈를 만들 수 있다. 매매 기록만으로는 "뉴스만 보고 샀다"를 알 수 없다.
--   4) quiz_questions.source_chunk_id가 edu_chunks를 직접 참조한다. 생성된 문제마다
--      "근거: 금감원 실용금융 134쪽"을 확정적으로 붙일 수 있어야 할루시네이션 방어가 된다.

-- ============================================================
-- 투자성향 (온보딩 결과) — 모의고사 응시의 컨텍스트
-- ============================================================

CREATE TABLE IF NOT EXISTS investor_profiles (
  id              SERIAL PRIMARY KEY,
  -- 로컬 데모용 문자열 식별자. 백엔드에 붙일 때 users(id) FK로 교체한다.
  user_key        TEXT NOT NULL UNIQUE,
  risk_type       TEXT NOT NULL CHECK (risk_type IN ('STABLE','NEUTRAL','AGGRESSIVE')),
  knowledge_level TEXT NOT NULL CHECK (knowledge_level IN ('BEGINNER','INTERMEDIATE','ADVANCED')),
  -- 정보습관: 독립적으로 찾아보는가(INDEPENDENT) ~ 리딩방/SNS 의존(DEPENDENT)
  info_habit      TEXT NOT NULL CHECK (info_habit IN ('INDEPENDENT','MIXED','DEPENDENT')),
  risk_score      INT,
  knowledge_score INT,
  info_habit_score INT,
  summary         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 문제지 (콘텐츠 — 사용자 무관, 재사용)
-- ============================================================

CREATE TABLE IF NOT EXISTS exam_papers (
  id            SERIAL PRIMARY KEY,
  code          TEXT UNIQUE NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  difficulty    TEXT NOT NULL DEFAULT 'NORMAL' CHECK (difficulty IN ('EASY','NORMAL','HARD')),
  total_turns   INT NOT NULL,
  starting_cash BIGINT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 턴 = 문항. 사용자는 chart_points + news만 보고 판단하고, disclosure는 '열어봐야' 보인다.
CREATE TABLE IF NOT EXISTS exam_turns (
  id                 SERIAL PRIMARY KEY,
  paper_id           INT NOT NULL REFERENCES exam_papers(id) ON DELETE CASCADE,
  turn_no            INT NOT NULL,
  stock_name         TEXT NOT NULL,          -- 익명 처리한 종목명 (평판 이슈 회피)
  sector             TEXT,
  as_of_date         DATE NOT NULL,          -- 판단 시점
  price              BIGINT NOT NULL,        -- 판단 시점 주가
  holding_qty        INT NOT NULL DEFAULT 0, -- 이 턴 시작 시 보유 수량 (매도 문항용)
  avg_buy_price      BIGINT,                 -- 보유 중이면 평단가
  chart_points       JSONB NOT NULL,         -- [{"d":"2021-03-02","c":11200}, ...] 판단 시점까지만
  news               JSONB NOT NULL,         -- [{"tag":"리딩방","title":"..."}, ...]
  disclosure         JSONB,                  -- {"rows":[{"label","value","tone"}],"note":"..."}
  -- 응답 제출 후 공개되는 정답 영역
  outcome_points     JSONB NOT NULL,         -- 판단 이후 실제 흐름
  outcome_change_pct NUMERIC(6,2) NOT NULL,
  outcome_summary    TEXT NOT NULL,
  ideal_action       TEXT NOT NULL CHECK (ideal_action IN ('BUY','SELL','HOLD')),
  ideal_rationale    TEXT NOT NULL,
  learning_point     TEXT NOT NULL,          -- 이 문항이 겨냥한 학습 포인트
  UNIQUE (paper_id, turn_no)
);

-- ============================================================
-- 응시 기록 (사용자별)
-- ============================================================

CREATE TABLE IF NOT EXISTS exam_attempts (
  id               SERIAL PRIMARY KEY,
  paper_id         INT NOT NULL REFERENCES exam_papers(id),
  user_key         TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS','COMPLETED')),
  current_turn_no  INT NOT NULL DEFAULT 1,
  starting_cash    BIGINT NOT NULL,
  final_return_pct NUMERIC(6,2),
  aligned_count    INT,                      -- 모범답안과 일치한 턴 수
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS exam_attempts_user_idx ON exam_attempts (user_key, started_at DESC);

-- 턴별 응답. reason_memo(왜 그렇게 판단했는지)가 퀴즈 생성의 원재료다.
CREATE TABLE IF NOT EXISTS exam_responses (
  id                SERIAL PRIMARY KEY,
  attempt_id        INT NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  turn_id           INT NOT NULL REFERENCES exam_turns(id),
  action            TEXT NOT NULL CHECK (action IN ('BUY','SELL','HOLD')),
  quantity          INT,
  reason_memo       TEXT NOT NULL,           -- 자유 서술 (필수)
  viewed_disclosure BOOLEAN NOT NULL DEFAULT false,
  seconds_spent     INT,
  is_aligned        BOOLEAN,                 -- ideal_action과 일치했는가
  responded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, turn_id)
);

-- ============================================================
-- 진단 — 응답을 패턴으로 요약. 각 패턴은 edu_chunks 검색 질의를 들고 있다.
-- ============================================================

CREATE TABLE IF NOT EXISTS exam_diagnoses (
  id          SERIAL PRIMARY KEY,
  attempt_id  INT NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  pattern_key TEXT NOT NULL,
  severity    TEXT NOT NULL CHECK (severity IN ('HIGH','MEDIUM','LOW')),
  hit_count   INT NOT NULL,
  -- 어느 턴의 어떤 메모 때문에 이 패턴으로 봤는지 — 퀴즈 프롬프트와 UI 설명에 그대로 쓴다.
  evidence    JSONB NOT NULL,
  rag_query   TEXT NOT NULL,                 -- 이 패턴으로 edu_chunks를 검색할 자연어 질의
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, pattern_key)
);

-- ============================================================
-- RAG 퀴즈
-- ============================================================

CREATE TABLE IF NOT EXISTS quiz_sets (
  id         SERIAL PRIMARY KEY,
  attempt_id INT NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  user_key   TEXT NOT NULL,
  generator  TEXT NOT NULL,                  -- stub | anthropic:모델명 등
  headline   TEXT,                           -- "뉴스만 보고 산 판단이 3번 있었어요"
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quiz_sets_attempt_idx ON quiz_sets (attempt_id);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id               SERIAL PRIMARY KEY,
  set_id           INT NOT NULL REFERENCES quiz_sets(id) ON DELETE CASCADE,
  position         INT NOT NULL,
  pattern_key      TEXT NOT NULL,            -- 어떤 진단에서 나온 문제인지
  related_turn_id  INT REFERENCES exam_turns(id),  -- 어떤 판단이 계기였는지
  question         TEXT NOT NULL,
  explanation      TEXT NOT NULL,
  why_this_question TEXT,                    -- "3턴에서 이렇게 적으셨기 때문이에요"
  -- ★ RAG 근거. 문제마다 어느 자료 몇 쪽에서 나왔는지 확정적으로 남긴다.
  source_chunk_id   INT REFERENCES edu_chunks(id),
  source_title      TEXT,
  source_org        TEXT,
  source_page_start INT,
  source_page_end   INT,
  source_score      NUMERIC(5,4),
  UNIQUE (set_id, position)
);

CREATE TABLE IF NOT EXISTS quiz_options (
  id          SERIAL PRIMARY KEY,
  question_id INT NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  position    INT NOT NULL,
  label       TEXT NOT NULL,
  is_correct  BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (question_id, position)
);

CREATE TABLE IF NOT EXISTS quiz_responses (
  id                 SERIAL PRIMARY KEY,
  question_id        INT NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  selected_option_id INT NOT NULL REFERENCES quiz_options(id),
  is_correct         BOOLEAN NOT NULL,
  answered_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (question_id)
);
