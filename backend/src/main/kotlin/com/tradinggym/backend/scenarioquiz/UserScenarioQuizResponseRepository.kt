package com.tradinggym.backend.scenarioquiz

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface UserScenarioQuizResponseRepository : JpaRepository<UserScenarioQuizResponse, UUID> {
	fun findByUserId(userId: UUID): List<UserScenarioQuizResponse>
}
