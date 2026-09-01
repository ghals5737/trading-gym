package com.tradinggym.backend.dto

import java.math.BigDecimal
import java.time.LocalDate

// 그날 시가만 보여줌 — 저가/고가/종가는 매매를 시도한 뒤에야(TradeResponse로) 공개됨.
data class QuoteResponse(
	val stockCode: String,
	val stockName: String,
	val tradeDate: LocalDate,
	val openPrice: BigDecimal,
)

// 캔들차트용 — "어제까지"의 데이터만 나가므로(StockHistoryResponse 참고) OHLC를 전부 공개해도
// 당일 지정가 설계(이분탐색 방지) 원칙과 충돌하지 않음.
data class PricePoint(
	val tradeDate: LocalDate,
	val openPrice: BigDecimal,
	val highPrice: BigDecimal,
	val lowPrice: BigDecimal,
	val closePrice: BigDecimal,
)

// currentTurnDate까지의 종가만 포함 — 이후(미래) 데이터는 절대 안 보여줌(지정가 설계와 같은 원칙).
data class StockHistoryResponse(
	val stockCode: String,
	val stockName: String,
	val points: List<PricePoint>,
)

// 실제 있었던 뉴스를 손으로 골라 채운 고정 데이터(StockNews) 기반 — 뉴스가 있는 날짜는
// 드물어서, "오늘" 것만이 아니라 최근 며칠 이내 가장 최근 것을 보여줌(SimulationService 참고).
// stockCode/stockName은 getSessionNews(여러 종목을 한 번에 묶은 뉴스 섹터)에서만 채워짐 —
// 종목 하나만 보는 getStockNews는 이미 어떤 종목인지 호출부가 알아서 null로 옴.
data class StockNewsResponse(
	val stockCode: String? = null,
	val stockName: String? = null,
	val headline: String,
	val summary: String,
	val source: String,
	val tradeDate: LocalDate,
)

// DART 공시 요약(고정 데이터, StockDisclosure) — 세션 현재 거래일까지 나온 공시 중 최신
// 몇 건. 뉴스와 달리 공시는 오래돼도 유효한 정보라 lookback 제한 없음.
data class StockDisclosureItemResponse(
	val title: String,
	val summary: String,
	val disclosedDate: LocalDate,
)

data class StockDisclosureResponse(
	val stockCode: String,
	val items: List<StockDisclosureItemResponse>,
)
