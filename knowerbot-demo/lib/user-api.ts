import { authFetch } from './auth';

export interface ProductTourStatusResponse {
  seen: boolean;
}

// 계정 단위로 기억함(로컬스토리지 아님) — 다른 기기·브라우저로 로그인해도 한 번
// 본 사람에겐 다시 안 뜨고, 같은 브라우저를 여러 계정이 돌려써도 계정마다 정확히
// 한 번씩만 보여줌.
export function getProductTourStatus(): Promise<ProductTourStatusResponse> {
  return authFetch<ProductTourStatusResponse>('/api/users/me/product-tour');
}

export function markProductTourSeen(): Promise<ProductTourStatusResponse> {
  return authFetch<ProductTourStatusResponse>('/api/users/me/product-tour/seen', { method: 'POST' });
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

export interface AggregateStatResponse {
  statKey: SessionStatKey;
  avgScorePct: number;
  sessionCount: number;
}

// session_stats(모의투자)를 유저 단위로 묶어 지표별 평균 낸 값 — 지금은 세션만 소스지만,
// 나중에 상황퀴즈·자료 열람 스탯이 생기면 백엔드 쪽 소스만 늘어나고 이 응답 모양은 그대로임.
export function getMyAggregateStats(): Promise<AggregateStatResponse[]> {
  return authFetch<AggregateStatResponse[]>('/api/users/me/aggregate-stats');
}

export const SESSION_STAT_LABELS: Record<SessionStatKey, { label: string; suffix: string; desc: string }> = {
  JUDGMENT_ACCURACY: { label: '판단 정확도', suffix: '%', desc: '매매 판단이 상황에 맞았는지' },
  DISCLOSURE_CHECK_RATE: { label: '공시 확인율', suffix: '%', desc: '매수 전 공시를 확인한 비율' },
  RISK_MANAGEMENT_SCORE: { label: '리스크 관리', suffix: '점', desc: '레버리지·반대매매 위험 관리 수준' },
  IMPULSIVE_TRADING: { label: '충동매매 억제', suffix: '점', desc: '근거 없이 급하게 매매하지 않는 정도' },
  LOSS_AVERSION: { label: '손실 회피 대응', suffix: '점', desc: '손실 상황에서 감정적으로 버티지 않는 정도' },
  CONFIRMATION_BIAS: { label: '확증편향 억제', suffix: '점', desc: '보고 싶은 정보만 보지 않는 정도' },
  DIVERSIFICATION: { label: '분산투자', suffix: '점', desc: '한 종목에 몰빵하지 않는 정도' },
  GAMBLING_SIGNAL: { label: '도박성 신호 낮음', suffix: '점', desc: '손실 후 베팅을 키우지 않는 정도' },
};
