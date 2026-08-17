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
  createdAt: string;
}

// 유저의 가장 약한 session_stats 지표를 골라 RAG로 근거 자료를 찾고 LLM이 새 문제를 만듦
// (매번 새 문제 — 이전 문제를 덮어쓰지 않고 계속 쌓임).
export function generateQuiz(): Promise<PersonalizedQuizResponse> {
  return authFetch<PersonalizedQuizResponse>('/api/quiz/generate', { method: 'POST' });
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
