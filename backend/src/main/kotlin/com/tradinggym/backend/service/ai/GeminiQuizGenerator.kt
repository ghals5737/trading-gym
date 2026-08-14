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
class GeminiQuizGenerator(
	@Value("\${gemini.api-key}") private val apiKey: String,
	@Value("\${gemini.model}") private val model: String,
) : QuizGenerator {

	private val log = LoggerFactory.getLogger(javaClass)
	private val client = RestClient.create("https://generativelanguage.googleapis.com")

	override fun generate(input: QuizGenerationInput): GeneratedQuiz? {
		if (apiKey.isBlank()) {
			log.warn("GEMINI_API_KEY가 비어있어 퀴즈를 만들 수 없습니다")
			return null
		}
		return try {
			val prompt = QuizGenerationPrompt.build(input)
			val response = client.post()
				.uri("/v1beta/models/{model}:generateContent?key={apiKey}", model, apiKey)
				.contentType(MediaType.APPLICATION_JSON)
				.body(GeminiQuizRequest(contents = listOf(GeminiQuizContent(parts = listOf(GeminiQuizPart(prompt))))))
				.retrieve()
				.body(GeminiQuizResponse::class.java)
			val text = response?.candidates?.firstOrNull()?.content?.parts?.firstOrNull()?.text.orEmpty()
			QuizGenerationPrompt.parse(text)
		} catch (e: Exception) {
			log.warn("Gemini 퀴즈 생성 실패: ${e.message}")
			null
		}
	}
}

private data class GeminiQuizRequest(val contents: List<GeminiQuizContent>)

@JsonIgnoreProperties(ignoreUnknown = true)
private data class GeminiQuizContent(val parts: List<GeminiQuizPart> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
private data class GeminiQuizPart(val text: String = "")

@JsonIgnoreProperties(ignoreUnknown = true)
private data class GeminiQuizResponse(val candidates: List<GeminiQuizCandidate> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
private data class GeminiQuizCandidate(val content: GeminiQuizContent = GeminiQuizContent())
