package com.tradinggym.backend.service

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.web.client.RestClient

// KnowerBot 채팅에서 참고할 금융교육 자료 발췌 — edu-rag-indexer(별도 파이썬 프로세스)의
// /api/search를 호출해서 받아옴. 임베딩 모델이 파이썬 전용 라이브러리(sentence-transformers)라
// JVM 안에서 못 돌리고, 이렇게 내부 HTTP 호출로 분리함.
data class EducationSearchResult(
	val score: Double,
	val title: String,
	val orgName: String?,
	val pageStart: Int?,
	val pageEnd: Int?,
	val content: String,
)

@Service
class EducationSearchClient(
	@Value("\${education.search.base-url}") private val baseUrl: String,
) {
	private val log = LoggerFactory.getLogger(javaClass)
	private val client = RestClient.create(baseUrl)

	// 이 밑으로는 "이 청크는 이 질문이랑 딱히 상관없다"로 보고 프롬프트에 안 끼워넣음 —
	// 안 그러면 잡담이나 무관한 질문에도 엉뚱한 자료가 근거인 척 붙는 걸 막기 위함.
	// 0.5는 실측 기준: 관련 있는 질의는 0.68~0.77, 반대매매처럼 자료가 약한 주제도 0.56~0.58,
	// 완전 무관하면 그보다 훨씬 낮게 나옴(RAG PIPELINE.md 실측치 참고).
	fun search(query: String, topK: Int = 3): List<EducationSearchResult> {
		if (query.isBlank()) return emptyList()
		return try {
			// 쿼리를 직접 URLEncoder로 인코딩해서 문자열에 끼워넣으면 RestClient가 URI 템플릿을
			// 만들면서 한 번 더 인코딩해 이중 인코딩(%25EC...)이 됨 — {q} 플레이스홀더로 원문을
			// 그대로 넘겨서 RestClient가 딱 한 번만 인코딩하게 함.
			val response = client.get()
				.uri("/api/search?q={q}&top_k={topK}", query, topK)
				.retrieve()
				.body(SearchApiResponse::class.java)
			response?.results
				.orEmpty()
				.filter { it.score >= MIN_RELEVANT_SCORE }
				.map { EducationSearchResult(it.score, it.title, it.orgName, it.pageStart, it.pageEnd, it.content) }
		} catch (e: Exception) {
			log.warn("RAG 검색 실패, 근거 자료 없이 답변 생성: ${e.message}")
			emptyList()
		}
	}

	companion object {
		private const val MIN_RELEVANT_SCORE = 0.5
	}
}

@JsonIgnoreProperties(ignoreUnknown = true)
private data class SearchApiResponse(val results: List<SearchApiResult> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
private data class SearchApiResult(
	val score: Double,
	val title: String,
	@JsonProperty("org_name") val orgName: String?,
	@JsonProperty("page_start") val pageStart: Int?,
	@JsonProperty("page_end") val pageEnd: Int?,
	val content: String,
)
