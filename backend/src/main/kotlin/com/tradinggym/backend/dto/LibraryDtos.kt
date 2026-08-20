package com.tradinggym.backend.dto

import com.tradinggym.backend.entity.SessionStatKey

data class LibraryDocumentResponse(
	val id: Int,
	val title: String,
	val orgName: String?,
	val target: String?,
	val year: String?,
	val sourceUrl: String?,
	val pageCount: Int,
	val minPage: Int?,
	val maxPage: Int?,
	val articleCount: Int,
)

// edu_pages 한 행 = PDF 실제 한 쪽 — edu_chunks와 달리 오버랩 없음.
data class LibraryPageResponse(
	val pageNumber: Int,
	val content: String,
)

data class LibraryDocumentDetailResponse(
	val document: LibraryDocumentResponse,
	val pages: List<LibraryPageResponse>,
	val offset: Int,
	val limit: Int,
	val totalPages: Int,
)

// edu_articles 목록용 — 본문(body)은 무거워서 목록에는 안 담고 상세 조회에서만 줌.
// targetStatKey는 articlegen.py가 붙여둔 8개 지표 중 하나(/pt 맞춤 퀴즈와 같은 어휘) —
// 옛날에 만든 일부 글은 분류 실패로 비어있을 수 있어서 nullable.
data class LibraryArticleSummaryResponse(
	val id: Int,
	val title: String,
	val pageStart: Int,
	val pageEnd: Int,
	val topicSummary: String?,
	val targetStatKey: SessionStatKey?,
)

data class LibraryArticleListResponse(
	val articles: List<LibraryArticleSummaryResponse>,
	val offset: Int,
	val limit: Int,
	val total: Int,
)

data class LibraryArticleDetailResponse(
	val id: Int,
	val documentId: Int,
	val documentTitle: String,
	val orgName: String?,
	val title: String,
	val body: String,
	val pageStart: Int,
	val pageEnd: Int,
	val targetStatKey: SessionStatKey?,
)
