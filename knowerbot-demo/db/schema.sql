-- 트레이딩 짐 RAG 학습 콘텐츠 스토어 (Postgres + pgvector)
--
-- 파이프라인: lib/education-content.ts의 글 → education_articles에 시딩
-- → 문단 단위로 education_chunks에 청크 분할 → 임베딩 생성 후
-- education_chunks.embedding 채우기 → 벡터 유사도 검색으로 RAG 조회.
--
-- 임베딩 차원(1536)은 OpenAI text-embedding-3-small 기준 기본값. 다른 임베딩
-- 모델을 쓰면 이 숫자와 아래 인덱스의 vector_cosine_ops를 모델에 맞게 바꿀 것.

create extension if not exists vector;
create extension if not exists pgcrypto; -- gen_random_uuid()

-- 인증(백엔드 backend/ 프로젝트). 실제 소유자는 Hibernate ddl-auto=update이고,
-- 이 정의는 참고용 문서 — 컬럼명/타입을 UserEntity.kt와 맞춰뒀음.
create table users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

-- 실제 KRX 시세(2020-02~04, Yahoo Finance 조회 — 실데이터, 종목 5개).
-- 매매 체결가는 이 테이블에서 서버가 조회해서 결정 — 클라이언트가 가격을 보내지 않음.
create table stock_daily_prices (
  id uuid primary key default gen_random_uuid(),
  stock_code text not null,
  stock_name text not null,
  trade_date date not null,
  open_price numeric not null,
  high_price numeric not null,
  low_price numeric not null,
  close_price numeric not null,
  volume bigint not null default 0,
  unique (stock_code, trade_date)
);

create index stock_daily_prices_code_date_idx on stock_daily_prices (stock_code, trade_date);

create type education_category as enum (
  '기초 개념',
  '리스크 관리',
  '차트 분석',
  '제도와 공시',
  '투자 심리'
);

create table education_articles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  category education_category not null,
  title text not null,
  summary text not null,
  source text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table education_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references education_articles (id) on delete cascade,
  position smallint not null,
  question text not null,
  unique (article_id, position)
);

create table education_quiz_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references education_quiz_questions (id) on delete cascade,
  position smallint not null,
  label text not null,
  is_correct boolean not null default false,
  unique (question_id, position)
);

-- RAG 검색 대상: 글 본문을 문단(또는 문단 몇 개 묶음) 단위로 쪼갠 청크.
create table education_chunks (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references education_articles (id) on delete cascade,
  chunk_index smallint not null,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  unique (article_id, chunk_index)
);

-- 코사인 유사도 기준 근사 최근접 이웃 검색 인덱스.
-- 데이터가 적을 땐(수백~수천 행) 인덱스 없이 순차 스캔도 충분히 빠르니,
-- 콘텐츠 양이 늘어난 뒤에 만들어도 됨.
create index education_chunks_embedding_idx
  on education_chunks
  using hnsw (embedding vector_cosine_ops);

create index education_articles_category_idx on education_articles (category);

-- 예시 쿼리: 사용자 질문 임베딩 $1과 가장 유사한 청크 상위 5개 + 소속 글 정보
--
-- select a.title, a.source, c.content, 1 - (c.embedding <=> $1) as similarity
-- from education_chunks c
-- join education_articles a on a.id = c.article_id
-- order by c.embedding <=> $1
-- limit 5;


-- ============================================================
-- 모의투자 — 유저별 세션(=한 번의 "재도전 루프" 단위) + 매매 로그.
-- 턴 = 일봉 1일 (project_simulation_mechanic 메모리 참고, 실시간 아님).
-- ============================================================

create type simulation_session_status as enum ('active', 'completed');

-- report.metrics + report.habits + report.gamblingSignal을 전부 이 enum 하나로
-- backing함. growth(전후 비교)는 같은 유저의 최근 두 세션을 stat_key로 조인해서 계산.
create type session_stat_key as enum (
  'judgment_accuracy',      -- 판단 정확도
  'disclosure_check_rate',  -- 공시 확인율
  'risk_management_score',  -- 리스크 관리
  'impulsive_trading',      -- 이슈 따라 사기 (뇌동매매)
  'loss_aversion',          -- 손해 보면 못 파는 마음
  'confirmation_bias',      -- 공시 없이 판단하기
  'diversification',        -- 나눠 담는 습관 (몰빵 성향의 반대 프레이밍)
  'gambling_signal'         -- 도박성 매매 신호 — note까지 같이 써서 UI 카드 그대로 backing
);
create type stat_tone as enum ('red', 'amber', 'green');

create table simulation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  status simulation_session_status not null default 'active',
  starting_cash numeric not null,
  current_cash numeric not null,
  current_turn_date date not null, -- 시뮬레이션상 "오늘" 포인터
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index simulation_sessions_user_id_idx on simulation_sessions (user_id);

-- 세션 단위 스탯 스냅샷. 홀딩(보유 종목)은 별도 테이블 없이 이 세션의 trades를
-- 종목별로 합산해서 구함 — 이 프로젝트 규모에서 매번 재계산해도 충분히 가벼움.
create table session_stats (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references simulation_sessions (id) on delete cascade,
  stat_key session_stat_key not null,
  score_pct smallint not null check (score_pct between 0 and 100),
  tone stat_tone not null,
  note text, -- gambling_signal처럼 서술형 카드가 필요한 stat_key만 채움
  computed_at timestamptz not null default now(),
  unique (session_id, stat_key)
);

create type trade_side as enum ('buy', 'sell');
create type trade_type as enum ('normal', 'forced_liquidation'); -- forced_liquidation = 반대매매
create type trade_reason as enum (
  'fundamentals',         -- 실적/공시 근거
  'technical_signal',     -- 기술적 신호
  'stop_loss',            -- 손절
  'averaging_down',       -- 물타기
  'chase_buy',            -- 추격매수
  'impulsive',            -- 뇌동매매(감으로)
  'planned_take_profit',  -- 계획된 익절
  'other'
);

-- 매매 로그 — session_stats는 전부 이 테이블에서 계산해 채움. 매매 시점의 그날
-- 시가/고가/저가를 같이 남겨서, 나중에 외부 KRX 데이터를 다시 조인하지 않고도
-- "추격매수였는지" 같은 판단을 이 행 하나만 보고 할 수 있게 함.
create table trades (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references simulation_sessions (id) on delete cascade,
  stock_code text not null,
  stock_name text not null,
  side trade_side not null,
  trade_type trade_type not null default 'normal',
  is_credit boolean not null default false,
  leverage_ratio numeric, -- is_credit = true일 때만 사용
  quantity integer not null check (quantity > 0),
  price numeric not null,
  day_open_price numeric not null,
  day_high_price numeric not null,
  day_low_price numeric not null,
  viewed_disclosure boolean not null default false, -- 매매 전 공시/재무정보 확인 여부
  reason_tag trade_reason,
  reason_text text,
  simulated_trade_date date not null,
  created_at timestamptz not null default now()
);

create index trades_session_id_idx on trades (session_id);
create index trades_session_stock_idx on trades (session_id, stock_code);

-- AI 실시간 위험 개입 로그 — "위험개입무시율" 스탯의 원천 데이터.
create type risk_intervention_type as enum (
  'excessive_leverage', -- 과도한 레버리지
  'concentration',      -- 몰빵매수
  'chase_buy',          -- 추격매수
  'stop_loss_delay'     -- 손절 지연
);
create type risk_intervention_response as enum ('heeded', 'ignored');

create table risk_interventions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references simulation_sessions (id) on delete cascade,
  trade_id uuid references trades (id) on delete set null, -- 개입 후 실제로 낸 매매(있다면)
  risk_type risk_intervention_type not null,
  message text not null, -- 그 순간 보여준 경고 문구(LLM 생성분 그대로 보관)
  user_response risk_intervention_response not null,
  simulated_trade_date date not null,
  created_at timestamptz not null default now()
);

create index risk_interventions_session_id_idx on risk_interventions (session_id);


-- ============================================================
-- 상황퀴즈 — /quiz 라우트에서 독립적으로 푸는 가정형 판단 퀴즈.
-- 교육 콘텐츠 퀴즈(education_quiz_*)와는 다른 개념(정답이 없음)이지만,
-- 모의투자 세션에 종속되지도 않음 — /simulation과 별개 화면이라 유저 단위로만 기록.
-- ============================================================

create table scenario_quiz_prompts (
  id uuid primary key default gen_random_uuid(),
  headline text not null,
  context text not null,
  feedback_template text not null,
  xp_reward integer not null default 0,
  created_at timestamptz not null default now()
);

create table scenario_quiz_options (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references scenario_quiz_prompts (id) on delete cascade,
  position smallint not null,
  label text not null,
  hint text not null,
  behavior_tag session_stat_key, -- 이 선택지가 어떤 습관 축과 연결되는지(있다면)
  unique (prompt_id, position)
);

create table user_scenario_quiz_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  prompt_id uuid not null references scenario_quiz_prompts (id),
  selected_option_id uuid not null references scenario_quiz_options (id),
  xp_gained integer not null default 0,
  answered_at timestamptz not null default now()
);

create index user_scenario_quiz_responses_user_id_idx on user_scenario_quiz_responses (user_id);


-- ============================================================
-- KnowerBot 채팅 로그 — 전 라우트에 떠 있는 전역 위젯이라 세션에 안 묶고
-- 유저 단위로만 기록. 맞춤 추천 시, 저장된 답변-청크 매핑을 따로 안 두고
-- 유저의 최근 질문을 그때그때 education_chunks에 재검색(RAG)해서 씀 —
-- "무엇을 물어봤는지" 자체가 role='user' 행에 이미 다 있어서 충분함.
-- ============================================================

create type chat_role as enum ('user', 'assistant');

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  role chat_role not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index chat_messages_user_id_idx on chat_messages (user_id, created_at);


-- ============================================================
-- AI 캐릭터 / XP — 세션이 아니라 유저 단위로 누적(재도전해도 안 사라짐).
-- ============================================================

create table ai_characters (
  user_id uuid primary key references users (id) on delete cascade,
  name text not null default 'KnowerBot',
  level smallint not null default 1,
  xp integer not null default 0, -- xp_events 합계의 캐시. 갱신은 앱 로직에서.
  xp_to_next integer not null default 1000,
  tier text not null default '새싹 1단계',
  updated_at timestamptz not null default now()
);

create type xp_source as enum ('simulation', 'pt', 'scenario_quiz', 'education_quiz');

create table xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  source xp_source not null,
  amount integer not null,
  session_id uuid references simulation_sessions (id) on delete set null,
  created_at timestamptz not null default now()
);

create index xp_events_user_id_idx on xp_events (user_id);


-- ============================================================
-- 교육 콘텐츠 — 유저별 진도 / 퀴즈 답변 로그 (education_* 콘텐츠 테이블에 종속).
-- ============================================================

create table user_article_progress (
  user_id uuid not null references users (id) on delete cascade,
  article_id uuid not null references education_articles (id) on delete cascade,
  completed_at timestamptz,
  primary key (user_id, article_id)
);

create table user_quiz_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  question_id uuid not null references education_quiz_questions (id) on delete cascade,
  selected_option_id uuid not null references education_quiz_options (id),
  is_correct boolean not null, -- 응답 시점 스냅샷(문항이 나중에 바뀌어도 기록 보존)
  answered_at timestamptz not null default now()
);

create index user_quiz_answers_user_id_idx on user_quiz_answers (user_id);


-- 예시 쿼리: 유저의 가장 최근 두 세션을 stat_key로 맞춰 growth(전후 비교) 계산
--
-- with ranked as (
--   select id, row_number() over (order by started_at desc) as rn
--   from simulation_sessions
--   where user_id = $1 and status = 'completed'
-- )
-- select curr.stat_key, prev.score_pct as before_pct, curr.score_pct as after_pct
-- from session_stats curr
-- join ranked r_curr on r_curr.id = curr.session_id and r_curr.rn = 1
-- join session_stats prev on prev.stat_key = curr.stat_key
-- join ranked r_prev on r_prev.id = prev.session_id and r_prev.rn = 2;

-- 예시 쿼리: 유저가 오답을 많이 낸 교육 카테고리 top 3 (맞춤 학습 추천 후보)
--
-- select a.category, count(*) filter (where not qa.is_correct) as wrong_count
-- from user_quiz_answers qa
-- join education_quiz_questions q on q.id = qa.question_id
-- join education_articles a on a.id = q.article_id
-- where qa.user_id = $1
-- group by a.category
-- order by wrong_count desc
-- limit 3;
