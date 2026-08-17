package com.tradinggym.backend.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import jakarta.persistence.UniqueConstraint
import java.math.BigDecimal
import java.time.LocalDate
import java.util.UUID

// KRX 5종목(삼성전자·SK하이닉스·SKC·삼천당제약·한화오션) 최근 1년 실데이터
// (Yahoo Finance 조회, seed-data/stock_daily_prices.csv).
// 매매 체결가는 여기서 서버가 조회해서 결정함 — 클라이언트가 가격을 보내지 않음.
@Entity
@Table(
	name = "stock_daily_prices",
	uniqueConstraints = [UniqueConstraint(columnNames = ["stock_code", "trade_date"])],
)
class StockDailyPrice(
	@Column(name = "stock_code", nullable = false)
	var stockCode: String,

	@Column(name = "stock_name", nullable = false)
	var stockName: String,

	@Column(name = "trade_date", nullable = false)
	var tradeDate: LocalDate,

	@Column(name = "open_price", nullable = false)
	var openPrice: BigDecimal,

	@Column(name = "high_price", nullable = false)
	var highPrice: BigDecimal,

	@Column(name = "low_price", nullable = false)
	var lowPrice: BigDecimal,

	@Column(name = "close_price", nullable = false)
	var closePrice: BigDecimal,

	@Column(nullable = false)
	var volume: Long = 0,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null
}
