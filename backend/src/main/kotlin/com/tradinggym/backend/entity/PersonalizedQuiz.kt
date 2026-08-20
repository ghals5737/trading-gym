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
import java.time.Instant
import java.util.UUID

// 유저의 가장 약한 session_stats 지표를 겨냥해 RAG로 근거 자료를 찾고 LLM이 생성한 4지선다
// 퀴즈 한 문제 — QuizGenerationService.generateForUser()가 만들어서 저장함.
@Entity
@Table(name = "personalized_quizzes")
class PersonalizedQuiz(
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "user_id", nullable = false)
	var user: UserEntity,

	@Enumerated(EnumType.STRING)
	@Column(name = "target_stat_key", nullable = false)
	var targetStatKey: SessionStatKey,

	@Column(nullable = false, columnDefinition = "text")
	var question: String,

	@Column(nullable = false, columnDefinition = "text")
	var explanation: String,

	// RAG 검색으로 찾은 근거 자료 1건 — 채팅 출처 표기랑 같은 형태(기관·제목·쪽수)로 남겨서
	// 프론트가 "이 문제는 이 자료를 바탕으로 만들어졌어요"라고 보여줄 수 있게 함.
	@Column(name = "source_org_name")
	var sourceOrgName: String?,

	@Column(name = "source_title")
	var sourceTitle: String?,

	@Column(name = "source_page_start")
	var sourcePageStart: Int?,

	@Column(name = "source_page_end")
	var sourcePageEnd: Int?,

	// 유저 전체 평균이 아니라 특정 세션 하나의 스탯만 보고 만들어졌으면 그 세션 id —
	// generateForUser()로 만든 퀴즈는 null(전체 평균 기반), generateForSession()은 채움.
	@Column(name = "source_session_id")
	var sourceSessionId: UUID?,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	@Column(name = "created_at", nullable = false)
	var createdAt: Instant = Instant.now()

	// 유저가 고른 보기 — 답하기 전엔 null. "지난 퀴즈" 목록에서 맞았는지/틀렸는지/아직
	// 안 풀었는지 보여주려고 QuizGenerationService.answer()에서 채움.
	@Column(name = "answered_option_id")
	var answeredOptionId: UUID? = null
}
