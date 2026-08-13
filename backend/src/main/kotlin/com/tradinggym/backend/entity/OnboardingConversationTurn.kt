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
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import jakarta.persistence.UniqueConstraint
import java.time.Instant
import java.util.UUID

// 온보딩 채팅 한 문항의 원문 답변 — 매 턴마다 즉시 upsert 저장(재방문 시 이어하기용).
// 예전엔 여기서 점수까지 매 턴 즉시 채점했지만, 지금은 원문만 쌓아두고 submitOnboarding 때
// 대화 전체를 한 번에 AI에 넘겨 채점+설명을 같이 뽑음(ConversationAnalyzer).
// submit 이후에도 지우지 않음 — 나중에 이 사람 유형을 다시 뽑아내고 싶을 때 원본 대화가 있어야 해서.
@Entity
@Table(
	name = "onboarding_conversation_turns",
	uniqueConstraints = [UniqueConstraint(columnNames = ["user_id", "question_id"])],
)
class OnboardingConversationTurn(
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "user_id", nullable = false)
	var user: UserEntity,

	@Enumerated(EnumType.STRING)
	@Column(name = "question_id", nullable = false)
	var questionId: OnboardingQuestionId,

	@Column(name = "raw_answer_text", nullable = false, columnDefinition = "text")
	var rawAnswerText: String,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	@Column(name = "answered_at", nullable = false)
	var answeredAt: Instant = Instant.now()
}
