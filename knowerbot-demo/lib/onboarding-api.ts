import { apiBaseUrl, getAccessToken } from './auth';

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
  createdAt: string;
}

class OnboardingApiError extends Error {}

async function request<T>(path: string): Promise<T> {
  const token = getAccessToken();
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (response.status === 204) return null as T;
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new OnboardingApiError(body.error || `요청이 실패했어요 (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function getMyInvestorProfile(): Promise<InvestorProfileResponse | null> {
  return request<InvestorProfileResponse | null>('/api/onboarding/profile');
}
