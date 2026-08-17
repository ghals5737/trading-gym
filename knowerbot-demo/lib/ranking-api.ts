import { authFetch } from './auth';

// 완료된 세션들 중 유저별 최대 수익률로 줄 세운 랭킹 — 진행 중 세션은 집계에서 빠짐.
export interface RankingEntryResponse {
  rank: number;
  username: string;
  returnPct: number;
  isMe: boolean;
}

export function getReturnRateRanking(): Promise<RankingEntryResponse[]> {
  return authFetch<RankingEntryResponse[]>('/api/rankings/return-rate');
}
