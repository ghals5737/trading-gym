package com.tradinggym.backend.dto

import com.tradinggym.backend.entity.TradeSide
import com.tradinggym.backend.entity.TradeType
import com.tradinggym.backend.entity.TurnAction
import com.tradinggym.backend.entity.TurnUnit
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

// 세션 하나를 턴 단위로 통째로 훑을 수 있게 묶은 응답 — 나중에 "이 세션을 보고 추천
// 교육자료/PT를 골라달라"고 LLM에 넘길 프롬프트 재료로 쓸 걸 염두에 두고 설계함. 그래서
// 판정(몰빵매수였는지 등)은 여기서 미리 안 내리고, trades.reasonText를 포함한 원본
// 그대로 다 넘김 — 판단은 그 LLM 몫으로 남겨둠.
data class SessionSummaryResponse(
	val sessionId: UUID,
	val startingCash: BigDecimal,
	val finalPortfolioValue: BigDecimal,
	val returnPct: BigDecimal,
	val turnCount: Int,
	val maxTurns: Int,
	val totalTradeCount: Int, // HOLD 제외, 실제 매매만
	val buyCount: Int,
	val sellCount: Int,
	val holdTurnCount: Int, // 관망으로 끝난 턴 수
	val forcedLiquidationCount: Int,
	val creditTradeCount: Int,
	val uniqueStockCount: Int,
	val disclosureCheckedBuyCount: Int,
	// 미수금(신용매수 대출) 상환 규칙 관련 — 채점 프롬프트에 그대로 들어감.
	val debtOverdue: Boolean, // 상환 기한(발생 턴+10턴)을 넘긴 적이 있는 세션
	val unpaidDebtAtEnd: BigDecimal, // 세션이 끝난 시점에 안 갚고 남은 미수금(0이면 완납)
	val turns: List<TurnSummaryResponse>,
)

data class TurnSummaryResponse(
	val turnNumber: Int,
	val turnDate: LocalDate,
	val turnUnit: TurnUnit?,
	val action: TurnAction,
	val portfolioValue: BigDecimal,
	val borrowedAmount: BigDecimal,
	val trades: List<TradeSummaryResponse>,
	val news: List<TurnNewsResponse>, // 이 턴이 걸쳐 있던 기간에 실제로 있었던 뉴스(TurnLogDtos 참고)
)

data class TradeSummaryResponse(
	val side: TradeSide,
	val stockName: String?,
	val quantity: Int?,
	val price: BigDecimal?,
	val isCredit: Boolean,
	val leverageRatio: BigDecimal?,
	val tradeType: TradeType,
	val viewedDisclosure: Boolean,
	val reasonText: String,
)

// 마이페이지 "모의고사 기록" — 완료된 세션 하나당 결과 요약 + AI 채점 8개 지표.
// 최신 세션이 먼저 오게 정렬해서 내려줌.
data class SessionHistoryItemResponse(
	val sessionId: UUID,
	val startTurnDate: LocalDate,
	val lastTurnDate: LocalDate,
	val turnCount: Int,
	val startingCash: BigDecimal,
	val finalPortfolioValue: BigDecimal,
	val returnPct: BigDecimal,
	val endedAt: Instant?,
	val stats: List<SessionStatScoreResponse>,
)
