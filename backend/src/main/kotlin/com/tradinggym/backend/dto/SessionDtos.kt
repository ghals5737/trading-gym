package com.tradinggym.backend.dto

import com.tradinggym.backend.entity.SimulationSessionStatus
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

data class CreateSessionRequest(
	val startingCash: BigDecimal,
	val currentTurnDate: LocalDate,
)

data class SessionResponse(
	val id: UUID,
	val status: SimulationSessionStatus,
	val startingCash: BigDecimal,
	val currentCash: BigDecimal,
	val borrowedAmount: BigDecimal,
	val currentTurnDate: LocalDate,
	val startedAt: Instant,
	val endedAt: Instant?,
)
