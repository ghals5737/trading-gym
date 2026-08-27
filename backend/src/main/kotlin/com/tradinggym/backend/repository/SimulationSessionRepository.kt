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

	// 종료된 세션만 — 마이페이지 "모의고사 기록"(최신순).
	fun findByUser_UsernameAndStatusOrderByEndedAtDesc(
		username: String,
		status: SimulationSessionStatus,
	): List<SimulationSession>

	fun findByStatus(status: SimulationSessionStatus): List<SimulationSession>
}
