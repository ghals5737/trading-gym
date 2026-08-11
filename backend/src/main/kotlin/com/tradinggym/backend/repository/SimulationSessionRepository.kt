package com.tradinggym.backend.repository

import com.tradinggym.backend.entity.SimulationSession
import com.tradinggym.backend.entity.SimulationSessionStatus
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface SimulationSessionRepository : JpaRepository<SimulationSession, UUID> {
	fun findByUserIdOrderByStartedAtDesc(userId: UUID): List<SimulationSession>
	fun findFirstByUserIdAndStatusOrderByStartedAtDesc(
		userId: UUID,
		status: SimulationSessionStatus,
	): SimulationSession?
}
