package com.tradinggym.backend.service.ai

import com.fasterxml.jackson.databind.ObjectMapper
import com.tradinggym.backend.service.EducationSearchResult
import org.slf4j.LoggerFactory

// 모의고사 진단 + 사용자가 실제로 쓴 메모 + RAG 근거 → 4지선다 한 문제.
// 기존 QuizGenerator(session_stats 기반)와 입력이 달라서 별도 인터페이스로 뒀다 —
// 이쪽은 "사용자가 이렇게 적었다"를 프롬프트의 중심에 놓는다.
data class ExamQuizInput(
	val patternLabel: String,
	val turnNo: Int,
	val stockName: String,
	val action: String,
	val memo: String,
	val outcomeChangePct: Double,
	val sourceExcerpts: List<EducationSearchResult>,
)

data class GeneratedExamQuiz(
	val question: String,
	val options: List<String>,
	val correctIndex: Int,
	val explanation: String,
	val whyThisQuestion: String?,
)

interface ExamQuizGenerator {
	// 실패하면 null — 서비스가 stub으로 폴백한다(퀴즈 화면이 비는 것보다 낫다).
	fun generate(input: ExamQuizInput): GeneratedExamQuiz?
}

object ExamQuizPrompt {
	private val log = LoggerFactory.getLogger(ExamQuizPrompt::class.java)
	private val mapper = ObjectMapper()

	fun build(input: ExamQuizInput): String {
		val sources = input.sourceExcerpts.mapIndexed { i, s ->
			"[자료 ${i + 1}] ${s.title} · ${s.orgName ?: ""} ${s.pageStart ?: ""}쪽\n" +
				s.content.replace(Regex("\\s+"), " ").take(700)
		}.joinToString("\n\n")

		return """
당신은 투자 교육 코치입니다. 아래 사용자의 실제 모의고사 판단을 보고,
제공된 교육자료에 근거해서 4지선다 문제 1개를 만들어주세요.

[사용자의 판단]
- ${input.turnNo}턴 ${input.stockName}에서 '${input.action}'를 선택
- 그 이유로 이렇게 적었습니다: "${input.memo}"
- 결과: 이후 ${input.outcomeChangePct}%
- 진단된 습관: ${input.patternLabel}

[교육자료 — 반드시 이 내용에만 근거할 것]
$sources

[요구사항]
1. 정답은 반드시 **하나만** 성립해야 한다. 나머지 3개 보기는 명백히 틀린 내용으로 쓸 것.
   (여러 개가 맞을 수 있는 보기를 만들면 문제로 성립하지 않는다)
2. 오답 보기도 그럴듯해야 하지만, 자세히 보면 왜 틀렸는지 분명해야 한다.
3. why_this_question에는 위 메모를 **직접 인용**해서 쓸 것.
   예: ${input.turnNo}턴에서 "${input.memo.take(20)}…"라고 적으셨죠. 그 판단의 근거를 다시 살펴보는 문제예요.
4. 자연스러운 한국어로 쓸 것. 사전에 없는 조어를 만들지 말 것.
5. 자료에 없는 내용을 지어내지 말 것.
6. 아래 JSON 형식으로만 답할 것 (설명 문장 없이 JSON만).
   <> 안은 채워야 할 내용에 대한 설명이니, 그 문구를 그대로 옮겨 적지 말 것.

{"question":"<질문 한 문장>","options":["<보기1>","<보기2>","<보기3>","<보기4>"],"correct_index":<정답 위치 0~3>,
 "explanation":"<왜 그 답이 맞는지 자료를 근거로 2~3문장>","why_this_question":"<위 3번 형식대로 메모를 인용한 한 문장>"}
""".trimIndent()
	}

	// LLM이 JSON 앞뒤에 말을 붙이는 경우가 있어 중괄호 구간만 잘라 파싱한다.
	fun parse(text: String): GeneratedExamQuiz? {
		val start = text.indexOf('{')
		val end = text.lastIndexOf('}')
		if (start < 0 || end <= start) {
			log.warn("퀴즈 응답에서 JSON을 찾지 못했습니다")
			return null
		}
		return try {
			val node = mapper.readTree(text.substring(start, end + 1))
			val options = node.path("options").map { it.asText() }
			val quiz = GeneratedExamQuiz(
				question = node.path("question").asText(""),
				options = options,
				correctIndex = node.path("correct_index").asInt(-1),
				explanation = node.path("explanation").asText(""),
				whyThisQuestion = node.path("why_this_question").asText(null),
			)
			if (validate(quiz)) quiz else null
		} catch (e: Exception) {
			log.warn("퀴즈 JSON 파싱 실패: ${e.message}")
			null
		}
	}

	// 형식만 검증한다 — "정답이 두 개 성립하는가" 같은 내용 검증은 못 한다(사람이 봐야 함).
	private fun validate(quiz: GeneratedExamQuiz): Boolean {
		if (quiz.question.isBlank() || quiz.explanation.isBlank()) return false
		if (quiz.options.size != 4 || quiz.options.any { it.isBlank() }) return false
		if (quiz.correctIndex !in 0..3) return false
		return true
	}
}
