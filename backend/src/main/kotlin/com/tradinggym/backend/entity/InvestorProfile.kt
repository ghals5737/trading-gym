package com.tradinggym.backend.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.FetchType
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.OneToOne
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

enum class InvestorProfileType { STABLE, NEUTRAL, AGGRESSIVE } // 리스크 성향 축
enum class InvestorKnowledgeLevel { BEGINNER, INTERMEDIATE, ADVANCED } // 투자 지식 축
enum class InvestorInfoHabitLevel { INDEPENDENT, MIXED, DEPENDENT } // 정보 습관 축 — SNS·리딩방 의존도

enum class OnboardingAxis { RISK, KNOWLEDGE, INFO_HABIT }

// 문항이 셋 중 어느 축에 합산되는지를 enum 자체에 붙여둠 — "리스크를 얼마나 감수하고
// 싶은지" / "실제로 얼마나 아는지" / "정보를 어디서·얼마나 검증 없이 받아들이는지"는
// 서로 다른 질문이라 따로 채점함. INFO_HABIT은 트레이딩 짐 기획안의 핵심 문제의식
// ("SNS·리딩방 정보에 의존해 뛰어드는 사회초년생")을 직접 겨냥한 축.
enum class OnboardingQuestionId(val axis: OnboardingAxis) {
	INVESTMENT_PURPOSE(OnboardingAxis.RISK),
	EXPERIENCE_LEVEL(OnboardingAxis.KNOWLEDGE),
	LOSS_REACTION(OnboardingAxis.RISK),
	RISK_PREFERENCE(OnboardingAxis.RISK),
	INVESTMENT_HORIZON(OnboardingAxis.RISK),
	KNOWLEDGE_CHECK(OnboardingAxis.KNOWLEDGE),
	LEVERAGE_ATTITUDE(OnboardingAxis.RISK),
	LIQUIDATION_UNDERSTANDING(OnboardingAxis.KNOWLEDGE),
	INFO_SOURCE(OnboardingAxis.INFO_HABIT),
	TIP_VERIFICATION(OnboardingAxis.INFO_HABIT),
}

// AiCharacter와 같은 이유로 @MapsId 대신 합성 UUID PK + unique(user_id).
// 온보딩을 다시 하면 기존 행을 갱신(재진단)하는 방식 — 히스토리를 남기지 않음.
@Entity
@Table(name = "investor_profiles")
class InvestorProfile(
	@OneToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "user_id", nullable = false, unique = true)
	var user: UserEntity,

	@Column(name = "investment_purpose_score", nullable = false)
	var investmentPurposeScore: Int,

	@Column(name = "experience_level_score", nullable = false)
	var experienceLevelScore: Int,

	@Column(name = "loss_reaction_score", nullable = false)
	var lossReactionScore: Int,

	@Column(name = "risk_preference_score", nullable = false)
	var riskPreferenceScore: Int,

	@Column(name = "investment_horizon_score", nullable = false)
	var investmentHorizonScore: Int,

	@Column(name = "knowledge_check_score", nullable = false)
	var knowledgeCheckScore: Int,

	@Column(name = "leverage_attitude_score", nullable = false)
	var leverageAttitudeScore: Int,

	@Column(name = "liquidation_understanding_score", nullable = false)
	var liquidationUnderstandingScore: Int,

	@Column(name = "info_source_score", nullable = false)
	var infoSourceScore: Int,

	@Column(name = "tip_verification_score", nullable = false)
	var tipVerificationScore: Int,

	@Column(name = "risk_total_score", nullable = false)
	var riskTotalScore: Int,

	@Column(name = "knowledge_total_score", nullable = false)
	var knowledgeTotalScore: Int,

	@Column(name = "info_habit_total_score", nullable = false)
	var infoHabitTotalScore: Int,

	@Enumerated(EnumType.STRING)
	@Column(name = "profile_type", nullable = false)
	var profileType: InvestorProfileType,

	@Enumerated(EnumType.STRING)
	@Column(name = "knowledge_level", nullable = false)
	var knowledgeLevel: InvestorKnowledgeLevel,

	@Enumerated(EnumType.STRING)
	@Column(name = "info_habit_level", nullable = false)
	var infoHabitLevel: InvestorInfoHabitLevel,

	@Column(name = "explanation_text", nullable = false, columnDefinition = "text")
	var explanationText: String,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	@Column(name = "created_at", nullable = false)
	var createdAt: Instant = Instant.now()
}
