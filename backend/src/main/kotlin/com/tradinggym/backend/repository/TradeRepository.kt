package com.tradinggym.backend.repository

import com.tradinggym.backend.entity.Trade
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface TradeRepository : JpaRepository<Trade, UUID> {
	fun findBySessionIdOrderBySimulatedTradeDateAsc(sessionId: UUID): List<Trade>

	// 턴 마감(finalize) 시 그 턴에 있었던 매매 전부를 모아 tradeCount/action을 다시 계산하는 데 씀.
	fun findByTurnLogId(turnLogId: UUID): List<Trade>
}
