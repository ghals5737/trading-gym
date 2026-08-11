import { apiBaseUrl, getAccessToken } from './auth';

export type SimulationSessionStatus = 'ACTIVE' | 'COMPLETED';
export type TradeSide = 'BUY' | 'SELL';
export type TradeOrderType = 'MARKET' | 'LIMIT';
export type TradeReason =
  | 'FUNDAMENTALS'
  | 'TECHNICAL_SIGNAL'
  | 'STOP_LOSS'
  | 'AVERAGING_DOWN'
  | 'CHASE_BUY'
  | 'IMPULSIVE'
  | 'PLANNED_TAKE_PROFIT'
  | 'OTHER';

export interface SessionResponse {
  id: string;
  status: SimulationSessionStatus;
  startingCash: number;
  currentCash: number;
  borrowedAmount: number;
  currentTurnDate: string;
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

export interface StockHistoryResponse {
  stockCode: string;
  stockName: string;
  points: PricePoint[];
}

export interface TradeResponse {
  id: string;
  stockCode: string;
  stockName: string;
  side: TradeSide;
  tradeType: 'NORMAL' | 'FORCED_LIQUIDATION';
  orderType: TradeOrderType;
  limitPrice: number | null;
  filled: boolean;
  isCredit: boolean;
  leverageRatio: number | null;
  quantity: number;
  price: number | null;
  dayOpenPrice: number;
  dayHighPrice: number;
  dayLowPrice: number;
  viewedDisclosure: boolean;
  reasonTag: TradeReason | null;
  reasonText: string | null;
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
  reasonTag?: TradeReason;
  reasonText?: string;
}

class SimulationApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (response.status === 204) return null as T;
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new SimulationApiError(body.error || `요청이 실패했어요 (${response.status})`);
  }
  return response.json() as Promise<T>;
}

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

export function createSession(startingCash: number, currentTurnDate: string): Promise<SessionResponse> {
  return request<SessionResponse>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ startingCash, currentTurnDate }),
  });
}

export function getQuotes(sessionId: string): Promise<QuoteResponse[]> {
  return request<QuoteResponse[]>(`/api/sessions/${sessionId}/quotes`);
}

export function getStockHistory(sessionId: string, stockCode: string): Promise<StockHistoryResponse> {
  return request<StockHistoryResponse>(`/api/sessions/${sessionId}/stocks/${stockCode}/history`);
}

export function recordTrade(sessionId: string, req: CreateTradeRequest): Promise<TradeResponse> {
  return request<TradeResponse>(`/api/sessions/${sessionId}/trades`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export function listTrades(sessionId: string): Promise<TradeResponse[]> {
  return request<TradeResponse[]>(`/api/sessions/${sessionId}/trades`);
}

export function advanceTurn(sessionId: string): Promise<SessionResponse> {
  return request<SessionResponse>(`/api/sessions/${sessionId}/advance-turn`, { method: 'POST' });
}

export function completeSession(sessionId: string): Promise<SessionResponse> {
  return request<SessionResponse>(`/api/sessions/${sessionId}/complete`, { method: 'POST' });
}
