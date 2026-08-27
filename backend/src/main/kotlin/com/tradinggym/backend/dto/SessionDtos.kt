package com.tradinggym.backend.dto

import com.tradinggym.backend.entity.SimulationSessionStatus
import com.tradinggym.backend.entity.TurnUnit
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

// currentTurnDate(시작일)~targetEndDate(종료 예정일) 둘 다 사용자가 직접 고름 —
// 두 날짜 모두 실제 거래일이어야 하고, 데이터 앞뒤 buffer 안이어야 하고, 그 사이에
// 실제 거래일이 최소 MIN_START_DATE_RANGE_DAYS일 이상 있어야 함(SimulationService 검증).
data class CreateSessionRequest(
	val startingCash: BigDecimal,
	val currentTurnDate: LocalDate,
	val targetEndDate: LocalDate,
)

// turnUnit(하루/일주일/한달)은 세션 시작이 아니라 매 턴 넘길 때마다 고름 — 필수.
// 이번 턴에 매매를 하나도 안 했으면(관망) holdReasonText도 필수 — 있으면 HOLD 성격의 trades
// 행이 하나 남음. 이번 턴에 이미 매매를 했으면 holdReasonText는 무시됨(그 매매들의 reasonText로 충분).
data class AdvanceTurnRequest(
	val turnUnit: TurnUnit,
	val holdReasonText: String? = null,
)

data class SessionResponse(
	val id: UUID,
	val status: SimulationSessionStatus,
	val startingCash: BigDecimal,
	val currentCash: BigDecimal,
	val borrowedAmount: BigDecimal,
	// 미수금 상환 기한 안내용 — 미수금이 없으면 셋 다 null/false.
	// debtDeadlineTurn = 미수 발생 턴 + 10. 그 턴이 끝날 때까지 못 갚으면 debtOverdue가 켜짐.
	val debtOpenedTurnNumber: Int?,
	val debtDeadlineTurn: Int?,
	val debtOverdue: Boolean,
	val startTurnDate: LocalDate, // 시뮬레이션 시작 거래일 — 기간 진행률(프로그래스바)의 시작점
	val currentTurnDate: LocalDate,
	val targetEndDate: LocalDate,
	val turnCount: Int,
	val maxTurns: Int,
	val startedAt: Instant,
	val endedAt: Instant?,
)
