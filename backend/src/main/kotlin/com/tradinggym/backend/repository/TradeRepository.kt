package com.tradinggym.backend.repository

import com.tradinggym.backend.entity.Trade
import org.springframework.data.jpa.repository.JpaRepository
import java.time.LocalDate
import java.util.UUID

interface TradeRepository : JpaRepository<Trade, UUID> {
	fun findBySessionIdOrderBySimulatedTradeDateAsc(sessionId: UUID): List<Trade>

	// 하루 한 종목당 주문 한 번만 — 미체결 지정가도 그날의 시도로 침, 재시도로
	// 그날 범위를 알아내는 걸(이분탐색) 막기 위함.
	fun existsBySessionIdAndStockCodeAndSimulatedTradeDate(
		sessionId: UUID,
		stockCode: String,
		simulatedTradeDate: LocalDate,
	): Boolean
}
