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
class OpenAiConversationAnalyzer(
	@Value("\${openai.api-key}") private val apiKey: String,
	@Value("\${openai.model}") private val model: String,
) : ConversationAnalyzer {

	private val log = LoggerFactory.getLogger(javaClass)
	private val client = RestClient.create("https://api.openai.com")

	override fun analyze(turns: List<ConversationTurnInput>): ConversationAnalysisResult {
		if (apiKey.isBlank()) {
			log.warn("OPENAI_API_KEY가 비어있어 대체 채점으로 처리합니다")
			return ConversationAnalysisPrompt.fallbackResult(turns)
		}
		return try {
			val prompt = ConversationAnalysisPrompt.build(turns)
			val response = client.post()
				.uri("/v1/chat/completions")
				.header("Authorization", "Bearer $apiKey")
				.contentType(MediaType.APPLICATION_JSON)
				.body(OpenAiAnalysisRequest(model = model, maxTokens = 600, messages = listOf(OpenAiAnalysisMessage("user", prompt))))
				.retrieve()
				.body(OpenAiAnalysisResponse::class.java)
			val text = response?.choices?.firstOrNull()?.message?.content.orEmpty()
			ConversationAnalysisPrompt.parse(text, turns.map { it.question.id }.toSet())
				?: ConversationAnalysisPrompt.fallbackResult(turns)
		} catch (e: Exception) {
			log.warn("OpenAI 대화 분석 실패, 대체 채점으로 처리: ${e.message}")
			ConversationAnalysisPrompt.fallbackResult(turns)
		}
	}

	override fun checkAnswer(turn: ConversationTurnInput): AnswerCheckResult {
		if (apiKey.isBlank()) return ConversationAnalysisPrompt.fallbackCheckResult(turn)
		return try {
			val prompt = ConversationAnalysisPrompt.buildCheckPrompt(turn)
			val response = client.post()
				.uri("/v1/chat/completions")
				.header("Authorization", "Bearer $apiKey")
				.contentType(MediaType.APPLICATION_JSON)
				.body(OpenAiAnalysisRequest(model = model, maxTokens = 200, messages = listOf(OpenAiAnalysisMessage("user", prompt))))
				.retrieve()
				.body(OpenAiAnalysisResponse::class.java)
			val text = response?.choices?.firstOrNull()?.message?.content.orEmpty()
			ConversationAnalysisPrompt.parseCheck(text) ?: ConversationAnalysisPrompt.fallbackCheckResult(turn)
		} catch (e: Exception) {
			log.warn("OpenAI 답변 체크 실패, 대체 판정으로 처리: ${e.message}")
			ConversationAnalysisPrompt.fallbackCheckResult(turn)
		}
	}
}

private data class OpenAiAnalysisRequest(
	val model: String,
	val messages: List<OpenAiAnalysisMessage>,
	@JsonProperty("max_tokens") val maxTokens: Int,
)

private data class OpenAiAnalysisMessage(val role: String, val content: String)

@JsonIgnoreProperties(ignoreUnknown = true)
private data class OpenAiAnalysisResponse(val choices: List<OpenAiAnalysisChoice> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
private data class OpenAiAnalysisChoice(val message: OpenAiAnalysisMessage = OpenAiAnalysisMessage("", ""))
