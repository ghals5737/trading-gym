import { authFetch } from './auth';
import type { SessionStatKey } from './user-api';

export interface LibraryDocumentResponse {
  id: number;
  title: string;
  orgName: string | null;
  target: string | null;
  year: string | null;
  sourceUrl: string | null;
  pageCount: number;
  minPage: number | null;
  maxPage: number | null;
  articleCount: number;
}

// edu_pages 한 건 = PDF 실제 한 쪽 원문 그대로 (edu_chunks와 달리 오버랩 없음).
export interface LibraryPageResponse {
  pageNumber: number;
  content: string;
}

export interface LibraryDocumentDetailResponse {
  document: LibraryDocumentResponse;
  pages: LibraryPageResponse[];
  offset: number;
  limit: number;
  totalPages: number;
}

// edu_articles 목록용 — articlegen.py가 원문을 주제별로 묶어 블로그 형식으로 미리
// 재작성해둔 글. 본문(body)은 무거워서 목록에는 안 담김. targetStatKey는 /pt 맞춤 퀴즈와
// 같은 8개 지표 중 하나(옛날 글은 분류 실패로 비어있을 수 있어 null 가능).
export interface LibraryArticleSummaryResponse {
  id: number;
  title: string;
  pageStart: number;
  pageEnd: number;
  topicSummary: string | null;
  targetStatKey: SessionStatKey | null;
}

export interface LibraryArticleListResponse {
  articles: LibraryArticleSummaryResponse[];
  offset: number;
  limit: number;
  total: number;
}

export interface LibraryArticleDetailResponse {
  id: number;
  documentId: number;
  documentTitle: string;
  orgName: string | null;
  title: string;
  body: string;
  pageStart: number;
  pageEnd: number;
  targetStatKey: SessionStatKey | null;
}

// RAG 인덱싱에 쓰는 edu_documents 원본 목록 — 파이썬 인덱서가 채워둔 실제 자료.
export function getLibraryDocuments(): Promise<LibraryDocumentResponse[]> {
  return authFetch<LibraryDocumentResponse[]>('/api/library/documents');
}

// edu_pages를 page_number 순서로 offset~offset+limit쪽만 이어붙여서 봄 — 원문 그대로 확인용
// (지금 화면에서는 안 쓰지만 근거 확인용으로 API는 남겨둠).
export function getLibraryDocument(id: number, offset: number, limit: number): Promise<LibraryDocumentDetailResponse> {
  return authFetch<LibraryDocumentDetailResponse>(`/api/library/documents/${id}?offset=${offset}&limit=${limit}`);
}

export function getLibraryArticles(
  documentId: number,
  options: { statKey?: SessionStatKey; offset?: number; limit?: number } = {},
): Promise<LibraryArticleListResponse> {
  const params = new URLSearchParams();
  if (options.statKey) params.set('statKey', options.statKey);
  params.set('offset', String(options.offset ?? 0));
  params.set('limit', String(options.limit ?? 20));
  return authFetch<LibraryArticleListResponse>(`/api/library/documents/${documentId}/articles?${params.toString()}`);
}

// 필터 칩에 "판단 정확도 (12)"처럼 지표별 개수를 보여주려고 씀.
export function getLibraryArticleStatCounts(documentId: number): Promise<Partial<Record<SessionStatKey, number>>> {
  return authFetch<Partial<Record<SessionStatKey, number>>>(`/api/library/documents/${documentId}/articles/stat-counts`);
}

export function getLibraryArticle(articleId: number): Promise<LibraryArticleDetailResponse> {
  return authFetch<LibraryArticleDetailResponse>(`/api/library/articles/${articleId}`);
}
