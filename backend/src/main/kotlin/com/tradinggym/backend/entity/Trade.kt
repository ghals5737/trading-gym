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

enum class TradeSide { BUY, SELL }
enum class TradeType { NORMAL, FORCED_LIQUIDATION } // FORCED_LIQUIDATION = 반대매매
enum class TradeOrderType { MARKET, LIMIT } // 시장가(그날 시가로 체결) / 지정가(범위 벗어나면 미체결)

enum class TradeReason {
	FUNDAMENTALS,        // 실적/공시 근거
	TECHNICAL_SIGNAL,    // 기술적 신호
	STOP_LOSS,           // 손절
	AVERAGING_DOWN,      // 물타기
	CHASE_BUY,           // 추격매수
	IMPULSIVE,           // 뇌동매매(감으로)
	PLANNED_TAKE_PROFIT, // 계획된 익절
	OTHER,
}

// 매매 시점의 그날 시가/고가/저가를 같이 저장 — 외부 KRX 데이터를 다시 조인하지
// 않고도 이 행 하나만으로 "추격매수였는지" 같은 습관 판정이 가능하게 하려는 목적.
@Entity
@Table(name = "trades")
class Trade(
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "session_id", nullable = false)
	var session: SimulationSession,

	@Column(name = "stock_code", nullable = false)
	var stockCode: String,

	@Column(name = "stock_name", nullable = false)
	var stockName: String,

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	var side: TradeSide,

	@Enumerated(EnumType.STRING)
	@Column(name = "trade_type", nullable = false)
	var tradeType: TradeType = TradeType.NORMAL,

	@Enumerated(EnumType.STRING)
	@Column(name = "order_type", nullable = false)
	var orderType: TradeOrderType,

	@Column(name = "limit_price")
	var limitPrice: BigDecimal? = null, // orderType = LIMIT일 때만 사용 — 그날 범위 모르는 채로 미리 정한 가격

	@Column(nullable = false)
	var filled: Boolean = true, // LIMIT인데 그날 저가~고가 범위를 벗어나면 false(미체결)

	@Column(name = "is_credit", nullable = false)
	var isCredit: Boolean = false,

	@Column(name = "leverage_ratio")
	var leverageRatio: BigDecimal? = null, // isCredit = true일 때만 사용

	@Column(nullable = false)
	var quantity: Int,

	@Column
	var price: BigDecimal? = null, // 체결가 — filled = true일 때만 값 있음

	@Column(name = "day_open_price", nullable = false)
	var dayOpenPrice: BigDecimal,

	@Column(name = "day_high_price", nullable = false)
	var dayHighPrice: BigDecimal,

	@Column(name = "day_low_price", nullable = false)
	var dayLowPrice: BigDecimal,

	@Column(name = "viewed_disclosure", nullable = false)
	var viewedDisclosure: Boolean = false, // 매매 전 공시/재무정보 확인 여부

	@Enumerated(EnumType.STRING)
	@Column(name = "reason_tag")
	var reasonTag: TradeReason? = null,

	@Column(name = "reason_text", columnDefinition = "text")
	var reasonText: String? = null,

	@Column(name = "simulated_trade_date", nullable = false)
	var simulatedTradeDate: LocalDate,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	@Column(name = "created_at", nullable = false, updatable = false)
	var createdAt: Instant = Instant.now()
}
