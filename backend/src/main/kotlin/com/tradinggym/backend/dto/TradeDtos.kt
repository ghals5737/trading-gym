package com.tradinggym.backend.dto

import com.tradinggym.backend.entity.TradeOrderType
import com.tradinggym.backend.entity.TradeSide
import com.tradinggym.backend.entity.TradeType
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

// 가격/날짜는 요청에 없음 — 서버가 세션 날짜의 시가로 체결함. 클라이언트가 가격을 부를 수 없음.
// 지정가 주문은 회의 결정으로 제거됨(시장가만) — orderType/limitPrice 필드도 함께 삭제.
// reasonText는 필수 — KnowerBot이 채팅으로 물어서 받은 자유 텍스트. 분류 태그는 없음(자기신고라
// 신뢰도가 낮았고, 나중에 리포트에서 이 텍스트를 AI에 통째로 넘겨 분석하는 방식으로 대체할 예정).
// 미수(신용)는 기본적으로 현금보다 큰 매수일 때 서버가 부족분을 자동으로 잡지만,
// useCredit=true면 현금이 충분해도 일부러 전액을 미수로 돌려서 현금을 아낄 수 있음
// (선택적 신용거래 — 현금을 다른 종목에 쓰고 싶을 때).
data class CreateTradeRequest(
	val stockCode: String,
	val side: TradeSide,
	val quantity: Int,
	val viewedDisclosure: Boolean = false,
	val useCredit: Boolean = false,
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
