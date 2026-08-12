package com.tradinggym.backend.dto

import com.tradinggym.backend.entity.TradeOrderType
import com.tradinggym.backend.entity.TradeSide
import com.tradinggym.backend.entity.TradeType
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

// 가격/날짜는 요청에 없음(시장가는 서버가 시가로 체결, 지정가는 limitPrice만 받고
// 실제 체결 여부는 서버가 그날 저가~고가 범위로 판단). 클라이언트가 가격을 부를 수 없음.
// reasonText는 필수 — KnowerBot이 채팅으로 물어서 받은 자유 텍스트. 분류 태그는 없음(자기신고라
// 신뢰도가 낮았고, 나중에 리포트에서 이 텍스트를 AI에 통째로 넘겨 분석하는 방식으로 대체할 예정).
data class CreateTradeRequest(
	val stockCode: String,
	val side: TradeSide,
	val orderType: TradeOrderType,
	val limitPrice: BigDecimal? = null, // orderType = LIMIT일 때 필수
	val isCredit: Boolean = false,
	val leverageRatio: BigDecimal? = null,
	val quantity: Int,
	val viewedDisclosure: Boolean = false,
	val reasonText: String,
)

// stockCode/stockName/orderType/quantity/day*Price는 side=HOLD(관망)면 전부 null.
data class TradeResponse(
	val id: UUID,
	val stockCode: String?,
	val stockName: String?,
	val side: TradeSide,
	val tradeType: TradeType,
	val orderType: TradeOrderType?,
	val limitPrice: BigDecimal?,
	val filled: Boolean,
	val isCredit: Boolean,
	val leverageRatio: BigDecimal?,
	val quantity: Int?,
	val price: BigDecimal?, // filled = false면 null(미체결)
	val dayOpenPrice: BigDecimal?,
	val dayHighPrice: BigDecimal?,
	val dayLowPrice: BigDecimal?,
	val viewedDisclosure: Boolean,
	val reasonText: String,
	val turnNumber: Int,
	val simulatedTradeDate: LocalDate,
	val createdAt: Instant,
)
