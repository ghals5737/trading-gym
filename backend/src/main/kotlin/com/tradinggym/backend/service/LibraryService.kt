package com.tradinggym.backend.service

import com.tradinggym.backend.dto.LibraryDocumentDetailResponse
import com.tradinggym.backend.dto.LibraryDocumentResponse
import com.tradinggym.backend.dto.LibraryRecommendationItemResponse
import com.tradinggym.backend.dto.LibraryRecommendationsResponse
import com.tradinggym.backend.repository.EducationLibraryRepository
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException

// 자료실(/library) 본문 보기 — edu_pages(오버랩 없는 원본 페이지 텍스트, PDF 실제 쪽 단위)를
// page_number 순서로 보여줌. offset/limit은 페이지 단위 페이지네이션(한 번에 다 안 불러옴 —
// 책 한 권이 500쪽 넘는 것도 있어서 전체를 한 번에 내려주면 너무 무거움).
@Service
class LibraryService(
	private val repository: EducationLibraryRepository,
	private val aggregateStatService: AggregateStatService,
	private val educationSearchClient: EducationSearchClient,
) {

	fun listDocuments(): List<LibraryDocumentResponse> = repository.listDocuments()

	fun getDocumentDetail(id: Int, offset: Int, limit: Int): LibraryDocumentDetailResponse {
		val document = repository.findDocument(id)
			?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "자료를 찾을 수 없어요")
		val pages = repository.listPages(id, offset, limit)
		val total = repository.countPages(id)
		return LibraryDocumentDetailResponse(document, pages, offset, limit, total)
	}

	// 자료실 상단 추천 — 오늘의 PT와 같은 원리(가장 약한 스탯 → RAG 검색)를 자료 추천에 적용.
	// 아직 완료한 세션이 없으면 null(프론트는 추천 섹션 없이 전체 목록만 보여줌).
	fun getRecommendations(username: String): LibraryRecommendationsResponse? {
		val stats = aggregateStatService.getMyAggregateStats(username)
		val weakest = stats.minByOrNull { it.avgScorePct } ?: return null

		val label = SessionStatCatalog.LABEL.getValue(weakest.statKey)
		val query = SessionStatCatalog.SEARCH_QUERY.getValue(weakest.statKey)
		val documentsByTitle = repository.listDocuments().associateBy { it.title }

		val items = educationSearchClient.search(query, topK = 3).map { r ->
			LibraryRecommendationItemResponse(
				documentId = documentsByTitle[r.title]?.id,
				title = r.title,
				orgName = r.orgName,
				pageStart = r.pageStart,
				pageEnd = r.pageEnd,
				excerpt = r.content.take(160),
			)
		}
		if (items.isEmpty()) return null // RAG 검색 실패/무관 — 추천 섹션 자체를 숨김

		return LibraryRecommendationsResponse(
			targetStatKey = weakest.statKey,
			targetStatLabel = label,
			targetStatScore = weakest.avgScorePct,
			reason = "최근 모의고사에서 '${label}' 지표(평균 ${weakest.avgScorePct}점)가 가장 약했어요 — 이 부분을 보완할 자료를 골랐어요.",
			items = items,
		)
	}
}
