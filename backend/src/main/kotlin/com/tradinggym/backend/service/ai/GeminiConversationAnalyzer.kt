package com.tradinggym.backend.service.ai

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient

@Component
@ConditionalOnProperty(name = ["ai.provider"], havingValue = "gemini")
class GeminiConversationAnalyzer(
	@Value("\${gemini.api-key}") private val apiKey: String,
	@Value("\${gemini.model}") private val model: String,
) : ConversationAnalyzer {

	private val log = LoggerFactory.getLogger(javaClass)
	private val client = RestClient.create("https://generativelanguage.googleapis.com")

	override fun analyze(turns: List<ConversationTurnInput>): ConversationAnalysisResult {
		if (apiKey.isBlank()) {
			log.warn("GEMINI_API_KEY가 비어있어 대체 채점으로 처리합니다")
			return ConversationAnalysisPrompt.fallbackResult(turns)
		}
		return try {
			val prompt = ConversationAnalysisPrompt.build(turns)
			val response = client.post()
				.uri("/v1beta/models/{model}:generateContent?key={apiKey}", model, apiKey)
				.contentType(MediaType.APPLICATION_JSON)
				.body(GeminiAnalysisRequest(contents = listOf(GeminiAnalysisContent(parts = listOf(GeminiAnalysisPart(prompt))))))
				.retrieve()
				.body(GeminiAnalysisResponse::class.java)
			val text = response?.candidates?.firstOrNull()?.content?.parts?.firstOrNull()?.text.orEmpty()
			ConversationAnalysisPrompt.parse(text, turns.map { it.question.id }.toSet())
				?: ConversationAnalysisPrompt.fallbackResult(turns)
		} catch (e: Exception) {
			log.warn("Gemini 대화 분석 실패, 대체 채점으로 처리: ${e.message}")
			ConversationAnalysisPrompt.fallbackResult(turns)
		}
	}
}

private data class GeminiAnalysisRequest(val contents: List<GeminiAnalysisContent>)

@JsonIgnoreProperties(ignoreUnknown = true)
private data class GeminiAnalysisContent(val parts: List<GeminiAnalysisPart> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
private data class GeminiAnalysisPart(val text: String = "")

@JsonIgnoreProperties(ignoreUnknown = true)
private data class GeminiAnalysisResponse(val candidates: List<GeminiAnalysisCandidate> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
private data class GeminiAnalysisCandidate(val content: GeminiAnalysisContent = GeminiAnalysisContent())
