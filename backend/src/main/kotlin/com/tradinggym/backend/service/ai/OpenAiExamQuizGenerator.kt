package com.tradinggym.backend.service.ai

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient

// response_format=json_object로 JSON을 강제해 파싱 실패를 줄인다.
// 모델은 openai.model 설정을 따르는데, 실측상 gpt-4.1-nano는 이 작업에서
// 정답이 두 개 성립하는 문제를 만들곤 해서 gpt-4o-mini 이상을 권한다
// (비용 차이는 응시 1000회에 수백 원 수준 — mock-exam/README.md의 비교표 참고).
@Component
@ConditionalOnProperty(name = ["ai.provider"], havingValue = "openai")
class OpenAiExamQuizGenerator(
	@Value("\${openai.api-key}") private val apiKey: String,
	@Value("\${openai.model}") private val model: String,
) : ExamQuizGenerator {

	private val log = LoggerFactory.getLogger(javaClass)
	private val client = RestClient.create("https://api.openai.com")

	override fun generate(input: ExamQuizInput): GeneratedExamQuiz? {
		if (apiKey.isBlank()) {
			log.warn("OPENAI_API_KEY가 비어있어 모의고사 퀴즈를 만들 수 없습니다")
			return null
		}
		return try {
			val response = client.post()
				.uri("/v1/chat/completions")
				.header("Authorization", "Bearer $apiKey")
				.contentType(MediaType.APPLICATION_JSON)
				.body(
					ExamQuizRequest(
						model = model,
						maxTokens = 1200,
						responseFormat = ResponseFormat("json_object"),
						messages = listOf(
							ExamQuizMessage(
								"system",
								"너는 한국어 투자 교육 코치다. 제공된 자료에만 근거해 문제를 만들고, " +
									"반드시 요청된 JSON 형식으로만 답한다.",
							),
							ExamQuizMessage("user", ExamQuizPrompt.build(input)),
						),
					),
				)
				.retrieve()
				.body(ExamQuizResponse::class.java)
			val text = response?.choices?.firstOrNull()?.message?.content.orEmpty()
			ExamQuizPrompt.parse(text)
		} catch (e: Exception) {
			log.warn("OpenAI 모의고사 퀴즈 생성 실패: ${e.message}")
			null
		}
	}
}

private data class ExamQuizRequest(
	val model: String,
	val messages: List<ExamQuizMessage>,
	@JsonProperty("max_tokens") val maxTokens: Int,
	@JsonProperty("response_format") val responseFormat: ResponseFormat,
)

private data class ResponseFormat(val type: String)

private data class ExamQuizMessage(val role: String, val content: String)

@JsonIgnoreProperties(ignoreUnknown = true)
private data class ExamQuizResponse(val choices: List<ExamQuizChoice> = emptyList())

@JsonIgnoreProperties(ignoreUnknown = true)
private data class ExamQuizChoice(val message: ExamQuizMessage = ExamQuizMessage("", ""))
