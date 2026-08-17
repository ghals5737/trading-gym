package com.tradinggym.backend.service.ai

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.tradinggym.backend.dto.SessionStatScoreResponse
import com.tradinggym.backend.dto.SessionSummaryResponse
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient

@Component
@ConditionalOnProperty(name = ["ai.provider"], havingValue = "gemini")
class GeminiSessionStatAnalyzer(
	@Value("\${gemini.api-key}") private val apiKey: String,
	@Value("\${gemini.model}") private val model: String,
) : SessionStatAnalyzer {

	private val log = LoggerFactory.getLogger(javaClass)
	private val client = RestClient.create("https://generativelanguage.googleapis.com")

	override fun analyze(summary: SessionSummaryResponse): List<SessionStatScoreResponse> {
		if (apiKey.isBlank()) {
			log.warn("GEMINI_API_KEY가 비어있어 대체 채점으로 처리합니다")
			return SessionStatAnalysisPrompt.fallbackResult(summary)
		}
		return try {
			val prompt = SessionStatAnalysisPrompt.build(summary)
			val response = client.post()
				.uri("/v1beta/models/{model}:generateContent?key={apiKey}", model, apiKey)
				.contentType(MediaType.APPLICATION_JSON)
				.body(GeminiStatRequest(contents = listOf(GeminiStatContent(parts = listOf(GeminiStatPart(prompt))))))
				.retrieve()
				.body(GeminiStatResponse::class.java)
			val text = response?.candidates?.firstOrNull()?.content?.parts?.firstOrNull()?.text.orEmpty()
			SessionStatAnalysisPrompt.parse(text) ?: SessionStatAnalysisPrompt.fallbackResult(summary)
		} catch (e: Exception) {
			log.warn("Gemini 세션 채점 실패, 대체 채점으로 처리: ${e.message}")
			SessionStatAnalysisPrompt.fallbackResult(summary)
		}
	}
}

private data class GeminiStatRequest(val contents: List<GeminiStatContent>)

@JsonIgnoreProperties(ignoreUnknown = true)
private data class GeminiStatContent(val parts: List<GeminiStatPart> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
private data class GeminiStatPart(val text: String = "")

@JsonIgnoreProperties(ignoreUnknown = true)
private data class GeminiStatResponse(val candidates: List<GeminiStatCandidate> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
private data class GeminiStatCandidate(val content: GeminiStatContent = GeminiStatContent())
