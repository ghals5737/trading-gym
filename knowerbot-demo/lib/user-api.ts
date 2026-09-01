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
  avgScorePct: number; // 모의고사 채점 + 퀴즈 결과를 합친 평균
  sessionCount: number; // 이 지표가 채점된 모의고사 세션 수
  quizCount: number; // 이 지표를 겨냥한 퀴즈 중 답을 제출한 개수
  latestNote: string; // 가장 최근 채점의 판단근거(AI가 쓴 한 문장)
}

// ---- 3개 대분류 개요 (정확성/침착성/공격성) ----

export interface StatCategoryScoreResponse {
  category: 'ACCURACY' | 'COMPOSURE' | 'AGGRESSIVENESS';
  label: string;
  scorePct: number;
  description: string;
  higherIsBetter: boolean; // false(공격성)면 좋고 나쁨이 아니라 "성향" — 중립 색으로 그림
  // 이 카테고리를 구성하는 세부 지표 키 — 리포트에서 "3개 성향 = 8개 지표"를 화면으로
  // 보여주는 데 쓴다. 온보딩 설문 기반 초기 스탯은 8개 지표가 아니라서 빈 배열.
  memberKeys: SessionStatKey[];
  // 공격성처럼 (100 - 지표점수)로 뒤집어 평균 낸 카테고리인지 — 세부 지표 점수가 높을수록
  // 카테고리 점수가 낮아지므로 화면에서 그 방향을 설명해줘야 한다.
  reversed: boolean;
}

// 3개 대분류가 어느 8개 세부 지표로 구성되는지 — 백엔드 StatCategoryCatalog.DEFINITIONS와
// 동일한 매핑. 마이페이지 리포트에서 카테고리 카드 아래 그 구성 지표를 바로 붙여 보여줄 때 씀.
export const CATEGORY_MEMBER_KEYS: Record<'ACCURACY' | 'COMPOSURE' | 'AGGRESSIVENESS', SessionStatKey[]> = {
  ACCURACY: ['JUDGMENT_ACCURACY', 'DISCLOSURE_CHECK_RATE', 'CONFIRMATION_BIAS'],
  COMPOSURE: ['IMPULSIVE_TRADING', 'LOSS_AVERSION', 'GAMBLING_SIGNAL'],
  AGGRESSIVENESS: ['RISK_MANAGEMENT_SCORE', 'DIVERSIFICATION'],
};

export interface StatOverviewResponse {
  summaryText: string;
  categories: StatCategoryScoreResponse[];
  stats: AggregateStatResponse[];
}

// 데이터가 하나도 없으면 204 → null.
export function getMyStatOverview(): Promise<StatOverviewResponse | null> {
  return authFetch<StatOverviewResponse | null>('/api/users/me/stat-overview');
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

// ---- 나이대 · 또래 비교 ----

export type AgeBand = 'TEENS' | 'TWENTIES' | 'THIRTIES' | 'FORTIES' | 'FIFTIES_PLUS';

export const AGE_BAND_LABELS: Record<AgeBand, string> = {
  TEENS: '10대',
  TWENTIES: '20대',
  THIRTIES: '30대',
  FORTIES: '40대',
  FIFTIES_PLUS: '50대 이상',
};

export interface AgeBandResponse {
  ageBand: AgeBand | null;
}

// "내 또래 대비 투자성향" — 같은 나이대의 온보딩 리스크 점수 평균과 내 점수를 비교.
export interface PeerComparisonResponse {
  ageBand: AgeBand;
  myRiskScore: number;
  myProfileType: 'STABLE' | 'NEUTRAL' | 'AGGRESSIVE';
  peerAvgRiskScore: number;
  peerCount: number;
  comparisonText: string;
}

export function getMyAgeBand(): Promise<AgeBandResponse> {
  return authFetch<AgeBandResponse>('/api/users/me/age-band');
}

export function updateMyAgeBand(ageBand: AgeBand): Promise<AgeBandResponse> {
  return authFetch<AgeBandResponse>('/api/users/me/age-band', {
    method: 'PUT',
    body: JSON.stringify({ ageBand }),
  });
}

// 나이대 미입력이거나 온보딩 미진단이면 204 → null.
export function getMyPeerComparison(): Promise<PeerComparisonResponse | null> {
  return authFetch<PeerComparisonResponse | null>('/api/users/me/peer-comparison');
}

// 위 8개 세부 지표를 묶은 3개 성향 카테고리 — 백엔드 SessionStatCategoryMapper와 동일한 매핑.
export type SessionStatCategory = 'ACCURACY' | 'COMPOSURE' | 'AGGRESSIVENESS';

export interface AggregateStatCategoryResponse {
  categoryKey: SessionStatCategory;
  avgScorePct: number;
  sessionCount: number;
}

// session_stat_categories를 유저 단위로 묶어 카테고리별 평균 낸 값 — getMyAggregateStats의
// 3개 성향 카테고리 버전.
export function getMyAggregateStatCategories(): Promise<AggregateStatCategoryResponse[]> {
  return authFetch<AggregateStatCategoryResponse[]>('/api/users/me/aggregate-stat-categories');
}

export const SESSION_STAT_CATEGORY_LABELS: Record<SessionStatCategory, { label: string; desc: string }> = {
  ACCURACY: { label: '정확성', desc: '근거를 갖고, 편향 없이 판단했는지' },
  COMPOSURE: { label: '침착성', desc: '감정(패닉·조급함)에 휘둘리지 않았는지' },
  AGGRESSIVENESS: { label: '공격성', desc: '위험을 얼마나 크게·집중해서 짊어졌는지' },
};
