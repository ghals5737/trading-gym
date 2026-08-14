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
class GeminiSearchQueryRewriter(
	@Value("\${gemini.api-key}") private val apiKey: String,
	@Value("\${gemini.model}") private val model: String,
) : SearchQueryRewriter {

	private val log = LoggerFactory.getLogger(javaClass)
	private val client = RestClient.create("https://generativelanguage.googleapis.com")

	override fun rewrite(history: List<ChatTurn>, newMessage: String): String {
		if (apiKey.isBlank()) return SearchQueryRewritePrompt.fallback(newMessage)
		return try {
			val prompt = SearchQueryRewritePrompt.build(history, newMessage)
			val response = client.post()
				.uri("/v1beta/models/{model}:generateContent?key={apiKey}", model, apiKey)
				.contentType(MediaType.APPLICATION_JSON)
				.body(GeminiRewriteRequest(contents = listOf(GeminiRewriteContent(parts = listOf(GeminiRewritePart(prompt))))))
				.retrieve()
				.body(GeminiRewriteResponse::class.java)
			val text = response?.candidates?.firstOrNull()?.content?.parts?.firstOrNull()?.text.orEmpty()
			SearchQueryRewritePrompt.parse(text, newMessage)
		} catch (e: Exception) {
			log.warn("Gemini 검색어 재작성 실패, 원문 그대로 검색: ${e.message}")
			SearchQueryRewritePrompt.fallback(newMessage)
		}
	}
}

private data class GeminiRewriteRequest(val contents: List<GeminiRewriteContent>)

@JsonIgnoreProperties(ignoreUnknown = true)
private data class GeminiRewriteContent(val parts: List<GeminiRewritePart> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
private data class GeminiRewritePart(val text: String = "")

@JsonIgnoreProperties(ignoreUnknown = true)
private data class GeminiRewriteResponse(val candidates: List<GeminiRewriteCandidate> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
private data class GeminiRewriteCandidate(val content: GeminiRewriteContent = GeminiRewriteContent())
