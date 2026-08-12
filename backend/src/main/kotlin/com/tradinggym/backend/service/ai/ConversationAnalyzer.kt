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

// 답변 하나를 저장하기 직전에 즉석에서 판단하는 결과 — clear=false면 저장을 안 하고
// feedback을 그대로 채팅에 보여준 뒤 같은 문항을 다시 물어봄(saveAnswer 참고).
data class AnswerCheckResult(
	val clear: Boolean,
	val feedback: String? = null,
)

// 어댑터 인터페이스 — ai.provider 설정값에 따라 구현체 하나만 활성화됨(@ConditionalOnProperty).
// 매 턴마다 부르던 AnswerScoreExtractor/ProfileExplanationGenerator 두 인터페이스를 이걸로
// 통합함 — 대화가 끝난 뒤 딱 한 번만 호출되고, 채점과 설명을 같이 만들어냄.
interface ConversationAnalyzer {
	fun analyze(turns: List<ConversationTurnInput>): ConversationAnalysisResult

	// 답변 하나가 저장되기 직전에 부르는 가벼운 즉석 체크 — 그 문항이랑 아예 무관해
	// 보이면 즉시 피드백을 주고 재답변을 받기 위함(analyze의 unclearQuestionIds는
	// 6문항이 다 끝난 뒤에야 도는 최종 안전망이라 이거랑 역할이 다름).
	fun checkAnswer(turn: ConversationTurnInput): AnswerCheckResult
}
