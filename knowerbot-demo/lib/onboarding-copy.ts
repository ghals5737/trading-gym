import type { InvestorProfileType, InvestorKnowledgeLevel, InvestorInfoHabitLevel } from './onboarding-api';

// /onboarding/result와 /my(투자 성향 탭) 둘 다 같은 진단 결과를 보여주므로 문구를 한 곳에 모아둠.

export const RISK_COPY: Record<InvestorProfileType, { label: string; detail: string }> = {
  STABLE: {
    label: '안정형',
    detail: '수익보다 원금 보전을 우선시하고, 변동성이 큰 상황에서는 관망을 선호하는 유형입니다.',
  },
  NEUTRAL: {
    label: '중립형',
    detail: '수익 기회에는 관심이 있지만, 손실 폭이 커지는 구간에서는 빠른 피드백이 필요한 유형입니다.',
  },
  AGGRESSIVE: {
    label: '공격형',
    detail: '고수익을 위해 리스크를 적극적으로 감수하고, 손실 중에도 추가매수 등 공격적으로 대응하는 유형입니다.',
  },
};

export const KNOWLEDGE_COPY: Record<InvestorKnowledgeLevel, { label: string; detail: string }> = {
  BEGINNER: {
    label: '초보',
    detail: '아직 투자 개념이 낯선 편이에요. 용어와 기본기부터 차근차근 익혀보세요.',
  },
  INTERMEDIATE: {
    label: '중급',
    detail: '기본 개념은 잡혀 있어요. 실전 감각을 기르는 데 집중하면 좋아요.',
  },
  ADVANCED: {
    label: '숙련',
    detail: '개념은 탄탄해요. 실제 상황에서 원칙을 지키는 훈련에 집중하면 좋아요.',
  },
};

export const INFO_HABIT_COPY: Record<InvestorInfoHabitLevel, { label: string; detail: string }> = {
  INDEPENDENT: {
    label: '직접조사형',
    detail: '공시나 재무제표를 직접 찾아보는 편이에요. 이 습관을 계속 유지하면 좋아요.',
  },
  MIXED: {
    label: '균형형',
    detail: '뉴스나 커뮤니티도 참고하지만 스스로 확인하는 편이에요. 1차 자료를 조금 더 보면 좋아요.',
  },
  DEPENDENT: {
    label: '정보의존형',
    detail: 'SNS나 리딩방 정보에 의존하는 편이에요. 남의 추천을 그대로 따라가기보다 직접 확인하는 연습이 필요해요.',
  },
};

export function headlineFor(profileType: InvestorProfileType, knowledgeLevel: InvestorKnowledgeLevel): string {
  if (profileType === 'AGGRESSIVE' && knowledgeLevel === 'BEGINNER') {
    return '리스크는 크게 감수하고 싶은데, 아직 지식은 쌓는 중이에요 — 반대매매부터 먼저 겪어보세요';
  }
  if (profileType === 'STABLE') return '원금을 지키면서 천천히 감을 잡으면 좋아요';
  if (profileType === 'AGGRESSIVE') return '높은 변동성도 감수할 수 있지만, 반대매매는 미리 체감해봐야 해요';
  return '리스크 기준을 먼저 잡으면 빠르게 성장할 수 있어요';
}

export function warningFor(
  profileType: InvestorProfileType,
  knowledgeLevel: InvestorKnowledgeLevel,
  infoHabitLevel: InvestorInfoHabitLevel,
): string | null {
  const risky = profileType === 'AGGRESSIVE' && knowledgeLevel === 'BEGINNER';
  const dependent = infoHabitLevel === 'DEPENDENT';
  if (risky && dependent) {
    return '리스크는 크게 감수하고 싶은데 아직 투자 지식은 부족하고, 정보도 SNS·리딩방에 많이 의존하는 편이에요 — 실전에서 반대매매·빚투로 무너지기 제일 쉬운 조합이니, 모의투자로 그 상황을 먼저 경험해보길 강력히 권해요.';
  }
  if (risky) {
    return '리스크는 크게 감수하고 싶은데 아직 투자 지식은 쌓는 중인 조합이에요 — 실전에서 반대매매를 겪기 제일 쉬운 유형이니, 모의투자로 그 상황을 먼저 경험해보길 권해요.';
  }
  if (dependent) {
    return 'SNS나 리딩방 정보에 의존하는 편이에요 — 검증 없이 따라 사는 습관은 손실로 이어지기 쉬우니, 직접 공시·재무정보를 확인하는 연습부터 해보세요.';
  }
  return null;
}

export function courseFor(
  profileType: InvestorProfileType,
  knowledgeLevel: InvestorKnowledgeLevel,
): { course: string; courseDetail: string } {
  if (profileType === 'AGGRESSIVE' && knowledgeLevel === 'BEGINNER') {
    return {
      course: '반대매매 먼저 겪어보기 코스',
      courseDetail: '실전에서 겪기 전에, 신용거래로 포지션을 잡고 담보비율이 무너져 강제 청산되는 상황을 모의투자로 먼저 경험해보세요.',
    };
  }
  if (knowledgeLevel === 'BEGINNER') {
    return {
      course: '기초 개념 다지기 코스',
      courseDetail: '첫 세션은 시장가·지정가 차이, 분산투자 기본기부터 가볍게 시작하세요.',
    };
  }
  if (profileType === 'AGGRESSIVE') {
    return {
      course: '레버리지 리스크 체감 코스',
      courseDetail: '레버리지를 쓸 땐 담보비율이 얼마나 빨리 무너질 수 있는지부터 모의투자로 체감해보세요.',
    };
  }
  if (profileType === 'NEUTRAL') {
    return {
      course: '초기 리스크 제어 코스',
      courseDetail: '포지션 크기 제한, 손절 기준 설정, 연속 손실 대응 연습으로 시작하세요.',
    };
  }
  return {
    course: '꾸준한 우량주 투자 코스',
    courseDetail: '레버리지 없이 우량주 위주로 소액부터 시작하면 안정적으로 감을 잡을 수 있어요.',
  };
}
