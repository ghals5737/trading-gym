package com.tradinggym.backend.service.ai

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

// 기본 어댑터 — 실제 LLM 없이도 퀴즈 화면이 항상 동작하도록 함. 지표 이름만 문제에 끼워넣고
// 나머지는 고정된 예시 문제(반대매매 소재)를 씀.
@Component
@ConditionalOnProperty(name = ["ai.provider"], havingValue = "stub", matchIfMissing = true)
class StubQuizGenerator : QuizGenerator {
	override fun generate(input: QuizGenerationInput): GeneratedQuiz = GeneratedQuiz(
		question = "\"${input.targetStatLabel}\" 관련해서, 신용거래 담보비율이 기준 아래로 떨어지면 어떻게 될까요?",
		options = listOf(
			"알림만 오고 내가 직접 판단해서 판다",
			"증권사가 내 의사와 상관없이 강제로 판다(반대매매)",
			"아무 일도 일어나지 않는다",
			"자동으로 추가 대출이 실행된다",
		),
		correctIndex = 1,
		explanation = "담보비율이 기준 아래로 떨어지면 증권사가 다음 거래일에 시장가로 강제 매도해요 — 이게 반대매매예요.",
	)
}
