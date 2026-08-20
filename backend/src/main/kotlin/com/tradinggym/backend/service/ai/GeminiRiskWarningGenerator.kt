package com.tradinggym.backend.service.ai

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.tradinggym.backend.dto.RiskWarningRequest
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient

@Component
@ConditionalOnProperty(name = ["ai.provider"], havingValue = "gemini")
class GeminiRiskWarningGenerator(
	@Value("\${gemini.api-key}") private val apiKey: String,
	@Value("\${gemini.model}") private val model: String,
) : RiskWarningGenerator {

	private val log = LoggerFactory.getLogger(javaClass)
	private val client = RestClient.create("https://generativelanguage.googleapis.com")

	override fun generate(request: RiskWarningRequest): String {
		if (apiKey.isBlank()) {
			log.warn("GEMINI_API_KEY가 비어있어 대체 경고 문구로 처리합니다")
			return RiskWarningPrompt.fallbackMessage(request)
		}
		return try {
			val prompt = RiskWarningPrompt.build(request)
			val response = client.post()
				.uri("/v1beta/models/{model}:generateContent?key={apiKey}", model, apiKey)
				.contentType(MediaType.APPLICATION_JSON)
				.body(GeminiRiskRequest(contents = listOf(GeminiRiskContent(parts = listOf(GeminiRiskPart(prompt))))))
				.retrieve()
				.body(GeminiRiskResponse::class.java)
			val text = response?.candidates?.firstOrNull()?.content?.parts?.firstOrNull()?.text.orEmpty()
			RiskWarningPrompt.parse(text, request)
		} catch (e: Exception) {
			log.warn("Gemini 위험 경고 생성 실패, 대체 경고 문구로 처리: ${e.message}")
			RiskWarningPrompt.fallbackMessage(request)
		}
	}
}

private data class GeminiRiskRequest(val contents: List<GeminiRiskContent>)

@JsonIgnoreProperties(ignoreUnknown = true)
private data class GeminiRiskContent(val parts: List<GeminiRiskPart> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
private data class GeminiRiskPart(val text: String = "")

@JsonIgnoreProperties(ignoreUnknown = true)
private data class GeminiRiskResponse(val candidates: List<GeminiRiskCandidate> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
private data class GeminiRiskCandidate(val content: GeminiRiskContent = GeminiRiskContent())
