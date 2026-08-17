package com.tradinggym.backend.service.ai

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.tradinggym.backend.service.EducationSearchResult
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient

@Component
@ConditionalOnProperty(name = ["ai.provider"], havingValue = "gemini")
class GeminiChatReplyGenerator(
	@Value("\${gemini.api-key}") private val apiKey: String,
	@Value("\${gemini.model}") private val model: String,
) : ChatReplyGenerator {

	private val log = LoggerFactory.getLogger(javaClass)
	private val client = RestClient.create("https://generativelanguage.googleapis.com")

	override fun reply(history: List<ChatTurn>, newMessage: String, ragContext: List<EducationSearchResult>): String {
		if (apiKey.isBlank()) {
			log.warn("GEMINI_API_KEY가 비어있어 대체 답변으로 처리합니다")
			return ChatReplyPrompt.fallbackReply()
		}
		return try {
			val prompt = ChatReplyPrompt.build(history, newMessage, ragContext)
			val response = client.post()
				.uri("/v1beta/models/{model}:generateContent?key={apiKey}", model, apiKey)
				.contentType(MediaType.APPLICATION_JSON)
				.body(GeminiChatRequest(contents = listOf(GeminiChatContent(parts = listOf(GeminiChatPart(prompt))))))
				.retrieve()
				.body(GeminiChatResponse::class.java)
			val text = response?.candidates?.firstOrNull()?.content?.parts?.firstOrNull()?.text.orEmpty()
			ChatReplyPrompt.parse(text)
		} catch (e: Exception) {
			log.warn("Gemini 채팅 답변 실패, 대체 답변으로 처리: ${e.message}")
			ChatReplyPrompt.fallbackReply()
		}
	}
}

private data class GeminiChatRequest(val contents: List<GeminiChatContent>)

@JsonIgnoreProperties(ignoreUnknown = true)
private data class GeminiChatContent(val parts: List<GeminiChatPart> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
private data class GeminiChatPart(val text: String = "")

@JsonIgnoreProperties(ignoreUnknown = true)
private data class GeminiChatResponse(val candidates: List<GeminiChatCandidate> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
private data class GeminiChatCandidate(val content: GeminiChatContent = GeminiChatContent())
