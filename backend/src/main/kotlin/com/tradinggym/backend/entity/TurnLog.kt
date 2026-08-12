package com.tradinggym.backend.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.FetchType
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import jakarta.persistence.UniqueConstraint
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

// 그 턴에 실제로 뭘 했는지 요약 — 관망만 했어도 HELD로 한 행이 남음(트레이드가 없어도 기록됨).
enum class TurnAction { HELD, TRADED, FORCED_LIQUIDATED }

// 턴이 시작될 때(세션 생성/advanceTurn) 미리 한 행이 열리고, 그 턴이 끝날 때 최종 스냅샷으로
// 확정됨(finalizeTurnLog) — trades와 달리 매매 여부와 무관하게 매 턴 반드시 존재함. AI가 세션
// 전체 턴을 시계열로 종합 분석할 때 이 테이블이 뼈대가 되고, 그 턴의 개별 매매는 trades.turn_log_id
// FK로 직접 연결됨.
@Entity
@Table(name = "turn_logs", uniqueConstraints = [UniqueConstraint(columnNames = ["session_id", "turn_number"])])
class TurnLog(
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "session_id", nullable = false)
	var session: SimulationSession,

	@Column(name = "turn_number", nullable = false)
	var turnNumber: Int,

	@Column(name = "turn_date", nullable = false)
	var turnDate: LocalDate,

	// 이 턴에 도달하기 위해 선택된 턴 단위(하루/일주일/한달) — advanceTurn 시점에 매번 고름.
	// 1턴째는 세션 생성 시점이라 "건너뛴" 게 없어서 null.
	@Enumerated(EnumType.STRING)
	@Column(name = "turn_unit")
	var turnUnit: TurnUnit? = null,

	@Column(nullable = false)
	var cash: BigDecimal,

	@Column(name = "borrowed_amount", nullable = false)
	var borrowedAmount: BigDecimal,

	@Column(name = "holdings_value", nullable = false)
	var holdingsValue: BigDecimal,

	@Column(name = "portfolio_value", nullable = false)
	var portfolioValue: BigDecimal,

	@Column(name = "trade_count", nullable = false)
	var tradeCount: Int,

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	var action: TurnAction,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	@Column(name = "created_at", nullable = false, updatable = false)
	var createdAt: Instant = Instant.now()
}
