package com.tradinggym.backend.service

import com.tradinggym.backend.dto.LibraryArticleDetailResponse
import com.tradinggym.backend.dto.LibraryArticleListResponse
import com.tradinggym.backend.dto.LibraryDocumentDetailResponse
import com.tradinggym.backend.dto.LibraryDocumentResponse
import com.tradinggym.backend.entity.SessionStatKey
import com.tradinggym.backend.repository.EducationLibraryRepository
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException

// 자료실(/library) — 기본으로는 edu_articles(LLM이 주제별로 묶어 블로그 형식으로 재작성한
// 글, articlegen.py가 미리 채워둠)를 보여줌. edu_pages(오버랩 없는 원본 페이지 그대로)는
// 필요할 때 원문 확인용으로만 씀.
@Service
class LibraryService(private val repository: EducationLibraryRepository) {

	fun listDocuments(): List<LibraryDocumentResponse> = repository.listDocuments()

	fun getDocumentDetail(id: Int, offset: Int, limit: Int): LibraryDocumentDetailResponse {
		val document = repository.findDocument(id)
			?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "자료를 찾을 수 없어요")
		val pages = repository.listPages(id, offset, limit)
		val total = repository.countPages(id)
		return LibraryDocumentDetailResponse(document, pages, offset, limit, total)
	}

	fun listArticles(documentId: Int, statKey: SessionStatKey?, offset: Int, limit: Int): LibraryArticleListResponse {
		val articles = repository.listArticles(documentId, statKey, offset, limit)
		val total = repository.countArticles(documentId, statKey)
		return LibraryArticleListResponse(articles, offset, limit, total)
	}

	fun getArticleStatCounts(documentId: Int): Map<SessionStatKey, Int> = repository.countArticlesByStatKey(documentId)

	fun getArticle(articleId: Int): LibraryArticleDetailResponse =
		repository.findArticle(articleId) ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "글을 찾을 수 없어요")
}
