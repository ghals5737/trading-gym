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
class OpenAiSearchQueryRewriter(
	@Value("\${openai.api-key}") private val apiKey: String,
	@Value("\${openai.model}") private val model: String,
) : SearchQueryRewriter {

	private val log = LoggerFactory.getLogger(javaClass)
	private val client = RestClient.create("https://api.openai.com")

	override fun rewrite(history: List<ChatTurn>, newMessage: String): String {
		if (apiKey.isBlank()) return SearchQueryRewritePrompt.fallback(newMessage)
		return try {
			val prompt = SearchQueryRewritePrompt.build(history, newMessage)
			val response = client.post()
				.uri("/v1/chat/completions")
				.header("Authorization", "Bearer $apiKey")
				.contentType(MediaType.APPLICATION_JSON)
				.body(OpenAiRewriteRequest(model = model, maxTokens = 60, messages = listOf(OpenAiRewriteMessage("user", prompt))))
				.retrieve()
				.body(OpenAiRewriteResponse::class.java)
			val text = response?.choices?.firstOrNull()?.message?.content.orEmpty()
			SearchQueryRewritePrompt.parse(text, newMessage)
		} catch (e: Exception) {
			log.warn("OpenAI 검색어 재작성 실패, 원문 그대로 검색: ${e.message}")
			SearchQueryRewritePrompt.fallback(newMessage)
		}
	}
}

private data class OpenAiRewriteRequest(
	val model: String,
	val messages: List<OpenAiRewriteMessage>,
	@JsonProperty("max_tokens") val maxTokens: Int,
)

private data class OpenAiRewriteMessage(val role: String, val content: String)

@JsonIgnoreProperties(ignoreUnknown = true)
private data class OpenAiRewriteResponse(val choices: List<OpenAiRewriteChoice> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
private data class OpenAiRewriteChoice(val message: OpenAiRewriteMessage = OpenAiRewriteMessage("", ""))
