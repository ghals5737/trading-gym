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
@ConditionalOnProperty(name = ["ai.provider"], havingValue = "openai")
class OpenAiQuizGenerator(
	@Value("\${openai.api-key}") private val apiKey: String,
	@Value("\${openai.model}") private val model: String,
) : QuizGenerator {

	private val log = LoggerFactory.getLogger(javaClass)
	private val client = RestClient.create("https://api.openai.com")

	override fun generate(input: QuizGenerationInput): GeneratedQuiz? {
		if (apiKey.isBlank()) {
			log.warn("OPENAI_API_KEY가 비어있어 퀴즈를 만들 수 없습니다")
			return null
		}
		return try {
			val prompt = QuizGenerationPrompt.build(input)
			val response = client.post()
				.uri("/v1/chat/completions")
				.header("Authorization", "Bearer $apiKey")
				.contentType(MediaType.APPLICATION_JSON)
				.body(OpenAiQuizRequest(model = model, maxTokens = 500, messages = listOf(OpenAiQuizMessage("user", prompt))))
				.retrieve()
				.body(OpenAiQuizResponse::class.java)
			val text = response?.choices?.firstOrNull()?.message?.content.orEmpty()
			QuizGenerationPrompt.parse(text)
		} catch (e: Exception) {
			log.warn("OpenAI 퀴즈 생성 실패: ${e.message}")
			null
		}
	}
}

private data class OpenAiQuizRequest(
	val model: String,
	val messages: List<OpenAiQuizMessage>,
	@JsonProperty("max_tokens") val maxTokens: Int,
)

private data class OpenAiQuizMessage(val role: String, val content: String)

@JsonIgnoreProperties(ignoreUnknown = true)
private data class OpenAiQuizResponse(val choices: List<OpenAiQuizChoice> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
private data class OpenAiQuizChoice(val message: OpenAiQuizMessage = OpenAiQuizMessage("", ""))
