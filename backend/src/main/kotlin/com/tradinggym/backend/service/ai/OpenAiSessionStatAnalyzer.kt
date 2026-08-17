package com.tradinggym.backend.service.ai

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty
import com.tradinggym.backend.dto.SessionStatScoreResponse
import com.tradinggym.backend.dto.SessionSummaryResponse
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient

@Component
@ConditionalOnProperty(name = ["ai.provider"], havingValue = "openai")
class OpenAiSessionStatAnalyzer(
	@Value("\${openai.api-key}") private val apiKey: String,
	@Value("\${openai.model}") private val model: String,
) : SessionStatAnalyzer {

	private val log = LoggerFactory.getLogger(javaClass)
	private val client = RestClient.create("https://api.openai.com")

	override fun analyze(summary: SessionSummaryResponse): List<SessionStatScoreResponse> {
		if (apiKey.isBlank()) {
			log.warn("OPENAI_API_KEY가 비어있어 대체 채점으로 처리합니다")
			return SessionStatAnalysisPrompt.fallbackResult(summary)
		}
		return try {
			val prompt = SessionStatAnalysisPrompt.build(summary)
			val response = client.post()
				.uri("/v1/chat/completions")
				.header("Authorization", "Bearer $apiKey")
				.contentType(MediaType.APPLICATION_JSON)
				.body(OpenAiStatRequest(model = model, maxTokens = 700, messages = listOf(OpenAiStatMessage("user", prompt))))
				.retrieve()
				.body(OpenAiStatResponse::class.java)
			val text = response?.choices?.firstOrNull()?.message?.content.orEmpty()
			SessionStatAnalysisPrompt.parse(text) ?: SessionStatAnalysisPrompt.fallbackResult(summary)
		} catch (e: Exception) {
			log.warn("OpenAI 세션 채점 실패, 대체 채점으로 처리: ${e.message}")
			SessionStatAnalysisPrompt.fallbackResult(summary)
		}
	}
}

private data class OpenAiStatRequest(
	val model: String,
	val messages: List<OpenAiStatMessage>,
	@JsonProperty("max_tokens") val maxTokens: Int,
)

private data class OpenAiStatMessage(val role: String, val content: String)

@JsonIgnoreProperties(ignoreUnknown = true)
private data class OpenAiStatResponse(val choices: List<OpenAiStatChoice> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
private data class OpenAiStatChoice(val message: OpenAiStatMessage = OpenAiStatMessage("", ""))
