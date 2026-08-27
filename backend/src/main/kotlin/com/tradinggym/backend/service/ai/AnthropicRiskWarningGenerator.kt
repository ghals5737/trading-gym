package com.tradinggym.backend.service.ai

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty
import com.tradinggym.backend.dto.RiskWarningRequest
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient

@Component
@ConditionalOnProperty(name = ["ai.provider"], havingValue = "anthropic")
class AnthropicRiskWarningGenerator(
	@Value("\${anthropic.api-key}") private val apiKey: String,
	@Value("\${anthropic.model}") private val model: String,
) : RiskWarningGenerator {

	private val log = LoggerFactory.getLogger(javaClass)
	private val client = RestClient.create("https://api.anthropic.com")

	override fun generate(request: RiskWarningRequest): String {
		if (apiKey.isBlank()) {
			log.warn("ANTHROPIC_API_KEY가 비어있어 대체 경고 문구로 처리합니다")
			return RiskWarningPrompt.fallbackMessage(request)
		}
		return try {
			val prompt = RiskWarningPrompt.build(request)
			val response = client.post()
				.uri("/v1/messages")
				.header("x-api-key", apiKey)
				.header("anthropic-version", "2023-06-01")
				.contentType(MediaType.APPLICATION_JSON)
				.body(AnthropicRiskRequest(model = model, maxTokens = 300, messages = listOf(AnthropicRiskMessage("user", prompt))))
				.retrieve()
				.body(AnthropicRiskResponse::class.java)
			val text = response?.content?.firstOrNull()?.text.orEmpty()
			RiskWarningPrompt.parse(text, request)
		} catch (e: Exception) {
			log.warn("Anthropic 위험 경고 생성 실패, 대체 경고 문구로 처리: ${e.message}")
			RiskWarningPrompt.fallbackMessage(request)
		}
	}
}

private data class AnthropicRiskRequest(
	val model: String,
	@JsonProperty("max_tokens") val maxTokens: Int,
	val messages: List<AnthropicRiskMessage>,
)

private data class AnthropicRiskMessage(val role: String, val content: String)

@JsonIgnoreProperties(ignoreUnknown = true)
private data class AnthropicRiskResponse(val content: List<AnthropicRiskContentBlock> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
private data class AnthropicRiskContentBlock(val type: String = "", val text: String = "")
