package com.tradinggym.backend.repository

import com.tradinggym.backend.entity.TurnLog
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface TurnLogRepository : JpaRepository<TurnLog, UUID> {
	fun findBySessionIdOrderByTurnNumberAsc(sessionId: UUID): List<TurnLog>

	// "지금 열려있는 턴" 조회에 씀 — turn_number == session.turnCount인 행이 항상 그 턴.
	fun findBySessionIdAndTurnNumber(sessionId: UUID, turnNumber: Int): TurnLog?

	// 랭킹 계산용 — 종료된 세션의 마지막 turn_log가 최종 확정 portfolioValue를 갖고 있음
	// (completeSession이 finalizeTurnLog로 확정해둠).
	fun findTop1BySessionIdOrderByTurnNumberDesc(sessionId: UUID): TurnLog?
}
