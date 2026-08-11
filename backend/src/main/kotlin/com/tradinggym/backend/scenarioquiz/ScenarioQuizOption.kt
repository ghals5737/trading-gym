package com.tradinggym.backend.scenarioquiz

import com.tradinggym.backend.entity.SessionStatKey
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
import java.util.UUID

@Entity
@Table(
	name = "scenario_quiz_options",
	uniqueConstraints = [UniqueConstraint(columnNames = ["prompt_id", "position"])],
)
class ScenarioQuizOption(
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "prompt_id", nullable = false)
	var prompt: ScenarioQuizPrompt,

	@Column(nullable = false)
	var position: Int,

	@Column(columnDefinition = "text", nullable = false)
	var label: String,

	@Column(columnDefinition = "text", nullable = false)
	var hint: String,

	// 채점용 아님 — session_stats엔 절대 반영 안 됨. 유저의 약한 습관 축에 맞는
	// 프롬프트를 골라 보여주는 "타겟팅"용으로만 씀 (session_stat_key 재사용).
	@Enumerated(EnumType.STRING)
	@Column(name = "behavior_tag")
	var behaviorTag: SessionStatKey? = null,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null
}
