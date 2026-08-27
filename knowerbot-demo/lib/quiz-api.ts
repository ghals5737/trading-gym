import { authFetch } from './auth';
import type { SessionStatKey } from './user-api';

export interface PersonalizedQuizOptionResponse {
  id: string;
  position: number;
  label: string;
}

export interface PersonalizedQuizResponse {
  id: string;
  targetStatKey: SessionStatKey;
  question: string;
  options: PersonalizedQuizOptionResponse[];
  sourceOrgName: string | null;
  sourceTitle: string | null;
  sourcePageStart: number | null;
  sourcePageEnd: number | null;
  sourceSessionId: string | null;
  createdAt: string;
}

export interface QuizAnswerResponse {
  correct: boolean;
  correctOptionId: string;
  explanation: string;
}

// 답하기 전엔 correct/correctOptionId/explanation이 null — PersonalizedQuizResponse와
// 같은 이유(정답 미리 노출 방지)로 answered가 true일 때만 채워짐.
export interface QuizHistoryItemResponse {
  id: string;
  targetStatKey: SessionStatKey;
  question: string;
  options: PersonalizedQuizOptionResponse[];
  answered: boolean;
  answeredOptionId: string | null;
  correct: boolean | null;
  correctOptionId: string | null;
  explanation: string | null;
  sourceOrgName: string | null;
  sourceTitle: string | null;
  sourcePageStart: number | null;
  sourcePageEnd: number | null;
  sourceSessionId: string | null;
  createdAt: string;
}

// 유저의 가장 약한 session_stats 지표를 골라 RAG로 근거 자료를 찾고 LLM이 새 문제를 만듦
// (매번 새 문제 — 이전 문제를 덮어쓰지 않고 계속 쌓임).
export function generateQuiz(): Promise<PersonalizedQuizResponse> {
  return authFetch<PersonalizedQuizResponse>('/api/quiz/generate', { method: 'POST' });
}

// generateQuiz와 달리 유저 전체 평균이 아니라 세션 하나의 스탯만 보고 약점을 골라 문제를
// 만듦 — 모의투자가 막 끝난 직후(세션 종료 화면)에서 그 세션 결과로만 문제를 내줄 때 씀.
export function generateQuizForSession(sessionId: string): Promise<PersonalizedQuizResponse> {
  return authFetch<PersonalizedQuizResponse>(`/api/quiz/generate-for-session/${sessionId}`, { method: 'POST' });
}

// 가장 최근에 만들어둔 문제 — 없으면 null(204).
export function getLatestQuiz(): Promise<PersonalizedQuizResponse | null> {
  return authFetch<PersonalizedQuizResponse | null>('/api/quiz/latest');
}

export function submitQuizAnswer(quizId: string, selectedOptionId: string): Promise<QuizAnswerResponse> {
  return authFetch<QuizAnswerResponse>(`/api/quiz/${quizId}/answer`, {
    method: 'POST',
    body: JSON.stringify({ selectedOptionId }),
  });
}

// 지금까지 만들어진 모든 퀴즈(최신순) — /pt에서 targetStatKey별로 묶어서 보여줌.
export function getQuizHistory(): Promise<QuizHistoryItemResponse[]> {
  return authFetch<QuizHistoryItemResponse[]>('/api/quiz/history');
}
