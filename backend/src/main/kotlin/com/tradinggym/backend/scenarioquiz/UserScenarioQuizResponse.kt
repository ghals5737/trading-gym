package com.tradinggym.backend.scenarioquiz

import com.tradinggym.backend.user.UserEntity
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

// session_id가 아니라 user_id로만 연결 — /quiz가 /simulation과 분리된 독립
// 라우트라서 특정 모의투자 세션에 종속시키지 않기로 함(session_scenario_quiz_responses에서 정정됨).
@Entity
@Table(name = "user_scenario_quiz_responses")
class UserScenarioQuizResponse(
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "user_id", nullable = false)
	var user: UserEntity,

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "prompt_id", nullable = false)
	var prompt: ScenarioQuizPrompt,

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "selected_option_id", nullable = false)
	var selectedOption: ScenarioQuizOption,

	@Column(name = "xp_gained", nullable = false)
	var xpGained: Int = 0,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	@Column(name = "answered_at", nullable = false, updatable = false)
	var answeredAt: Instant = Instant.now()
}
