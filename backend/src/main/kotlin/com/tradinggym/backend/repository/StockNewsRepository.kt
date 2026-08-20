package com.tradinggym.backend.repository

import com.tradinggym.backend.entity.StockNews
import org.springframework.data.jpa.repository.JpaRepository
import java.time.LocalDate
import java.util.UUID

interface StockNewsRepository : JpaRepository<StockNews, UUID> {
	// 그 종목의 뉴스 중, 세션의 현재 거래일 이전이거나 같은 날짜의 가장 최근 것 하나 —
	// 뉴스가 있는 날짜는 드물어서(가격이 크게 움직인 날 위주) "오늘"만 정확히 맞추면
	// 거의 항상 없음. SimulationService에서 너무 오래된 건 다시 걸러냄.
	fun findTop1ByStockCodeAndTradeDateLessThanEqualOrderByTradeDateDesc(stockCode: String, tradeDate: LocalDate): StockNews?

	// 턴 하나가 걸쳐 있는 기간(예: 일주일/한달 단위로 건너뛴 구간) 안에 있었던 뉴스 전부 —
	// 종목 상관없이 그 기간에 실제로 있었던 뉴스를 턴 로그에 같이 보여주려는 용도.
	fun findByTradeDateBetweenOrderByTradeDateAsc(start: LocalDate, end: LocalDate): List<StockNews>
}
