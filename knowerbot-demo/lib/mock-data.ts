// Mock data shared across screens. Everything here stands in for a future
// real backend (historical price DB, OpenDART, RAG content, etc.) — see
// project CLAUDE.md for the real data-source plan.

export type Stock = {
  symbol: string;
  name: string;
  market: string;
  price: number;
  changePct: number;
  chart: number[];
};

export const stocks: Stock[] = [
  {
    symbol: 'A001',
    name: '대형전자 A',
    market: '코스피 · 종목 코드 익명 처리',
    price: 54000,
    changePct: -3.2,
    chart: [62000, 60500, 59800, 57200, 55800, 56400, 54000],
  },
  {
    symbol: 'B002',
    name: '바이오헬스 B',
    market: '코스피 · 종목 코드 익명 처리',
    price: 128500,
    changePct: 1.8,
    chart: [120000, 121200, 119800, 124000, 126500, 125800, 128500],
  },
  {
    symbol: 'C003',
    name: '2차전지 C',
    market: '코스닥 · 종목 코드 익명 처리',
    price: 76200,
    changePct: -0.5,
    chart: [78000, 77500, 76800, 77200, 76600, 76900, 76200],
  },
  {
    symbol: 'D004',
    name: '플랫폼 D',
    market: '코스닥 · 종목 코드 익명 처리',
    price: 31900,
    changePct: 4.1,
    chart: [29000, 29400, 30100, 29800, 30600, 31200, 31900],
  },
  {
    symbol: 'E005',
    name: '반도체장비 E',
    market: '코스피 · 종목 코드 익명 처리',
    price: 212000,
    changePct: 0.9,
    chart: [205000, 206500, 208000, 207200, 209800, 210500, 212000],
  },
];

export const watchlist = ['A001', 'E005'];

export const stockDetail = {
  marketCap: '18.2조원',
  volume: '8,420,391주',
  high52w: '71,200원',
  low52w: '48,100원',
  per: '14.2배',
  pbr: '1.1배',
  roe: '9.8%',
  dividendYield: '2.3%',
  about:
    '반도체·가전 사업을 함께 운영하는 대형 제조업체예요. 2020년 3월 급락장에서는 글로벌 공급망 우려로 3거래일 연속 하락했지만, 이후 반등한 이력이 있어요. 교육 목적으로 실제 종목명은 가려져 있어요.',
  financials: {
    years: ['2018', '2019', '2020(E)'],
    rows: [
      { label: '매출액', values: ['61.2조', '58.4조', '52.1조'] },
      { label: '영업이익', values: ['8.9조', '6.2조', '4.1조'] },
      { label: '순이익', values: ['6.5조', '4.8조', '2.9조'] },
    ],
    note: '영업이익이 2년 연속 줄고 있어요 — 매수 전에 이유를 공시에서 확인해보세요.',
  },
};

export const ranking = [
  { rank: 1, name: '익명의고수', returnPct: '+42.5%', isMe: false },
  { rank: 2, name: '반도체투자자', returnPct: '+31.2%', isMe: false },
  { rank: 3, name: '저축왕', returnPct: '+28.9%', isMe: false },
  { rank: 4, name: '코스피초보 (나)', returnPct: '+12.4%', isMe: true },
  { rank: 5, name: '존버는승리', returnPct: '+9.1%', isMe: false },
];

export const portfolio = {
  cash: 10000000,
  holdings: '없음',
  borrowed: 0,
  riskLevel: '안정적' as const,
};

export const news = [
  {
    id: 'n1',
    tag: '속보',
    headline: "보유 중인 '대형전자 A', 하루 만에 -15% 급락",
    source: '연합뉴스 · 12분 전',
    body: '반도체 업황 둔화 우려와 글로벌 공급망 리스크가 겹치며 대형 제조업체 주가가 동반 하락했다. 시장에서는 내일 예정된 실적 발표 결과에 따라 변동성이 더 커질 수 있다는 분석이 나온다.',
    aiPoints: [
      '이 뉴스는 지금 내가 들고 있는 종목 얘기예요 — 무시하지 말고 꼭 확인하세요.',
      "'실적 발표 전 변동성 확대'는 내일 하루 더 크게 움직일 수 있다는 뜻이에요.",
      '패닉에 전량 매도하기보다, 왜 떨어졌는지(업황 이슈 vs 이 회사만의 문제)부터 구분해보세요.',
    ],
  },
  {
    id: 'n2',
    tag: '시장',
    headline: '美 연준, 기준금리 동결 — 시장은 안도',
    source: '한국경제 · 1시간 전',
    body: '미국 연방준비제도가 기준금리를 현 수준에서 동결하기로 결정했다. 시장은 대체로 예상된 결정으로 받아들이며 코스피·코스닥 모두 강보합 마감했다.',
    aiPoints: [
      '금리 동결은 대출 이자 부담이 당장 더 커지지 않는다는 뜻이에요.',
      '신용거래(빚투) 이자율도 기준금리와 연동되는 경우가 많아요.',
    ],
  },
  {
    id: 'n3',
    tag: '산업',
    headline: '2차전지 업황, 하반기 반등 전망 나와',
    source: '전자신문 · 3시간 전',
    body: '주요 증권사들이 2차전지 업황이 하반기부터 점진적으로 개선될 것이라는 전망을 내놨다. 전기차 수요 회복이 핵심 근거로 꼽힌다.',
    aiPoints: ['업황 전망은 "예상"이지 확정이 아니에요 — 여러 리포트를 비교해보는 습관을 들이세요.'],
  },
  {
    id: 'n4',
    tag: '공시',
    headline: '플랫폼 D, 전환사채 발행 결정 공시',
    source: '전자공시시스템 · 5시간 전',
    body: '플랫폼 D가 300억 원 규모의 전환사채 발행을 결정했다고 공시했다. 전환가액은 현재 주가 대비 약간 낮은 수준으로 책정됐다.',
    aiPoints: [
      '전환사채는 나중에 주식으로 바뀔 수 있어서, 주식 수가 늘어나 주당 가치가 희석될 수 있어요.',
    ],
  },
];

export const educationCategories = ['전체', '기초 개념', '리스크 관리', '차트 분석', '제도와 공시', '투자 심리'];

export const educationItems = [
  {
    category: '기초 개념',
    title: '반대매매, 내 주식이 강제로 팔리는 순간',
    meta: '3분 · 퀴즈 2개',
    source: '금융감독원 금융교육센터 자료',
  },
  {
    category: '제도와 공시',
    title: '뉴스와 공시가 다른 말을 할 때',
    meta: '4분 · 퀴즈 2개',
    source: '금융감독원 파인(FINE) 자료',
  },
  {
    category: '리스크 관리',
    title: '빌려서 투자하면 무엇이 다를까',
    meta: '4분 · 퀴즈 2개',
    source: '전국투자자교육협의회 자료',
  },
  {
    category: '기초 개념',
    title: '월급에서 투자금 만들기 — 청년 자산관리 첫걸음',
    meta: '3분 · 퀴즈 1개',
    source: '금융감독원 금융교육센터 자료',
  },
  {
    category: '투자 심리',
    title: '손실회피 편향, 왜 손절을 못 할까',
    meta: '3분 · 퀴즈 2개',
    source: '행동경제학 기초 시리즈',
  },
  {
    category: '차트 분석',
    title: '캔들스틱, 빨간 막대 파란 막대 읽는 법',
    meta: '4분 · 퀴즈 2개',
    source: '전국투자자교육협의회 자료',
  },
];

export const ptLesson = {
  intro:
    '최근 모의고사에서 공시를 열어보지 않고 고른 경우가 10번 중 6번이었어요. 오늘은 반대매매부터 같이 볼게요.',
  topic: '반대매매, 내 주식이 강제로 팔리는 순간',
  explanation:
    '담보비율이 140% 아래로 내려가면 내 의사와 상관없이 팔려요. 주가가 떨어질수록 담보비율도 같이 떨어져서, 하락장에선 순식간에 일어날 수 있어요.',
  quizQuestion: '퀴즈! 담보비율이 140% 밑으로 떨어지면 어떻게 될까요?',
  quizOptions: [
    { label: '알림을 받고 내가 직접 판단해서 판다', correct: false },
    { label: '내 의사와 상관없이 자동으로 팔린다', correct: true },
    { label: '아무 일도 일어나지 않는다', correct: false },
  ],
  feedback:
    '정답이에요! 이게 바로 반대매매예요. 하락장일수록 담보비율 확인이 중요한 이유고요.',
};

export const scenarioQuiz = {
  tag: '속보',
  headline: "보유 중인 '대형전자 A', 하루 만에 -15% 급락",
  context:
    '어제 종가 대비 오늘 -15%. 남은 현금은 320만 원, 이 종목 보유 수량은 40주(신용 매수분 포함)예요. 내일 실적 발표가 예정되어 있어요.',
  options: [
    {
      label: '전량 매도해서 손실을 확정한다',
      hint: '신용 상환 부담부터 없애는 선택이에요',
    },
    {
      label: '실적 발표를 지켜보며 절반만 매도한다',
      hint: '위험을 나눠 담아보는 선택이에요',
      selected: true,
    },
    {
      label: '오히려 추가 매수로 평단가를 낮춘다',
      hint: '물타기 — 확신 없이는 위험이 커져요',
    },
    { label: '아무것도 하지 않고 지켜본다', hint: '판단을 미루는 것도 하나의 선택이에요' },
  ],
  feedback:
    '위험을 한 번에 다 지지 않고 나눠 담는 선택, 좋아요. 다만 신용 매수분이 섞여 있을 땐 담보비율도 같이 확인하는 습관을 들이면 더 안전해요.',
  xpGain: 120,
};

export const report = {
  tier: '새싹 2단계 · 관찰형',
  summary:
    '오르는 주식을 따라 사는 편이에요. 판단의 71%가 이미 오른 종목 따라사기였고, 공시를 열어본 판단은 10번 중 4번이 안 됐어요. 승급까지 공시 확인율 50%가 필요해요.',
  metrics: [
    { label: '판단 정확도', value: '62%' },
    { label: '공시 확인율', value: '38%' },
    { label: '리스크 관리', value: '54점' },
  ],
  growth: [
    { label: '판단 정확도', before: '48%', after: '62%' },
    { label: '공시 확인율', before: '12%', after: '38%' },
    { label: '강제로 팔린 횟수', before: '2번', after: '0번' },
  ],
  habits: [
    { label: '이슈 따라 사기 (뇌동매매)', level: '높음', pct: 85, tone: 'red' as const },
    { label: '손해 보면 못 파는 마음', level: '높음', pct: 75, tone: 'red' as const },
    { label: '공시 없이 판단하기', level: '중간', pct: 50, tone: 'amber' as const },
    { label: '나눠 담는 습관', level: '좋아요', pct: 90, tone: 'green' as const },
  ],
  habitsNote:
    '모의고사의 판단 기록(매매 빈도, 빌린 돈 비율, 종목 쏠림, 공시 확인 여부)을 바탕으로 계산했어요.',
  gamblingSignal: {
    level: '낮음',
    note: '손실 후 베팅을 키우는 패턴이 반복되면 경고와 함께 한국도박문제예방치유원 등 공식 상담 기관을 안내해 드려요.',
  },
};

export const aiCharacter = {
  name: 'KnowerBot',
  level: 3,
  tier: '새싹 2단계 · 관찰형',
  xp: 620,
  xpToNext: 1000,
  xpSources: [
    { label: '모의투자', value: '+280 XP' },
    { label: '오늘의 PT', value: '+220 XP' },
    { label: '상황 퀴즈', value: '+120 XP' },
  ],
};

export const levelUp = {
  fromLevel: 2,
  toLevel: 3,
  fromTier: '새싹 2단계',
  toTier: '새싹 3단계',
  message: '공시 확인율이 눈에 띄게 좋아졌어요. KnowerBot이 한 단계 더 성장했어요!',
};

export const user = {
  nickname: '코스피초보',
  email: 'kospi_beginner@email.com',
  joinedAt: '2026.06.12 가입',
};

export const riskIntervention = {
  quantity: '40주',
  expectedRatio: '132%',
  liquidationThreshold: '140%',
  riskLevel: '위험',
  message:
    '지금 신용매수 40주를 진행하면 담보비율이 132%까지 떨어져요. 140% 아래로 내려가면 — 내 의사와 상관없이 반대매매가 발생할 수 있어요.',
};
