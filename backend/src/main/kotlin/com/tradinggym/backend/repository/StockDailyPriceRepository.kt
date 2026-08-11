package com.tradinggym.backend.repository

import com.tradinggym.backend.entity.StockDailyPrice
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import java.time.LocalDate
import java.util.UUID

interface StockDailyPriceRepository : JpaRepository<StockDailyPrice, UUID> {
	fun findByStockCodeAndTradeDate(stockCode: String, tradeDate: LocalDate): StockDailyPrice?

	// 세션 시작 날짜 선택 화면용 — 실제로 시세 데이터가 있는 거래일만 고를 수 있게.
	@Query("select distinct p.tradeDate from StockDailyPrice p order by p.tradeDate asc")
	fun findDistinctTradeDates(): List<LocalDate>

	// 턴 진행(다음 거래일로 이동)에 씀 — 실제 거래일 캘린더가 이 테이블의 날짜 자체임.
	fun findTop1ByTradeDateGreaterThanOrderByTradeDateAsc(tradeDate: LocalDate): StockDailyPrice?

	fun existsByTradeDate(tradeDate: LocalDate): Boolean

	// 종목 리스트(오늘 시가 일람)용 — 하루치, 종목 5개 전부.
	fun findAllByTradeDate(tradeDate: LocalDate): List<StockDailyPrice>

	// 차트용 — 반드시 "어제까지"만(LessThan, 오늘 미포함). 오늘 종가까지 포함시키면
	// 거래 시도도 하기 전에 오늘 시세를 미리 보여주는 꼴이라 지정가 설계와 원칙이 충돌함.
	fun findByStockCodeAndTradeDateLessThanOrderByTradeDateAsc(
		stockCode: String,
		tradeDate: LocalDate,
	): List<StockDailyPrice>
}
