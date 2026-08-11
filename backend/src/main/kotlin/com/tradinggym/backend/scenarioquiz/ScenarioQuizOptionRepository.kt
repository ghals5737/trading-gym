package com.tradinggym.backend.scenarioquiz

import com.tradinggym.backend.entity.SessionStatKey
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface ScenarioQuizOptionRepository : JpaRepository<ScenarioQuizOption, UUID> {
	fun findByPromptIdOrderByPositionAsc(promptId: UUID): List<ScenarioQuizOption>
	fun findByBehaviorTag(behaviorTag: SessionStatKey): List<ScenarioQuizOption>
}
