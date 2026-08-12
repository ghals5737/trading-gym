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
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

// HOLD = 그 턴에 아무 매매도 안 하고 관망 — trades에 종목 없는 행으로 남겨서, 매매든 관망이든
// "그 턴에 무슨 행동을 했는지 + 왜"를 항상 trades 하나로 조회할 수 있게 함(turn_logs와 분리 안 함).
enum class TradeSide { BUY, SELL, HOLD }
enum class TradeType { NORMAL, FORCED_LIQUIDATION } // FORCED_LIQUIDATION = 반대매매
enum class TradeOrderType { MARKET, LIMIT } // 시장가(그날 시가로 체결) / 지정가(범위 벗어나면 미체결)

// 매매 시점의 그날 시가/고가/저가를 같이 저장 — 외부 KRX 데이터를 다시 조인하지
// 않고도 이 행 하나만으로 "추격매수였는지" 같은 습관 판정이 가능하게 하려는 목적.
@Entity
@Table(name = "trades")
class Trade(
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "session_id", nullable = false)
	var session: SimulationSession,

	// 이 매매가 속한 턴 — turn_logs가 턴 시작 시점에 미리 생성돼있어서 항상 붙일 수 있음.
	// (session_id, simulated_trade_date)로 유추하는 대신 명시적 FK로 둬서 조인 없이 바로
	// "이 턴의 매매 전부"를 구할 수 있게 함 — AI가 턴 단위로 종합 분석할 때 필요해서.
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "turn_log_id", nullable = false)
	var turnLog: TurnLog,

	// turnLog.turnNumber를 그대로 복제한 값 — LAZY 관계를 트랜잭션 밖(toResponse 등)에서
	// 건드리지 않고도 응답에 turnNumber를 넣을 수 있게 하려는 목적(다른 필드들과 같은 원칙).
	@Column(name = "turn_number", nullable = false)
	var turnNumber: Int,

	// HOLD면 특정 종목이 없어서 전부 null.
	@Column(name = "stock_code")
	var stockCode: String? = null,

	@Column(name = "stock_name")
	var stockName: String? = null,

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	var side: TradeSide,

	@Enumerated(EnumType.STRING)
	@Column(name = "trade_type", nullable = false)
	var tradeType: TradeType = TradeType.NORMAL,

	@Enumerated(EnumType.STRING)
	@Column(name = "order_type")
	var orderType: TradeOrderType? = null, // HOLD면 null

	@Column(name = "limit_price")
	var limitPrice: BigDecimal? = null, // orderType = LIMIT일 때만 사용 — 그날 범위 모르는 채로 미리 정한 가격

	@Column(nullable = false)
	var filled: Boolean = true, // LIMIT인데 그날 저가~고가 범위를 벗어나면 false(미체결)

	@Column(name = "is_credit", nullable = false)
	var isCredit: Boolean = false,

	@Column(name = "leverage_ratio")
	var leverageRatio: BigDecimal? = null, // isCredit = true일 때만 사용

	@Column
	var quantity: Int? = null, // HOLD면 null

	@Column
	var price: BigDecimal? = null, // 체결가 — filled = true일 때만 값 있음

	@Column(name = "day_open_price")
	var dayOpenPrice: BigDecimal? = null, // HOLD면 null

	@Column(name = "day_high_price")
	var dayHighPrice: BigDecimal? = null, // HOLD면 null

	@Column(name = "day_low_price")
	var dayLowPrice: BigDecimal? = null, // HOLD면 null

	@Column(name = "viewed_disclosure", nullable = false)
	var viewedDisclosure: Boolean = false, // 매매 전 공시/재무정보 확인 여부

	// 매매 시 이유를 필수로 받음 — 채팅으로 KnowerBot이 직접 물어서 받은 자유 텍스트.
	// 분류 태그(reason_tag)는 없앰 — 나중에 리포트를 만들 때 이 텍스트 자체를 turn_log와
	// 함께 AI에 통째로 넘겨서 분석하는 방식으로 갈 예정이라, 미리 사람이 태그로 분류해둘
	// 필요가 없어짐(그리고 자기신고 태그라 신뢰도도 낮았음).
	@Column(name = "reason_text", nullable = false, columnDefinition = "text")
	var reasonText: String,

	@Column(name = "simulated_trade_date", nullable = false)
	var simulatedTradeDate: LocalDate,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	@Column(name = "created_at", nullable = false, updatable = false)
	var createdAt: Instant = Instant.now()
}
