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

	// 랭킹 계산용 — 종료된 세션만 최종 수익률로 집계함(진행 중인 세션은 아직 확정 전).
	fun findByStatus(status: SimulationSessionStatus): List<SimulationSession>
}
