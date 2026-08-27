package com.tradinggym.backend.service.ai

// 다섯 어댑터가 공유하는 프롬프트 조립 + 파싱. JSON 대신 줄 단위 포맷을 쓰는 이유는
// SessionStatAnalysisPrompt와 같음 — LLM이 JSON 문법을 미묘하게 깨뜨리는 것보다
// "PREFIX: 내용" 한 줄짜리 포맷이 정규식으로 훨씬 안정적으로 파싱됨.
object QuizGenerationPrompt {

	// 프롬프트 버전 실험(회의 결정: 프롬프트를 만들어두고 다음주에 품질 비교).
	// v1 = 기존 개념 확인형. v2 = 실전 시나리오형(상황을 주고 판단을 고르게 함) + 오답을
	// "초보자가 실제로 하는 착각"에서 뽑도록 지시. 선택은 application.yml quiz.prompt-version.
	// 출력 형식(QUESTION/OPTION/CORRECT/EXPLANATION)은 두 버전이 동일해서 parse는 하나로 공유.
	fun build(input: QuizGenerationInput): String = when (input.promptVersion) {
		"v2" -> buildV2(input)
		else -> buildV1(input)
	}

	private fun sourcesBlock(input: QuizGenerationInput): String =
		input.sourceExcerpts.joinToString("\n\n") { r ->
			val pages = if (r.pageStart != null) {
				if (r.pageStart == r.pageEnd) " · ${r.pageStart}쪽" else " · ${r.pageStart}-${r.pageEnd}쪽"
			} else ""
			"[${r.orgName ?: "출처 미상"} · ${r.title}$pages]\n${r.content}"
		}

	private const val OUTPUT_FORMAT = """아래 형식 그대로, 설명이나 다른 말 없이 정확히 이 형식으로만 출력해:
			QUESTION: <문제 한 문장>
			OPTION1: <보기1>
			OPTION2: <보기2>
			OPTION3: <보기3>
			OPTION4: <보기4>
			CORRECT: <정답 번호, 1~4 중 하나만>
			EXPLANATION: <정답 해설 2~3문장>"""

	private fun buildV1(input: QuizGenerationInput): String {
		return """
			너는 '트레이딩 짐' 투자 교육 서비스에서 사용자 맞춤 퀴즈를 만드는 역할이야.
			이 사용자는 "${input.targetStatLabel}" 지표가 약한 것으로 나타났어. 아래 공신력 있는
			금융교육 자료를 바탕으로, 그 개념을 확인할 수 있는 4지선다 퀴즈를 하나 만들어.
			- 자료에 실제로 나온 내용을 근거로 만들어(지어내지 마).
			- 오답도 그럴듯하게(너무 뻔하지 않게) 만들어.
			- 문제·보기는 짧고 명확하게.

			참고 자료:
			${sourcesBlock(input)}

			$OUTPUT_FORMAT
		""".trimIndent()
	}

	private fun buildV2(input: QuizGenerationInput): String {
		return """
			너는 '트레이딩 짐' 투자 교육 서비스의 AI 코치야. 이 사용자는 "${input.targetStatLabel}"
			지표가 약한 것으로 나타났어. 아래 공신력 있는 금융교육 자료를 근거로, 짧은 실전
			상황(시나리오)을 하나 주고 "이 상황에서 가장 바람직한 판단"을 고르는 4지선다
			퀴즈를 하나 만들어.
			- 시나리오는 사회초년생 첫 투자자가 실제로 겪을 법한 상황으로 2~3문장.
			- 정답 근거는 반드시 참고 자료에 실제로 나온 내용이어야 해(지어내지 마).
			- 오답 3개는 초보 투자자가 실제로 하는 착각·나쁜 습관에서 뽑아(매력적인 오답).
			- 해설에는 왜 정답이 맞는지와 함께, 오답 중 하나가 왜 위험한지도 한 문장 짚어줘.

			참고 자료:
			${sourcesBlock(input)}

			$OUTPUT_FORMAT
		""".trimIndent()
	}

	fun parse(raw: String): GeneratedQuiz? {
		val lines = raw.lines()
		fun field(prefix: String): String? =
			lines.firstOrNull { it.trim().startsWith(prefix) }?.substringAfter(":", "")?.trim()?.ifBlank { null }

		val question = field("QUESTION") ?: return null
		val options = (1..4).mapNotNull { field("OPTION$it") }
		if (options.size != 4) return null
		val correctIndex = field("CORRECT")?.firstOrNull { it.isDigit() }?.digitToInt()?.minus(1) ?: return null
		if (correctIndex !in options.indices) return null
		val explanation = field("EXPLANATION") ?: return null

		return GeneratedQuiz(question = question, options = options, correctIndex = correctIndex, explanation = explanation)
	}
}
