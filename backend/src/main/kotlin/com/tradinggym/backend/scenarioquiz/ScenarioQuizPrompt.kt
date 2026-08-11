package com.tradinggym.backend.scenarioquiz

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "scenario_quiz_prompts")
class ScenarioQuizPrompt(
	@Column(columnDefinition = "text", nullable = false)
	var headline: String,

	@Column(columnDefinition = "text", nullable = false)
	var context: String,

	@Column(name = "feedback_template", columnDefinition = "text", nullable = false)
	var feedbackTemplate: String,

	@Column(name = "xp_reward", nullable = false)
	var xpReward: Int = 0,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	@Column(name = "created_at", nullable = false, updatable = false)
	var createdAt: Instant = Instant.now()
}
