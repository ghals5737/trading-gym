package com.tradinggym.backend.service.ai

import com.tradinggym.backend.dto.OnboardingQuestionResponse
import com.tradinggym.backend.entity.OnboardingQuestionId

// 온보딩 채팅 한 턴(질문 + 사용자의 자유 텍스트 답) — 분석 시점에 전체 대화를 한 번에 넘기려고 묶음.
data class ConversationTurnInput(
	val question: OnboardingQuestionResponse,
	val rawAnswerText: String,
)

// LLM이 대화 전체를 보고 한 번에 뽑아낸 결과 — 6개 문항 점수(룰 기반 최종 판정의 재료)와
// 설명 문단을 같이 반환함. 스코어는 여전히 1~4점 고정 루브릭 기준(문항별 options)에 맞춰야 함.
// unclearQuestionIds: 답변이 그 문항이랑 아예 상관없어 보이는 문항들 — 이게 하나라도 있으면
// scoresByQuestion/explanationText는 최종 판정에 안 쓰이고, 그 문항들만 다시 물어보게 됨.
data class ConversationAnalysisResult(
	val scoresByQuestion: Map<OnboardingQuestionId, Int>,
	val unclearQuestionIds: Set<OnboardingQuestionId> = emptySet(),
	val explanationText: String,
)

// 어댑터 인터페이스 — ai.provider 설정값에 따라 구현체 하나만 활성화됨(@ConditionalOnProperty).
// 매 턴마다 부르던 AnswerScoreExtractor/ProfileExplanationGenerator 두 인터페이스를 이걸로
// 통합함 — 대화가 끝난 뒤 딱 한 번만 호출되고, 채점과 설명을 같이 만들어냄.
interface ConversationAnalyzer {
	fun analyze(turns: List<ConversationTurnInput>): ConversationAnalysisResult
}
