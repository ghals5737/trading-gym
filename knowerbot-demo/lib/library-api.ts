import { authFetch } from './auth';

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

// RAG 인덱싱에 쓰는 edu_documents 원본 목록 — 파이썬 인덱서가 채워둔 실제 자료.
export function getLibraryDocuments(): Promise<LibraryDocumentResponse[]> {
  return authFetch<LibraryDocumentResponse[]>('/api/library/documents');
}

// edu_pages를 page_number 순서로 offset~offset+limit쪽만 이어붙여서 봄 — 책 한 권이
// 500쪽 넘는 것도 있어서 한 번에 다 안 불러오고 페이지 단위로 넘겨봄.
export function getLibraryDocument(id: number, offset: number, limit: number): Promise<LibraryDocumentDetailResponse> {
  return authFetch<LibraryDocumentDetailResponse>(`/api/library/documents/${id}?offset=${offset}&limit=${limit}`);
}
