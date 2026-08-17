package com.tradinggym.backend.dto

import com.tradinggym.backend.entity.TurnAction
import com.tradinggym.backend.entity.TurnUnit
import java.math.BigDecimal
import java.time.LocalDate
import java.util.UUID

data class TurnLogResponse(
	val id: UUID,
	val turnNumber: Int,
	val turnDate: LocalDate,
	val turnUnit: TurnUnit?, // 1턴째는 건너뛴 게 없어서 null
	val cash: BigDecimal,
	val borrowedAmount: BigDecimal,
	val holdingsValue: BigDecimal,
	val portfolioValue: BigDecimal,
	val tradeCount: Int,
	val action: TurnAction,
)
