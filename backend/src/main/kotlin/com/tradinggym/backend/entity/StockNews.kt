package com.tradinggym.backend.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.LocalDate
import java.util.UUID

// 실제 있었던 그 종목의 그 날짜 뉴스를 손으로 골라 채워둔 고정 데이터
// (seed-data/stock_news.csv) — 실시간 뉴스 API 대신 이 방식을 택한 이유는
// StockPriceSeeder와 동일: 과거 날짜의 종목별 뉴스를 정확히 찾아주는 무료 API가
// 마땅치 않고, 데모 당일 API 장애 위험도 피하려는 목적. 날짜마다 있는 건 아니고
// 가격이 크게 움직인 날 위주로만 채워짐(SimulationService가 최근 며칠 이내 것만 보여줌).
@Entity
@Table(name = "stock_news")
class StockNews(
	@Column(name = "stock_code", nullable = false)
	var stockCode: String,

	@Column(name = "trade_date", nullable = false)
	var tradeDate: LocalDate,

	@Column(nullable = false)
	var headline: String,

	@Column(columnDefinition = "text", nullable = false)
	var summary: String,

	@Column(nullable = false)
	var source: String,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null
}
