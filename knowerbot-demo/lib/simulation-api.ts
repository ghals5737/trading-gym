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
// (가격이 크게 움직인 날 위주) 없을 때가 훨씬 많음(getStockNews가 204 반환).
export interface StockNewsResponse {
  headline: string;
  summary: string;
  source: string;
  tradeDate: string;
}

export interface StockHistoryResponse {
  stockCode: string;
  stockName: string;
  points: PricePoint[];
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

export interface CreateTradeRequest {
  stockCode: string;
  side: TradeSide;
  orderType: TradeOrderType;
  limitPrice?: number;
  isCredit?: boolean;
  leverageRatio?: number;
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

// 뉴스가 없는 날이 훨씬 많음(204 → null) — 프론트는 null이면 뉴스 카드를 안 보여주면 됨.
export function getStockNews(sessionId: string, stockCode: string): Promise<StockNewsResponse | null> {
  return request<StockNewsResponse | null>(`/api/sessions/${sessionId}/stocks/${stockCode}/news`);
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
