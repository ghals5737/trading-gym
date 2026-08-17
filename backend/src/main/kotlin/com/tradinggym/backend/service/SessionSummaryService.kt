package com.tradinggym.backend.service

import com.tradinggym.backend.dto.SessionStatScoreResponse
import com.tradinggym.backend.dto.SessionSummaryResponse
import com.tradinggym.backend.dto.TradeSummaryResponse
import com.tradinggym.backend.dto.TurnSummaryResponse
import com.tradinggym.backend.entity.SessionStat
import com.tradinggym.backend.entity.SimulationSession
import com.tradinggym.backend.entity.Trade
import com.tradinggym.backend.entity.TradeSide
import com.tradinggym.backend.entity.TradeType
import com.tradinggym.backend.entity.TurnAction
import com.tradinggym.backend.repository.SessionStatRepository
import com.tradinggym.backend.repository.SimulationSessionRepository
import com.tradinggym.backend.repository.TradeRepository
import com.tradinggym.backend.repository.TurnLogRepository
import com.tradinggym.backend.service.ai.SessionStatAnalyzer
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.math.RoundingMode
import java.util.UUID

// 세션 하나의 turn_logs + trades를 턴 단위로 통째로 묶어주는 서비스 — getSessionSummary가
// 만든 원본 그대로의 턴별 기록(reasonText 포함, 판정 없음)을 SessionStatAnalyzer(AI)에
// 넘겨서 8개 지표 채점을 받아옴. 세션이 끝날 때(finalizeAndPersistStats, SimulationService.
// completeSession에서 호출) 한 번 계산해서 session_stats에 영구 저장 — 온보딩 사전조사
// 진단(investor_profiles)과는 별도로, 세션을 거듭할수록 이 지표들이 어떻게 바뀌는지
// 성장 추이를 볼 수 있게 하려는 목적.
@Service
class SessionSummaryService(
	private val sessionRepository: SimulationSessionRepository,
	private val turnLogRepository: TurnLogRepository,
	private val tradeRepository: TradeRepository,
	private val sessionStatRepository: SessionStatRepository,
	private val sessionStatAnalyzer: SessionStatAnalyzer,
) {

	fun getSessionSummary(username: String, sessionId: UUID): SessionSummaryResponse {
		val session = requireOwnedSession(username, sessionId)
		val turnLogs = turnLogRepository.findBySessionIdOrderByTurnNumberAsc(sessionId)
		val trades = tradeRepository.findBySessionIdOrderBySimulatedTradeDateAsc(sessionId)
		val tradesByTurnLogId = trades.groupBy { requireNotNull(it.turnLog.id) }

		val turns = turnLogs.map { turnLog ->
			TurnSummaryResponse(
				turnNumber = turnLog.turnNumber,
				turnDate = turnLog.turnDate,
				turnUnit = turnLog.turnUnit,
				action = turnLog.action,
				portfolioValue = turnLog.portfolioValue,
				borrowedAmount = turnLog.borrowedAmount,
				trades = tradesByTurnLogId[turnLog.id].orEmpty().map { it.toSummary() },
			)
		}

		val realTrades = trades.filter { it.side != TradeSide.HOLD }
		val finalPortfolioValue = turnLogs.lastOrNull()?.portfolioValue ?: session.startingCash
		val returnPct = finalPortfolioValue
			.subtract(session.startingCash)
			.divide(session.startingCash, 4, RoundingMode.HALF_UP)
			.multiply(BigDecimal(100))

		return SessionSummaryResponse(
			sessionId = sessionId,
			startingCash = session.startingCash,
			finalPortfolioValue = finalPortfolioValue,
			returnPct = returnPct,
			turnCount = session.turnCount,
			maxTurns = SimulationService.MAX_TURNS,
			totalTradeCount = realTrades.size,
			buyCount = realTrades.count { it.side == TradeSide.BUY },
			sellCount = realTrades.count { it.side == TradeSide.SELL },
			holdTurnCount = turnLogs.count { it.action == TurnAction.HELD },
			forcedLiquidationCount = realTrades.count { it.tradeType == TradeType.FORCED_LIQUIDATION },
			creditTradeCount = realTrades.count { it.isCredit },
			uniqueStockCount = realTrades.mapNotNull { it.stockCode }.toSet().size,
			disclosureCheckedBuyCount = realTrades.count { it.side == TradeSide.BUY && it.viewedDisclosure },
			turns = turns,
		)
	}

	// 세션이 이미 끝나서 session_stats에 저장돼있으면 그걸 그대로 돌려줌(AI 재호출 없이
	// 빠름) — 아직 없으면(진행 중인 세션 등) 그 자리에서 즉석 계산만 하고 저장은 안 함
	// (영구 기록은 finalizeAndPersistStats, 즉 세션 종료 시점에만 함).
	fun getSessionStats(username: String, sessionId: UUID): List<SessionStatScoreResponse> {
		requireOwnedSession(username, sessionId)
		val saved = sessionStatRepository.findBySessionIdOrderByStatKeyAsc(sessionId)
		if (saved.isNotEmpty()) return saved.map { it.toResponse() }
		val summary = getSessionSummary(username, sessionId)
		return sessionStatAnalyzer.analyze(summary)
	}

	// 세션 종료(completeSession) 시점에 한 번만 호출됨 — AI 채점을 그 자리에서 계산해서
	// session_stats에 영구 저장함. 세션이 끝난 뒤엔 값이 안 바뀌니 한 번 저장해두면 충분.
	@Transactional
	fun finalizeAndPersistStats(username: String, sessionId: UUID): List<SessionStatScoreResponse> {
		val session = requireOwnedSession(username, sessionId)
		val summary = getSessionSummary(username, sessionId)
		val scores = sessionStatAnalyzer.analyze(summary)
		sessionStatRepository.saveAll(
			scores.map { SessionStat(session = session, statKey = it.statKey, scorePct = it.scorePct, note = it.note) },
		)
		return scores
	}

	private fun requireOwnedSession(username: String, sessionId: UUID): SimulationSession {
		val session = sessionRepository.findById(sessionId)
			.orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND, "세션을 찾을 수 없습니다") }
		if (session.user.username != username) {
			throw ResponseStatusException(HttpStatus.FORBIDDEN, "본인 세션이 아닙니다")
		}
		return session
	}
}

private fun SessionStat.toResponse() = SessionStatScoreResponse(statKey = statKey, scorePct = scorePct, note = note)

private fun Trade.toSummary() = TradeSummaryResponse(
	side = side,
	stockName = stockName,
	quantity = quantity,
	price = price,
	isCredit = isCredit,
	leverageRatio = leverageRatio,
	tradeType = tradeType,
	viewedDisclosure = viewedDisclosure,
	reasonText = reasonText,
)
