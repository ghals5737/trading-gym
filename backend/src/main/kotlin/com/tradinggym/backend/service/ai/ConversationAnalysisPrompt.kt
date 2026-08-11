package com.tradinggym.backend.service.ai

import com.tradinggym.backend.entity.OnboardingQuestionId

// 다섯 어댑터(ConversationAnalyzer 구현체)가 공유하는 프롬프트 조립 + 응답 파싱 + 폴백.
object ConversationAnalysisPrompt {

	fun build(turns: List<ConversationTurnInput>): String {
		val transcript = turns.mapIndexed { i, turn ->
			val rubric = turn.question.options.joinToString("\n") { "  ${it.score}점 — ${it.label}" }
			"""
				[${i + 1}] 문항: ${turn.question.text}
				루브릭:
				$rubric
				사용자 답변: "${turn.rawAnswerText}"
			""".trimIndent()
		}.joinToString("\n\n")

		val scoreLines = turns.joinToString("\n") { "${it.question.id}: <점수 또는 UNCLEAR>" }

		return """
			너는 '트레이딩 짐'이라는 모의투자 교육 서비스의 AI 코치야. 사용자와 투자성향 진단 채팅을 막 끝냈어.
			아래는 문항별로 사용자가 자유롭게 답한 전체 대화야. 각 문항에는 1~4점짜리 채점 기준(루브릭)이 있어.

			$transcript

			할 일:
			1. 각 문항마다 사용자 답변이 루브릭 중 어디에 가장 가까운지 1~4 사이 점수를 매겨. 앞뒤 문항의 맥락
			   (모순되는 답이 있는지, 전체적인 톤 등)도 참고해서 판단해도 좋아. 단, 답변이 그 문항이랑 아예
			   무관해 보이면(예: 투자 목적을 물었는데 날씨 얘기를 하는 경우) 점수 대신 UNCLEAR라고 써.
			2. 모든 문항이 정상적으로 채점됐을 때만 사용자에게 보여줄 2~3문장짜리 진단 설명을 한국어로 써.
			   이 문항들은 세 축으로 나뉘어: 리스크 성향(얼마나 큰 위험을 감수하고 싶은지), 투자 지식
			   (실제로 얼마나 아는지), 정보 습관(직접 조사하는지 vs SNS·리딩방 같은 검증 안 된 정보에
			   의존하는지). 리스크는 크게 감수하려는데 지식은 부족하고 정보도 SNS·리딩방에 의존하는
			   조합이면 이게 실전에서 반대매매·빚투로 무너지기 제일 쉬운 조합이니 분명히 짚어주고,
			   실용적인 조언도 담아. 존댓말로, 코치처럼 친근하되 전문적으로. 문항 중 하나라도
			   UNCLEAR면 이 설명 줄은 비워둬(재질문이 필요해서 지금은 의미가 없음).

			아래 형식 그대로만 출력해(다른 말 절대 덧붙이지 마):
			$scoreLines
			---
			<설명 문단 또는 빈 줄>
		""".trimIndent()
	}

	// "QUESTION_ID: 3" 또는 "QUESTION_ID: UNCLEAR" 줄을 각 문항마다 관대하게 찾음.
	// 6개 문항이 점수/UNCLEAR 어느 쪽으로도 하나도 안 잡히면 파싱 실패로 보고 null
	// (호출부가 fallbackResult로 대체). 하나라도 UNCLEAR면 설명은 비어있어도 됨(재질문할 거라).
	fun parse(rawResponse: String, questionIds: Set<OnboardingQuestionId>): ConversationAnalysisResult? {
		val scores = mutableMapOf<OnboardingQuestionId, Int>()
		val unclear = mutableSetOf<OnboardingQuestionId>()
		for (id in questionIds) {
			val match = Regex("${id.name}\\s*[:=]?\\s*(UNCLEAR|[1-4])").find(rawResponse) ?: continue
			val value = match.groupValues[1]
			if (value == "UNCLEAR") unclear += id else scores[id] = value.toInt()
		}
		if (scores.keys + unclear != questionIds) return null
		if (unclear.isNotEmpty()) {
			return ConversationAnalysisResult(scoresByQuestion = scores, unclearQuestionIds = unclear, explanationText = "")
		}
		val explanation = rawResponse.substringAfter("---", "").trim().ifBlank { null } ?: return null
		return ConversationAnalysisResult(scoresByQuestion = scores, explanationText = explanation)
	}

	// LLM 호출이 실패하거나 응답 파싱이 안 될 때 — 답변 텍스트에 리터럴 숫자(1~4)가 있으면
	// 그걸 쓰고, 없으면 중간값. 설명은 이 분석 자체가 실패한 상황이라 일반적인 안내만 함
	// (진단 결과에 맞춘 문구는 대화 분석이 정상 동작할 때만 의미가 있음).
	fun fallbackResult(turns: List<ConversationTurnInput>): ConversationAnalysisResult {
		val scores = turns.associate { turn ->
			val validScores = turn.question.options.map { it.score }.toSet()
			val typedDigit = Regex("[1-9]").findAll(turn.rawAnswerText)
				.map { it.value.toInt() }
				.firstOrNull { it in validScores }
			turn.question.id to (typedDigit ?: validScores.sorted()[validScores.size / 2])
		}
		return ConversationAnalysisResult(
			scoresByQuestion = scores,
			explanationText = "지금은 AI 설명을 만들지 못했어요. 답변을 바탕으로 채점은 정상적으로 반영됐어요.",
		)
	}
}
