import { authFetch } from './auth';

export type SimulationSessionStatus = 'ACTIVE' | 'COMPLETED';
export type TurnUnit = 'DAY' | 'WEEK' | 'MONTH';
export type TradeSide = 'BUY' | 'SELL' | 'HOLD';
export type TradeOrderType = 'MARKET' | 'LIMIT';

export interface SessionResponse {
  id: string;
  status: SimulationSessionStatus;
  startingCash: number;
  currentCash: number;
  borrowedAmount: number;
  // 미수금 상환 기한 안내용 — 미수금이 없으면 null/false.
  // debtDeadlineTurn = 미수 발생 턴 + 10. 그 턴이 끝날 때까지 못 갚으면 debtOverdue가 켜짐.
  debtOpenedTurnNumber: number | null;
  debtDeadlineTurn: number | null;
  debtOverdue: boolean;
  startTurnDate: string; // 시뮬레이션 시작 거래일 — 기간 진행률(프로그래스바)의 시작점
  currentTurnDate: string;
  targetEndDate: string;
  turnCount: number;
  maxTurns: number;
  startedAt: string;
  endedAt: string | null;
}

export interface QuoteResponse {
  stockCode: string;
  stockName: string;
  tradeDate: string;
  openPrice: number;
}

export interface PricePoint {
  tradeDate: string;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
}

// 실제 있었던 뉴스를 손으로 골라 채운 고정 데이터 — 뉴스가 있는 날짜는 드물어서
// (가격이 크게 움직인 날 위주) "오늘 뉴스"만 찾으면 거의 항상 비어 있다.
// 그래서 공시와 같이 현재 거래일까지 나온 것 중 최신 몇 건을 받고, 며칠 전 뉴스인지
// (daysAgo)를 같이 받아 화면에 표시한다.
export interface StockNewsItemResponse {
  headline: string;
  summary: string;
  source: string;
  tradeDate: string;
  daysAgo: number;
}

export interface StockNewsResponse {
  stockCode: string;
  items: StockNewsItemResponse[];
}

export interface StockHistoryResponse {
  stockCode: string;
  stockName: string;
  points: PricePoint[];
}

// DART 공시 요약(고정 데이터) — 세션 현재 거래일까지 나온 최신 3건. 공시는 오래돼도
// 유효한 정보라(분기보고서 등) 뉴스와 달리 lookback 제한 없음. 없으면 items가 빈 배열.
export interface StockDisclosureItemResponse {
  title: string;
  summary: string;
  disclosedDate: string;
}

export interface StockDisclosureResponse {
  stockCode: string;
  items: StockDisclosureItemResponse[];
}

// stockCode/stockName/orderType/quantity/day*Price는 side='HOLD'(관망)면 전부 null.
export interface TradeResponse {
  id: string;
  stockCode: string | null;
  stockName: string | null;
  side: TradeSide;
  tradeType: 'NORMAL' | 'FORCED_LIQUIDATION';
  orderType: TradeOrderType | null;
  limitPrice: number | null;
  filled: boolean;
  isCredit: boolean;
  leverageRatio: number | null;
  quantity: number | null;
  price: number | null;
  dayOpenPrice: number | null;
  dayHighPrice: number | null;
  dayLowPrice: number | null;
  viewedDisclosure: boolean;
  reasonText: string;
  turnNumber: number;
  simulatedTradeDate: string;
  createdAt: string;
}

// 지정가 주문은 회의 결정으로 제거됨 — 항상 시장가(그날 시가) 체결.
// 미수(신용)도 요청 필드가 아님 — 현금보다 큰 매수면 서버가 부족분을 자동으로 미수로 잡음.
export interface CreateTradeRequest {
  stockCode: string;
  side: TradeSide;
  quantity: number;
  viewedDisclosure?: boolean;
  reasonText: string;
}

export type TurnAction = 'HELD' | 'TRADED' | 'FORCED_LIQUIDATED';

export interface TurnLogResponse {
  id: string;
  turnNumber: number;
  turnDate: string;
  turnUnit: TurnUnit | null; // 1턴째는 건너뛴 게 없어서 null
  cash: number;
  borrowedAmount: number;
  holdingsValue: number;
  portfolioValue: number;
  tradeCount: number;
  action: TurnAction;
}

const request = authFetch;

export function getActiveSession(): Promise<SessionResponse | null> {
  return request<SessionResponse | null>('/api/sessions/active');
}

// 최신순 — "나의 리포트"에서 진행 중이든 종료됐든 가장 최근 세션을 찾을 때 씀.
export function listSessions(): Promise<SessionResponse[]> {
  return request<SessionResponse[]>('/api/sessions');
}

export function getAvailableTradingDates(): Promise<string[]> {
  return request<string[]>('/api/sessions/available-dates');
}

export function createSession(startingCash: number, currentTurnDate: string, targetEndDate: string): Promise<SessionResponse> {
  return request<SessionResponse>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ startingCash, currentTurnDate, targetEndDate }),
  });
}

export function getQuotes(sessionId: string): Promise<QuoteResponse[]> {
  return request<QuoteResponse[]>(`/api/sessions/${sessionId}/quotes`);
}

export function getStockHistory(sessionId: string, stockCode: string): Promise<StockHistoryResponse> {
  return request<StockHistoryResponse>(`/api/sessions/${sessionId}/stocks/${stockCode}/history`);
}

// 뉴스가 하나도 없어도 200 + 빈 목록 — 뉴스 섹터 자체는 항상 화면에 있고, 비어 있으면
// 비었다고 말한다(예전엔 204일 때 섹터를 통째로 숨겨서 "뉴스가 빠진" 것처럼 보였음).
export function getStockNews(sessionId: string, stockCode: string): Promise<StockNewsResponse> {
  return request<StockNewsResponse>(`/api/sessions/${sessionId}/stocks/${stockCode}/news`);
}

export function getStockDisclosures(sessionId: string, stockCode: string): Promise<StockDisclosureResponse> {
  return request<StockDisclosureResponse>(`/api/sessions/${sessionId}/stocks/${stockCode}/disclosures`);
}

export function recordTrade(sessionId: string, req: CreateTradeRequest): Promise<TradeResponse> {
  return request<TradeResponse>(`/api/sessions/${sessionId}/trades`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export interface RiskWarningRequest {
  stockName: string;
  quantity: number;
  leverageRatio: number;
  expectedCollateralRatioPct: number;
  liquidationThresholdPct: number;
  reasonText: string;
  diagnosisWarning: string | null;
}

export interface RiskWarningResponse {
  message: string;
}

// 신용매수 진행 전, 담보비율이 위험 수준까지 떨어지면 AI가 그 자리에서 경고 메시지를 만듦
// (유저가 이미 답한 매매 이유까지 참고함) — 매매 자체는 아직 기록 안 됨.
export function generateRiskWarning(sessionId: string, req: RiskWarningRequest): Promise<RiskWarningResponse> {
  return request<RiskWarningResponse>(`/api/sessions/${sessionId}/risk-warning`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export function listTrades(sessionId: string): Promise<TradeResponse[]> {
  return request<TradeResponse[]>(`/api/sessions/${sessionId}/trades`);
}

// turnUnit(하루/일주일/한달)은 매번 필수 — 세션 생성이 아니라 턴 넘길 때마다 고름.
// 이번 턴에 매매를 하나도 안 했으면 holdReasonText도 필수 — 백엔드가 검증함.
export function advanceTurn(sessionId: string, turnUnit: TurnUnit, holdReasonText?: string): Promise<SessionResponse> {
  return request<SessionResponse>(`/api/sessions/${sessionId}/advance-turn`, {
    method: 'POST',
    body: JSON.stringify({ turnUnit, holdReasonText }),
  });
}

export function completeSession(sessionId: string): Promise<SessionResponse> {
  return request<SessionResponse>(`/api/sessions/${sessionId}/complete`, { method: 'POST' });
}

// 관망한 턴까지 포함한 턴별 타임라인 — AI 종합 분석/리포트용 원자료.
export function listTurnLogs(sessionId: string): Promise<TurnLogResponse[]> {
  return request<TurnLogResponse[]>(`/api/sessions/${sessionId}/turn-logs`);
}

// ---- 미수금 갚기 / AI 채점 / 모의고사 기록 ----

// "미수금 갚기" — 현금부터 갚고, 모자라면 보유 종목을 필요한 만큼만 시가 매도해서 상환.
export function repayDebt(sessionId: string): Promise<SessionResponse> {
  return request<SessionResponse>(`/api/sessions/${sessionId}/repay-debt`, { method: 'POST' });
}

export type SessionStatKey =
  | 'JUDGMENT_ACCURACY'
  | 'DISCLOSURE_CHECK_RATE'
  | 'RISK_MANAGEMENT_SCORE'
  | 'IMPULSIVE_TRADING'
  | 'LOSS_AVERSION'
  | 'CONFIRMATION_BIAS'
  | 'DIVERSIFICATION'
  | 'GAMBLING_SIGNAL';

export interface SessionStatScoreResponse {
  statKey: SessionStatKey;
  scorePct: number;
  note: string; // AI가 채점하며 남긴 판단근거 한 문장
}

// 세션 하나의 AI 채점 8개 지표 — 종료된 세션은 저장값, 진행 중이면 즉석 계산.
export function getSessionStats(sessionId: string): Promise<SessionStatScoreResponse[]> {
  return request<SessionStatScoreResponse[]>(`/api/sessions/${sessionId}/stats`);
}

// 마이페이지 "모의고사 기록" — 완료된 세션들의 결과 요약 + AI 채점, 최신순.
export interface SessionHistoryItemResponse {
  sessionId: string;
  startTurnDate: string;
  lastTurnDate: string;
  turnCount: number;
  startingCash: number;
  finalPortfolioValue: number;
  returnPct: number;
  endedAt: string | null;
  stats: SessionStatScoreResponse[];
}

export function getSessionHistory(): Promise<SessionHistoryItemResponse[]> {
  return request<SessionHistoryItemResponse[]>('/api/sessions/history');
}
