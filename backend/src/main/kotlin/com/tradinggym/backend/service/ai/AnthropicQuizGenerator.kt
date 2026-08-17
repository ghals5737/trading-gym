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
class AnthropicQuizGenerator(
	@Value("\${anthropic.api-key}") private val apiKey: String,
	@Value("\${anthropic.model}") private val model: String,
) : QuizGenerator {

	private val log = LoggerFactory.getLogger(javaClass)
	private val client = RestClient.create("https://api.anthropic.com")

	override fun generate(input: QuizGenerationInput): GeneratedQuiz? {
		if (apiKey.isBlank()) {
			log.warn("ANTHROPIC_API_KEY가 비어있어 퀴즈를 만들 수 없습니다")
			return null
		}
		return try {
			val prompt = QuizGenerationPrompt.build(input)
			val response = client.post()
				.uri("/v1/messages")
				.header("x-api-key", apiKey)
				.header("anthropic-version", "2023-06-01")
				.contentType(MediaType.APPLICATION_JSON)
				.body(AnthropicQuizRequest(model = model, maxTokens = 500, messages = listOf(AnthropicQuizMessage("user", prompt))))
				.retrieve()
				.body(AnthropicQuizResponse::class.java)
			val text = response?.content?.firstOrNull()?.text.orEmpty()
			QuizGenerationPrompt.parse(text)
		} catch (e: Exception) {
			log.warn("Anthropic 퀴즈 생성 실패: ${e.message}")
			null
		}
	}
}

private data class AnthropicQuizRequest(
	val model: String,
	@JsonProperty("max_tokens") val maxTokens: Int,
	val messages: List<AnthropicQuizMessage>,
)

private data class AnthropicQuizMessage(val role: String, val content: String)

@JsonIgnoreProperties(ignoreUnknown = true)
private data class AnthropicQuizResponse(val content: List<AnthropicQuizContentBlock> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
private data class AnthropicQuizContentBlock(val type: String = "", val text: String = "")
