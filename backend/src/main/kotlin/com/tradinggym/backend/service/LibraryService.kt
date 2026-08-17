package com.tradinggym.backend.service

import com.tradinggym.backend.dto.LibraryDocumentDetailResponse
import com.tradinggym.backend.dto.LibraryDocumentResponse
import com.tradinggym.backend.repository.EducationLibraryRepository
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException

// 자료실(/library) 본문 보기 — edu_pages(오버랩 없는 원본 페이지 텍스트, PDF 실제 쪽 단위)를
// page_number 순서로 보여줌. offset/limit은 페이지 단위 페이지네이션(한 번에 다 안 불러옴 —
// 책 한 권이 500쪽 넘는 것도 있어서 전체를 한 번에 내려주면 너무 무거움).
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
}
