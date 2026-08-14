package com.tradinggym.backend.dto

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
