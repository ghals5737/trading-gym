package com.tradinggym.backend.service.ai

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient

@Component
@ConditionalOnProperty(name = ["ai.provider"], havingValue = "anthropic")
class AnthropicConversationAnalyzer(
	@Value("\${anthropic.api-key}") private val apiKey: String,
	@Value("\${anthropic.model}") private val model: String,
) : ConversationAnalyzer {

	private val log = LoggerFactory.getLogger(javaClass)
	private val client = RestClient.create("https://api.anthropic.com")

	override fun analyze(turns: List<ConversationTurnInput>): ConversationAnalysisResult {
		if (apiKey.isBlank()) {
			log.warn("ANTHROPIC_API_KEY가 비어있어 대체 채점으로 처리합니다")
			return ConversationAnalysisPrompt.fallbackResult(turns)
		}
		return try {
			val prompt = ConversationAnalysisPrompt.build(turns)
			val response = client.post()
				.uri("/v1/messages")
				.header("x-api-key", apiKey)
				.header("anthropic-version", "2023-06-01")
				.contentType(MediaType.APPLICATION_JSON)
				.body(AnthropicAnalysisRequest(model = model, maxTokens = 600, messages = listOf(AnthropicAnalysisMessage("user", prompt))))
				.retrieve()
				.body(AnthropicAnalysisResponse::class.java)
			val text = response?.content?.firstOrNull()?.text.orEmpty()
			ConversationAnalysisPrompt.parse(text, turns.map { it.question.id }.toSet())
				?: ConversationAnalysisPrompt.fallbackResult(turns)
		} catch (e: Exception) {
			log.warn("Anthropic 대화 분석 실패, 대체 채점으로 처리: ${e.message}")
			ConversationAnalysisPrompt.fallbackResult(turns)
		}
	}
}

private data class AnthropicAnalysisRequest(
	val model: String,
	@JsonProperty("max_tokens") val maxTokens: Int,
	val messages: List<AnthropicAnalysisMessage>,
)

private data class AnthropicAnalysisMessage(val role: String, val content: String)

@JsonIgnoreProperties(ignoreUnknown = true)
private data class AnthropicAnalysisResponse(val content: List<AnthropicAnalysisContentBlock> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
private data class AnthropicAnalysisContentBlock(val type: String = "", val text: String = "")
