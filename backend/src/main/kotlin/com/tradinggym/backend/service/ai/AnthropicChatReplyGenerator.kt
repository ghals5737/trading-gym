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
class AnthropicChatReplyGenerator(
	@Value("\${anthropic.api-key}") private val apiKey: String,
	@Value("\${anthropic.model}") private val model: String,
) : ChatReplyGenerator {

	private val log = LoggerFactory.getLogger(javaClass)
	private val client = RestClient.create("https://api.anthropic.com")

	override fun reply(history: List<ChatTurn>, newMessage: String): String {
		if (apiKey.isBlank()) {
			log.warn("ANTHROPIC_API_KEY가 비어있어 대체 답변으로 처리합니다")
			return ChatReplyPrompt.fallbackReply()
		}
		return try {
			val prompt = ChatReplyPrompt.build(history, newMessage)
			val response = client.post()
				.uri("/v1/messages")
				.header("x-api-key", apiKey)
				.header("anthropic-version", "2023-06-01")
				.contentType(MediaType.APPLICATION_JSON)
				.body(AnthropicChatRequest(model = model, maxTokens = 300, messages = listOf(AnthropicChatMessage("user", prompt))))
				.retrieve()
				.body(AnthropicChatResponse::class.java)
			val text = response?.content?.firstOrNull()?.text.orEmpty()
			ChatReplyPrompt.parse(text)
		} catch (e: Exception) {
			log.warn("Anthropic 채팅 답변 실패, 대체 답변으로 처리: ${e.message}")
			ChatReplyPrompt.fallbackReply()
		}
	}
}

private data class AnthropicChatRequest(
	val model: String,
	@JsonProperty("max_tokens") val maxTokens: Int,
	val messages: List<AnthropicChatMessage>,
)

private data class AnthropicChatMessage(val role: String, val content: String)

@JsonIgnoreProperties(ignoreUnknown = true)
private data class AnthropicChatResponse(val content: List<AnthropicChatContentBlock> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
private data class AnthropicChatContentBlock(val type: String = "", val text: String = "")
