package com.tradinggym.backend.dto

import com.tradinggym.backend.entity.InvestorInfoHabitLevel
import com.tradinggym.backend.entity.InvestorKnowledgeLevel
import com.tradinggym.backend.entity.InvestorProfileType
import com.tradinggym.backend.entity.OnboardingQuestionId
import java.time.Instant
import java.util.UUID

data class OnboardingOptionResponse(
	val score: Int,
	val label: String,
)

data class OnboardingQuestionResponse(
	val id: OnboardingQuestionId,
	val text: String,
	val options: List<OnboardingOptionResponse>,
)

// 채팅 문항 하나에 대한 자유 텍스트 답 — 저장만 함(채점은 안 함). 채점+설명은 6문항이
// 다 모이면 submitOnboarding이 대화 전체를 한 번에 AI에 넘겨서 같이 뽑아냄.
data class SaveAnswerRequest(
	val questionId: OnboardingQuestionId,
	val rawText: String,
)

data class SavedAnswerResponse(
	val questionId: OnboardingQuestionId,
	val rawAnswerText: String,
)

// saveAnswer 호출 결과 — accepted=false면 저장을 안 했다는 뜻이고(그 문항이랑 아예
// 무관해 보이는 답), feedback을 채팅에 보여준 뒤 같은 문항을 다시 물어봐야 함.
data class SaveAnswerResult(
	val questionId: OnboardingQuestionId,
	val accepted: Boolean,
	val feedback: String?,
)

data class InvestorProfileResponse(
	val id: UUID,
	val profileType: InvestorProfileType, // 리스크 성향 (안정형/중립형/공격형)
	val riskTotalScore: Int,
	val knowledgeLevel: InvestorKnowledgeLevel, // 투자 지식 수준 (초보/중급/숙련)
	val knowledgeTotalScore: Int,
	val infoHabitLevel: InvestorInfoHabitLevel, // 정보 습관 (직접조사형/균형형/의존형)
	val infoHabitTotalScore: Int,
	val explanationText: String,
	val createdAt: Instant,
)

// profile과 questionsToRetry 중 하나만 채워짐 — 답변 중 질문이랑 아예 무관해 보이는 게
// 있으면 profile은 null이고 questionsToRetry에 그 문항들이 담김(그 문항 답은 서버에서
// 이미 지워졌으니 프론트는 그 문항부터 다시 물어보면 됨. 기존 이어하기 로직 재사용).
data class SubmitOnboardingResponse(
	val profile: InvestorProfileResponse?,
	val questionsToRetry: List<OnboardingQuestionId>?,
)
