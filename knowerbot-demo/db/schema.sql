-- 트레이딩 짐 DB 스키마 (Postgres)
--
-- 실제 소유자는 백엔드(backend/)의 Hibernate ddl-auto=update이고, 이 파일은
-- 참고용 문서 — 새 환경에 DB를 세팅하거나 구조를 한눈에 보고 싶을 때 씀.
-- 2026-08-14 기준 실제 운영 중인 DB를 pg_dump로 그대로 뽑아서 정리한 것.
-- (직접 여기 CREATE TABLE을 고쳐도 실제 스키마엔 반영 안 됨 — 백엔드 엔티티를
-- 고치고 ddl-auto=update가 반영하게 하거나, 컬럼 추가/제약조건 변경처럼
-- Hibernate가 못 하는 변경은 psql로 직접 ALTER 후 이 파일도 같이 갱신할 것.)

create extension if not exists pgcrypto; -- gen_random_uuid()

-- ============================================================
-- 인증
-- ============================================================

create table users (
  id uuid primary key default gen_random_uuid(),
  username varchar(255) unique not null,
  password_hash varchar(255) not null,
  -- 첫 방문 가이드 투어(ProductTour)를 본 적 있는지 — 계정 단위로 기억해서
  -- 다른 기기·브라우저로 로그인해도 한 번 본 사람에겐 다시 안 뜸.
  has_seen_product_tour boolean not null default false,
  created_at timestamptz not null
);

-- ============================================================
-- 사전조사(온보딩) — 유저당 1행, 재진단하면 덮어씀(이력 없음).
-- 문항 10개가 세 축(리스크/지식/정보습관)으로 나뉘어 채점됨 — docs/stats.md 참고.
-- ============================================================

create table investor_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users (id),
  -- 문항별 원점수(1~4점, AI가 자유 텍스트 답변을 옵션에 매칭해 채점)
  investment_purpose_score integer not null,
  loss_reaction_score integer not null,
  risk_preference_score integer not null,
  investment_horizon_score integer not null,
  leverage_attitude_score integer not null,
  experience_level_score integer not null,
  knowledge_check_score integer not null,
  liquidation_understanding_score integer not null,
  info_source_score integer not null,
  tip_verification_score integer not null,
  -- 축별 합산 점수 + 카테고리 라벨
  risk_total_score integer not null,      -- 5문항 합산, 5~20점
  knowledge_total_score integer not null, -- 3문항 합산, 3~12점
  info_habit_total_score integer not null, -- 2문항 합산, 2~8점
  profile_type varchar(255) not null
    check (profile_type in ('STABLE', 'NEUTRAL', 'AGGRESSIVE')),
  knowledge_level varchar(255) not null
    check (knowledge_level in ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
  info_habit_level varchar(255) not null
    check (info_habit_level in ('INDEPENDENT', 'MIXED', 'DEPENDENT')),
  explanation_text text not null, -- AI가 생성한 설명 문구(채점 자체는 룰 기반)
  created_at timestamptz not null
);

-- 문항별 채팅 답변 원문 — 온보딩 진행 상황(어디까지 답했는지)도 이 테이블로 판단.
create table onboarding_conversation_turns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  question_id varchar(255) not null
    check (question_id in (
      'INVESTMENT_PURPOSE', 'EXPERIENCE_LEVEL', 'LOSS_REACTION', 'RISK_PREFERENCE',
      'INVESTMENT_HORIZON', 'KNOWLEDGE_CHECK', 'LEVERAGE_ATTITUDE',
      'LIQUIDATION_UNDERSTANDING', 'INFO_SOURCE', 'TIP_VERIFICATION'
    )),
  raw_answer_text text not null,
  answered_at timestamptz not null,
  unique (user_id, question_id)
);

-- ============================================================
-- KnowerBot 채팅 — 전 라우트에 떠 있는 전역 위젯이라 세션에 안 묶고 유저 단위로만 기록.
-- ============================================================

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  role varchar(255) not null check (role in ('USER', 'ASSISTANT')),
  content text not null,
  created_at timestamptz not null
);

-- ============================================================
-- 시세 데이터
-- ============================================================

-- 실제 KRX 시세(2020-02~04, Yahoo Finance 조회 — 실데이터, 종목 5개).
-- 매매 체결가는 이 테이블에서 서버가 조회해서 결정 — 클라이언트가 가격을 보내지 않음.
create table stock_daily_prices (
  id uuid primary key default gen_random_uuid(),
  stock_code varchar(255) not null,
  stock_name varchar(255) not null,
  trade_date date not null,
  open_price numeric(38,2) not null,
  high_price numeric(38,2) not null,
  low_price numeric(38,2) not null,
  close_price numeric(38,2) not null,
  volume bigint not null,
  unique (stock_code, trade_date)
);

create table stock_news (
  id uuid primary key default gen_random_uuid(),
  stock_code varchar(255) not null,
  trade_date date not null,
  headline varchar(255) not null,
  summary text not null,
  source varchar(255) not null
);

-- ============================================================
-- 모의투자 — 유저별 세션(=한 번의 "재도전 루프" 단위) + 매매 로그.
-- 턴 = 일봉 1일 (실시간 아님, project_simulation_mechanic 메모리 참고).
-- ============================================================

create table simulation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  status varchar(255) not null check (status in ('ACTIVE', 'COMPLETED')),
  starting_cash numeric(38,2) not null,
  current_cash numeric(38,2) not null,
  borrowed_amount numeric(38,2) not null,
  current_turn_date date not null,  -- 시뮬레이션상 "오늘" 포인터
  target_end_date date not null,    -- 유저가 고른 종료일(스파링 기간)
  turn_count integer not null,
  started_at timestamptz not null,
  ended_at timestamptz
);

-- 턴 로그 — 매매 없이 관망만 한 턴도 한 행씩 남음(HELD).
create table turn_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references simulation_sessions (id),
  turn_number integer not null,
  turn_date date not null,
  turn_unit varchar(255) check (turn_unit in ('DAY', 'WEEK', 'MONTH')),
  action varchar(255) not null
    check (action in ('HELD', 'TRADED', 'FORCED_LIQUIDATED')),
  trade_count integer not null,
  cash numeric(38,2) not null,
  holdings_value numeric(38,2) not null,
  portfolio_value numeric(38,2) not null,
  borrowed_amount numeric(38,2) not null,
  created_at timestamptz not null,
  unique (session_id, turn_number)
);

-- 매매 로그 — 매매 시점 그날의 시가/고가/저가를 같이 남겨서, 외부 시세 데이터를
-- 다시 조인하지 않고도 "추격매수였는지" 같은 판단을 이 행 하나만 보고 할 수 있게 함.
create table trades (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references simulation_sessions (id),
  turn_log_id uuid not null references turn_logs (id),
  turn_number integer not null,
  stock_code varchar(255),
  stock_name varchar(255),
  side varchar(255) not null check (side in ('BUY', 'SELL', 'HOLD')),
  order_type varchar(255) check (order_type in ('MARKET', 'LIMIT')),
  limit_price numeric(38,2),
  trade_type varchar(255) not null
    check (trade_type in ('NORMAL', 'FORCED_LIQUIDATION')), -- FORCED_LIQUIDATION = 반대매매
  is_credit boolean not null,
  leverage_ratio numeric(38,2), -- is_credit = true일 때만 사용
  quantity integer,
  price numeric(38,2),
  filled boolean not null,      -- 지정가 주문이 그날 체결됐는지
  day_open_price numeric(38,2),
  day_high_price numeric(38,2),
  day_low_price numeric(38,2),
  viewed_disclosure boolean not null, -- 매수 전 공시/재무정보 확인 여부
  reason_text text not null,    -- 매매 이유(KnowerBot 채팅으로 받음) — 필수
  simulated_trade_date date not null,
  created_at timestamptz not null
);

-- RiskInterventionModal(/simulation 신용매수 경고)은 프론트에만 있고 유저 응답을
-- 백엔드에 기록하지 않음 — 그래서 risk_interventions 테이블은 2026-08-14에 삭제함
-- (엔티티+레포만 있고 서비스/컨트롤러가 없던 미사용 스캐폴딩).

-- ============================================================
-- 모의투자 스탯 — 세션 완료 시점에 AI가 턴별 매매+이유(reason_text)를 전부 읽고
-- 8개 지표를 0~100점으로 채점해 영구 저장. 세션마다 반복, 세션당 8행.
-- docs/stats.md 참고.
-- ============================================================

create table session_stats (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references simulation_sessions (id),
  stat_key varchar(255) not null check (stat_key in (
    'JUDGMENT_ACCURACY', 'DISCLOSURE_CHECK_RATE', 'RISK_MANAGEMENT_SCORE',
    'IMPULSIVE_TRADING', 'LOSS_AVERSION', 'CONFIRMATION_BIAS',
    'DIVERSIFICATION', 'GAMBLING_SIGNAL'
  )),
  score_pct integer not null,
  note text not null, -- AI가 이 세션에서 그렇게 채점한 근거를 짧게 서술
  computed_at timestamptz not null,
  unique (session_id, stat_key)
);

-- 종합(집계) 스탯은 별도 테이블 없음 — GET /api/users/me/aggregate-stats가
-- 유저의 모든 session_stats를 stat_key별로 매 요청마다 라이브로 평균 냄.


-- 예시 쿼리: 유저의 가장 최근 두 세션을 stat_key로 맞춰 growth(전후 비교) 계산
--
-- with ranked as (
--   select id, row_number() over (order by started_at desc) as rn
--   from simulation_sessions
--   where user_id = $1 and status = 'COMPLETED'
-- )
-- select curr.stat_key, prev.score_pct as before_pct, curr.score_pct as after_pct
-- from session_stats curr
-- join ranked r_curr on r_curr.id = curr.session_id and r_curr.rn = 1
-- join session_stats prev on prev.stat_key = curr.stat_key
-- join ranked r_prev on r_prev.id = prev.session_id and r_prev.rn = 2;

-- 예시 쿼리: 유저의 시즌 랭킹(수익률 기준) — RankingService가 이걸 코드로 계산함
--
-- select s.user_id, max((tl.portfolio_value - s.starting_cash) / s.starting_cash) as return_pct
-- from simulation_sessions s
-- join turn_logs tl on tl.session_id = s.id
-- where s.status = 'COMPLETED'
-- group by s.user_id
-- order by return_pct desc
-- limit 10;
