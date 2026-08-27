import { authFetch } from './auth';

export type InvestorProfileType = 'STABLE' | 'NEUTRAL' | 'AGGRESSIVE';
export type InvestorKnowledgeLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export type InvestorInfoHabitLevel = 'INDEPENDENT' | 'MIXED' | 'DEPENDENT';

export interface InvestorProfileResponse {
  id: string;
  profileType: InvestorProfileType; // 리스크 성향
  riskTotalScore: number;
  knowledgeLevel: InvestorKnowledgeLevel; // 투자 지식 수준
  knowledgeTotalScore: number;
  infoHabitLevel: InvestorInfoHabitLevel; // 정보 습관 (직접조사형/균형형/의존형)
  infoHabitTotalScore: number;
  explanationText: string;
  // 설문으로 추정한 정확성/침착성/공격성 초기 스탯 — 모의고사·퀴즈가 쌓이기 전의 베이스라인.
  initialCategoryScores: {
    category: 'ACCURACY' | 'COMPOSURE' | 'AGGRESSIVENESS';
    label: string;
    scorePct: number;
    description: string;
    higherIsBetter: boolean;
  }[];
  createdAt: string;
}

export function getMyInvestorProfile(): Promise<InvestorProfileResponse | null> {
  return authFetch<InvestorProfileResponse | null>('/api/onboarding/profile');
}
