import { authFetch } from './auth';
import { getMyInvestorProfile } from './onboarding-api';

// 모의고사 API 클라이언트 (백엔드 /api/exam). DTO 이름·모양은 ExamDtos.kt와 1:1이다.
//
// 진단은 서버(ExamDiagnosisRules)가 한다 — 예전엔 목업 JSON + lib/exam-diagnose.ts로
// 프론트에서 계산했는데, 규칙이 두 곳에 있으면 어긋나기 때문에 API 연결과 함께 서버로 넘겼다.

export type ExamAction = 'BUY' | 'SELL' | 'HOLD';
export type ExamAttemptStatus = 'IN_PROGRESS' | 'COMPLETED';
export type DiagnosisSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ChartPoint {
  d: string;
  c: number;
}
export interface NewsItem {
  tag: string;
  title: string;
}
export interface DisclosureRow {
  label: string;
  value: string;
  tone: string;
}
export interface Disclosure {
  rows: DisclosureRow[];
  note: string;
}

// 문제 제시용 — 정답 영역(outcome/ideal)은 서버 DTO에 아예 없다.
export interface ExamTurn {
  turnNo: number;
  stockName: string;
  sector: string | null;
  asOfDate: string;
  price: number;
  holdingQty: number;
  avgBuyPrice: number | null;
  chartPoints: ChartPoint[];
  news: NewsItem[];
  disclosure: Disclosure | null;
}

export interface ExamPaper {
  code: string;
  title: string;
  description: string | null;
  difficulty: string;
  totalTurns: number;
  startingCash: number;
}

export interface ExamAttempt {
  attemptId: string;
  paper: ExamPaper;
  status: ExamAttemptStatus;
  currentTurnNo: number;
  totalTurns: number;
  alignedCount: number | null;
  startedAt: string;
  completedAt: string | null;
  currentTurn: ExamTurn | null;
}

// 제출 응답 — 여기서 처음으로 결과가 공개된다.
export interface ExamTurnOutcome {
  turnNo: number;
  myAction: ExamAction;
  idealAction: ExamAction;
  isAligned: boolean;
  outcomePoints: ChartPoint[];
  outcomeChangePct: number;
  outcomeSummary: string;
  idealRationale: string;
  learningPoint: string;
  nextTurnNo: number | null;
  completed: boolean;
}

export interface SubmitTurnRequest {
  action: ExamAction;
  reasonMemo: string;
  viewedDisclosure: boolean;
  quantity?: number | null;
  secondsSpent?: number | null;
}

export interface DiagnosisEvidence {
  turnNo: number;
  stockName: string;
  action: ExamAction;
  matched: string[];
  memo: string;
  wasWrong: boolean;
}

export interface Diagnosis {
  patternKey: string;
  label: string;
  severity: DiagnosisSeverity;
  hitCount: number;
  evidence: DiagnosisEvidence[];
}

export interface ExamReport {
  attemptId: string;
  totalTurns: number;
  alignedCount: number;
  diagnoses: Diagnosis[];
}

export interface QuizSource {
  chunkId: number | null;
  title: string | null;
  orgName: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  score: number | null;
}

export interface QuizOption {
  id: string;
  position: number;
  label: string;
}

// answered가 false인 동안 correctOptionId·explanation은 서버가 null로 준다(정답 유출 방지).
export interface QuizQuestion {
  id: string;
  position: number;
  patternKey: string;
  relatedTurnNo: number | null;
  question: string;
  options: QuizOption[];
  source: QuizSource;
  answered: boolean;
  answeredOptionId: string | null;
  correctOptionId: string | null;
  correct: boolean | null;
  explanation: string | null;
  whyThisQuestion: string | null;
}

export interface QuizSet {
  id: string;
  attemptId: string;
  headline: string | null;
  generator: string;
  createdAt: string;
  questions: QuizQuestion[];
}

export interface QuizAnswerResult {
  correct: boolean;
  correctOptionId: string;
  explanation: string;
  whyThisQuestion: string | null;
}

export function startExam(paperCode?: string): Promise<ExamAttempt> {
  const query = paperCode ? `?paperCode=${encodeURIComponent(paperCode)}` : '';
  return authFetch<ExamAttempt>(`/api/exam/start${query}`, { method: 'POST' });
}

// 진행 중인 응시 — 없으면 204라서 authFetch가 null을 준다.
export function getActiveExam(): Promise<ExamAttempt | null> {
  return authFetch<ExamAttempt | null>('/api/exam/active');
}

export function getExamTurn(attemptId: string, turnNo: number): Promise<ExamTurn> {
  return authFetch<ExamTurn>(`/api/exam/${attemptId}/turns/${turnNo}`);
}

export function submitTurn(
  attemptId: string,
  request: SubmitTurnRequest,
): Promise<ExamTurnOutcome> {
  return authFetch<ExamTurnOutcome>(`/api/exam/${attemptId}/submit`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export function getExamReport(attemptId: string): Promise<ExamReport> {
  return authFetch<ExamReport>(`/api/exam/${attemptId}/report`);
}

// LLM 호출이 들어가서 10초 안팎 걸린다 — 호출하는 쪽에서 로딩 상태를 꼭 보여줄 것.
export function generateExamQuiz(attemptId: string): Promise<QuizSet> {
  return authFetch<QuizSet>(`/api/exam/${attemptId}/quiz`, { method: 'POST' });
}

export function getExamQuiz(attemptId: string): Promise<QuizSet | null> {
  return authFetch<QuizSet | null>(`/api/exam/${attemptId}/quiz`);
}

export function answerExamQuiz(
  questionId: string,
  selectedOptionId: string,
): Promise<QuizAnswerResult> {
  return authFetch<QuizAnswerResult>(`/api/exam/quiz/questions/${questionId}/answer`, {
    method: 'POST',
    body: JSON.stringify({ selectedOptionId }),
  });
}

// 투자성향은 있으면 보여주고 없으면 그냥 생략한다 — 온보딩을 안 한 사용자도
// 모의고사는 풀 수 있어야 해서, 실패를 화면 에러로 올리지 않는다.
export interface ExamProfileSummary {
  riskType: string;
  knowledgeLevel: string;
  infoHabit: string;
  explanationText: string | null;
}

export async function getMyInvestorProfileSafe(): Promise<ExamProfileSummary | null> {
  try {
    const profile = await getMyInvestorProfile();
    if (!profile) return null;
    return {
      riskType: profile.profileType,
      knowledgeLevel: profile.knowledgeLevel,
      infoHabit: profile.infoHabitLevel,
      explanationText: profile.explanationText ?? null,
    };
  } catch {
    return null;
  }
}
