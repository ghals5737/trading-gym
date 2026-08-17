package com.tradinggym.backend.service.ai

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty
import com.tradinggym.backend.service.EducationSearchResult
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient

@Component
@ConditionalOnProperty(name = ["ai.provider"], havingValue = "openai")
class OpenAiChatReplyGenerator(
	@Value("\${openai.api-key}") private val apiKey: String,
	@Value("\${openai.model}") private val model: String,
) : ChatReplyGenerator {

	private val log = LoggerFactory.getLogger(javaClass)
	private val client = RestClient.create("https://api.openai.com")

	override fun reply(history: List<ChatTurn>, newMessage: String, ragContext: List<EducationSearchResult>): String {
		if (apiKey.isBlank()) {
			log.warn("OPENAI_API_KEY가 비어있어 대체 답변으로 처리합니다")
			return ChatReplyPrompt.fallbackReply()
		}
		return try {
			val prompt = ChatReplyPrompt.build(history, newMessage, ragContext)
			val response = client.post()
				.uri("/v1/chat/completions")
				.header("Authorization", "Bearer $apiKey")
				.contentType(MediaType.APPLICATION_JSON)
				.body(OpenAiChatRequest(model = model, maxTokens = 300, messages = listOf(OpenAiChatMessage("user", prompt))))
				.retrieve()
				.body(OpenAiChatResponse::class.java)
			val text = response?.choices?.firstOrNull()?.message?.content.orEmpty()
			ChatReplyPrompt.parse(text)
		} catch (e: Exception) {
			log.warn("OpenAI 채팅 답변 실패, 대체 답변으로 처리: ${e.message}")
			ChatReplyPrompt.fallbackReply()
		}
	}
}

private data class OpenAiChatRequest(
	val model: String,
	val messages: List<OpenAiChatMessage>,
	@JsonProperty("max_tokens") val maxTokens: Int,
)

private data class OpenAiChatMessage(val role: String, val content: String)

@JsonIgnoreProperties(ignoreUnknown = true)
private data class OpenAiChatResponse(val choices: List<OpenAiChatChoice> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
private data class OpenAiChatChoice(val message: OpenAiChatMessage = OpenAiChatMessage("", ""))
