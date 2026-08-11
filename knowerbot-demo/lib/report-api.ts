import { apiBaseUrl, getAccessToken } from './auth';

export type SessionStatKey =
  | 'JUDGMENT_ACCURACY'
  | 'DISCLOSURE_CHECK_RATE'
  | 'RISK_MANAGEMENT_SCORE'
  | 'IMPULSIVE_TRADING'
  | 'LOSS_AVERSION'
  | 'CONFIRMATION_BIAS'
  | 'DIVERSIFICATION'
  | 'GAMBLING_SIGNAL';

export type StatTone = 'RED' | 'AMBER' | 'GREEN';

export interface SessionStatResponse {
  statKey: SessionStatKey;
  scorePct: number;
  tone: StatTone;
  note: string | null;
}

export interface SessionReportResponse {
  sessionId: string;
  stats: SessionStatResponse[];
  diagnosisComparison: string | null;
}

class ReportApiError extends Error {}

async function request<T>(path: string): Promise<T> {
  const token = getAccessToken();
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ReportApiError(body.error || `요청이 실패했어요 (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function getSessionReport(sessionId: string): Promise<SessionReportResponse> {
  return request<SessionReportResponse>(`/api/sessions/${sessionId}/report`);
}
