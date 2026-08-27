package com.tradinggym.backend.dto

import com.tradinggym.backend.entity.TurnAction
import com.tradinggym.backend.entity.TurnUnit
import java.math.BigDecimal
import java.time.LocalDate
import java.util.UUID

// 이 턴이 걸쳐 있던 기간(직전 턴 날짜 다음날 ~ 이 턴 날짜, 1턴째는 그날 하루) 안에 실제로
// 있었던 뉴스 — 종목 무관하게 그 기간 전부. StockNews 고정 데이터(seed-data/stock_news.csv)
// 기반이라 매 기간마다 있는 건 아님.
data class TurnNewsResponse(
	val stockCode: String,
	val headline: String,
	val summary: String,
	val source: String,
	val tradeDate: LocalDate,
)

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
	val news: List<TurnNewsResponse>,
)
