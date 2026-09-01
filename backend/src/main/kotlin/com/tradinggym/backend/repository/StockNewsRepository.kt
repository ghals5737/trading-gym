package com.tradinggym.backend.repository

import com.tradinggym.backend.entity.StockNews
import org.springframework.data.jpa.repository.JpaRepository
import java.time.LocalDate
import java.util.UUID

interface StockNewsRepository : JpaRepository<StockNews, UUID> {
	// 그 종목의 뉴스 중 세션 현재 거래일까지 나온 것 최신 3건 — 공시 패널(StockDisclosureRepository)과
	// 같은 방식.
	//
	// 예전엔 최신 1건만 뽑고 SimulationService가 14일 넘은 건 잘라서 null로 만들었는데,
	// 시드 뉴스가 5종목 12건뿐(가격이 크게 움직인 날 위주)이라 그 조건을 통과하는 턴이 거의
	// 없었음 — DB에는 뉴스가 있는데 화면에서는 뉴스 섹터가 통째로 사라져 보였다.
	// 이제는 오래된 뉴스도 내려보내고, 며칠 전 뉴스인지는 daysAgo로 화면에 같이 표시한다.
	fun findTop3ByStockCodeAndTradeDateLessThanEqualOrderByTradeDateDesc(stockCode: String, tradeDate: LocalDate): List<StockNews>

	// 턴 하나가 걸쳐 있는 기간(예: 일주일/한달 단위로 건너뛴 구간) 안에 있었던 뉴스 전부 —
	// 종목 상관없이 그 기간에 실제로 있었던 뉴스를 턴 로그에 같이 보여주려는 용도.
	fun findByTradeDateBetweenOrderByTradeDateAsc(start: LocalDate, end: LocalDate): List<StockNews>
}
