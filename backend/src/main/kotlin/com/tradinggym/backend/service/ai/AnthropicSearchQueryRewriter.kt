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
class AnthropicSearchQueryRewriter(
	@Value("\${anthropic.api-key}") private val apiKey: String,
	@Value("\${anthropic.model}") private val model: String,
) : SearchQueryRewriter {

	private val log = LoggerFactory.getLogger(javaClass)
	private val client = RestClient.create("https://api.anthropic.com")

	override fun rewrite(history: List<ChatTurn>, newMessage: String): String {
		if (apiKey.isBlank()) return SearchQueryRewritePrompt.fallback(newMessage)
		return try {
			val prompt = SearchQueryRewritePrompt.build(history, newMessage)
			val response = client.post()
				.uri("/v1/messages")
				.header("x-api-key", apiKey)
				.header("anthropic-version", "2023-06-01")
				.contentType(MediaType.APPLICATION_JSON)
				.body(AnthropicRewriteRequest(model = model, maxTokens = 60, messages = listOf(AnthropicRewriteMessage("user", prompt))))
				.retrieve()
				.body(AnthropicRewriteResponse::class.java)
			val text = response?.content?.firstOrNull()?.text.orEmpty()
			SearchQueryRewritePrompt.parse(text, newMessage)
		} catch (e: Exception) {
			log.warn("Anthropic 검색어 재작성 실패, 원문 그대로 검색: ${e.message}")
			SearchQueryRewritePrompt.fallback(newMessage)
		}
	}
}

private data class AnthropicRewriteRequest(
	val model: String,
	@JsonProperty("max_tokens") val maxTokens: Int,
	val messages: List<AnthropicRewriteMessage>,
)

private data class AnthropicRewriteMessage(val role: String, val content: String)

@JsonIgnoreProperties(ignoreUnknown = true)
private data class AnthropicRewriteResponse(val content: List<AnthropicRewriteContentBlock> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
private data class AnthropicRewriteContentBlock(val type: String = "", val text: String = "")
