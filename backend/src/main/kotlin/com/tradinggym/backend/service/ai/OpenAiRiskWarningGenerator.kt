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
@ConditionalOnProperty(name = ["ai.provider"], havingValue = "openai")
class OpenAiRiskWarningGenerator(
	@Value("\${openai.api-key}") private val apiKey: String,
	@Value("\${openai.model}") private val model: String,
) : RiskWarningGenerator {

	private val log = LoggerFactory.getLogger(javaClass)
	private val client = RestClient.create("https://api.openai.com")

	override fun generate(request: RiskWarningRequest): String {
		if (apiKey.isBlank()) {
			log.warn("OPENAI_API_KEY가 비어있어 대체 경고 문구로 처리합니다")
			return RiskWarningPrompt.fallbackMessage(request)
		}
		return try {
			val prompt = RiskWarningPrompt.build(request)
			val response = client.post()
				.uri("/v1/chat/completions")
				.header("Authorization", "Bearer $apiKey")
				.contentType(MediaType.APPLICATION_JSON)
				.body(OpenAiRiskRequest(model = model, maxTokens = 300, messages = listOf(OpenAiRiskMessage("user", prompt))))
				.retrieve()
				.body(OpenAiRiskResponse::class.java)
			val text = response?.choices?.firstOrNull()?.message?.content.orEmpty()
			RiskWarningPrompt.parse(text, request)
		} catch (e: Exception) {
			log.warn("OpenAI 위험 경고 생성 실패, 대체 경고 문구로 처리: ${e.message}")
			RiskWarningPrompt.fallbackMessage(request)
		}
	}
}

private data class OpenAiRiskRequest(
	val model: String,
	val messages: List<OpenAiRiskMessage>,
	@JsonProperty("max_tokens") val maxTokens: Int,
)

private data class OpenAiRiskMessage(val role: String, val content: String)

@JsonIgnoreProperties(ignoreUnknown = true)
private data class OpenAiRiskResponse(val choices: List<OpenAiRiskChoice> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
private data class OpenAiRiskChoice(val message: OpenAiRiskMessage = OpenAiRiskMessage("", ""))
