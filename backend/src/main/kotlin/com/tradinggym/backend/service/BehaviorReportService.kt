package com.tradinggym.backend.service

import com.tradinggym.backend.dto.SessionReportResponse
import com.tradinggym.backend.dto.SessionStatResponse
import com.tradinggym.backend.entity.InvestorProfile
import com.tradinggym.backend.entity.InvestorProfileType
import com.tradinggym.backend.entity.SessionStat
import com.tradinggym.backend.entity.SessionStatKey
import com.tradinggym.backend.entity.SimulationSession
import com.tradinggym.backend.entity.StatTone
import com.tradinggym.backend.entity.Trade
import com.tradinggym.backend.entity.TradeReason
import com.tradinggym.backend.entity.TradeSide
import com.tradinggym.backend.entity.TradeType
import com.tradinggym.backend.repository.InvestorProfileRepository
import com.tradinggym.backend.repository.SessionStatRepository
import com.tradinggym.backend.repository.SimulationSessionRepository
import com.tradinggym.backend.repository.TradeRepository
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.math.RoundingMode
import java.util.UUID

// 매매 이력(trades)에서 룰 기반으로 8개 행동 지표(session_stats)를 계산 — 온보딩과
// 마찬가지로 "판정은 룰, 문장만 필요하면 나중에 AI"로 시작함. 각 지표는 실제 계좌에서도
// 관찰 가능한 신호(승률·공시확인율·레버리지·손절원칙준수 등)로 잡아서 방어 가능하게 설계.
// 향후과제였던 "AI 코치의 위험 패턴 판별 로직 구체화"의 1차 구현.
@Service
class BehaviorReportService(
	private val simulationSessionRepository: SimulationSessionRepository,
	private val tradeRepository: TradeRepository,
	private val sessionStatRepository: SessionStatRepository,
	private val investorProfileRepository: InvestorProfileRepository,
) {

	@Transactional
	fun generateReport(username: String, sessionId: UUID): SessionReportResponse {
		val session = requireOwnedSession(username, sessionId)
		val trades = tradeRepository.findBySessionIdOrderBySimulatedTradeDateAsc(sessionId)
		val sells = computeSellOutcomes(trades)

		val stats = listOf(
			judgmentAccuracy(session, sells),
			disclosureCheckRate(session, trades),
			riskManagementScore(session, trades),
			impulsiveTrading(session, trades),
			lossAversion(session, sells),
			confirmationBias(session, trades),
			diversification(session, trades),
			gamblingSignal(session, trades),
		).map { upsertStat(it) }

		val profile = investorProfileRepository.findByUserId(requireNotNull(session.user.id))
		val riskManagementPct = stats.first { it.statKey == SessionStatKey.RISK_MANAGEMENT_SCORE }.scorePct
		val diversificationPct = stats.first { it.statKey == SessionStatKey.DIVERSIFICATION }.scorePct
		val forcedCount = trades.count { it.tradeType == TradeType.FORCED_LIQUIDATION }
		val diagnosisComparison = buildDiagnosisComparison(profile, riskManagementPct, diversificationPct, forcedCount)

		return SessionReportResponse(
			sessionId = sessionId,
			stats = stats.map { SessionStatResponse(it.statKey, it.scorePct, it.tone, it.note) },
			diagnosisComparison = diagnosisComparison,
		)
	}

	private fun requireOwnedSession(username: String, sessionId: UUID): SimulationSession {
		val session = simulationSessionRepository.findById(sessionId)
			.orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND, "세션을 찾을 수 없습니다") }
		if (session.user.username != username) {
			throw ResponseStatusException(HttpStatus.FORBIDDEN, "본인 세션이 아닙니다")
		}
		return session
	}

	private fun upsertStat(row: SessionStat): SessionStat {
		val existing = sessionStatRepository.findBySessionIdAndStatKey(requireNotNull(row.session.id), row.statKey)
		if (existing == null) return sessionStatRepository.save(row)
		existing.scorePct = row.scorePct
		existing.tone = row.tone
		existing.note = row.note
		return sessionStatRepository.save(existing)
	}

	// --- 매도 손익 계산: 이동평균법으로 종목별 평단가를 추적하며 매도 시점의 손익 여부를 판정 ---

	private data class SellOutcome(val profit: Boolean, val reasonTag: TradeReason?)

	private fun computeSellOutcomes(trades: List<Trade>): List<SellOutcome> {
		val costBasis = mutableMapOf<String, Pair<Int, BigDecimal>>() // stockCode -> (수량, 평단가)
		val outcomes = mutableListOf<SellOutcome>()
		for (t in trades) {
			if (!t.filled) continue
			val price = requireNotNull(t.price)
			val (qty, avgCost) = costBasis[t.stockCode] ?: (0 to BigDecimal.ZERO)
			when (t.side) {
				TradeSide.BUY -> {
					val newQty = qty + t.quantity
					val newCost = avgCost.multiply(BigDecimal(qty))
						.add(price.multiply(BigDecimal(t.quantity)))
						.divide(BigDecimal(newQty), 4, RoundingMode.HALF_UP)
					costBasis[t.stockCode] = newQty to newCost
				}
				TradeSide.SELL -> {
					outcomes += SellOutcome(profit = price > avgCost, reasonTag = t.reasonTag)
					costBasis[t.stockCode] = (qty - t.quantity).coerceAtLeast(0) to avgCost
				}
			}
		}
		return outcomes
	}

	// --- 지표별 계산 ---

	private fun judgmentAccuracy(session: SimulationSession, sells: List<SellOutcome>): SessionStat {
		if (sells.isEmpty()) return statRow(session, SessionStatKey.JUDGMENT_ACCURACY, 50, StatTone.AMBER, "매도 기록이 없어서 판단하기 어려워요")
		val winRate = sells.count { it.profit } * 100 / sells.size
		return statRow(session, SessionStatKey.JUDGMENT_ACCURACY, winRate, toneForHigherIsBetter(winRate), null)
	}

	private fun disclosureCheckRate(session: SimulationSession, trades: List<Trade>): SessionStat {
		val buys = trades.filter { it.filled && it.side == TradeSide.BUY }
		if (buys.isEmpty()) return statRow(session, SessionStatKey.DISCLOSURE_CHECK_RATE, 50, StatTone.AMBER, "매수 기록이 없어요")
		val pct = buys.count { it.viewedDisclosure } * 100 / buys.size
		return statRow(session, SessionStatKey.DISCLOSURE_CHECK_RATE, pct, toneForHigherIsBetter(pct), null)
	}

	private fun riskManagementScore(session: SimulationSession, trades: List<Trade>): SessionStat {
		val forcedCount = trades.count { it.tradeType == TradeType.FORCED_LIQUIDATION }
		val creditBuys = trades.filter { it.filled && it.side == TradeSide.BUY && it.isCredit }
		val highLeveragePct = if (creditBuys.isEmpty()) 0 else {
			creditBuys.count { (it.leverageRatio ?: BigDecimal.ONE) >= BigDecimal(2) } * 100 / creditBuys.size
		}
		val score = (100 - forcedCount * 40 - highLeveragePct / 5).coerceIn(0, 100)
		val note = if (forcedCount > 0) "반대매매가 ${forcedCount}번 발생했어요" else null
		return statRow(session, SessionStatKey.RISK_MANAGEMENT_SCORE, score, toneForHigherIsBetter(score), note)
	}

	private fun impulsiveTrading(session: SimulationSession, trades: List<Trade>): SessionStat {
		val filled = trades.filter { it.filled }
		if (filled.isEmpty()) return statRow(session, SessionStatKey.IMPULSIVE_TRADING, 50, StatTone.AMBER, "매매 기록이 없어요")
		val impulsivePct = filled.count { it.reasonTag == TradeReason.IMPULSIVE } * 100 / filled.size
		val goodPct = 100 - impulsivePct // 충동매매 비율이 낮을수록 좋은 점수
		return statRow(session, SessionStatKey.IMPULSIVE_TRADING, goodPct, toneForHigherIsBetter(goodPct), null)
	}

	private fun lossAversion(session: SimulationSession, sells: List<SellOutcome>): SessionStat {
		val losses = sells.filter { !it.profit }
		if (losses.isEmpty()) return statRow(session, SessionStatKey.LOSS_AVERSION, 100, StatTone.GREEN, "손실 매도가 없었어요")
		// 손실 매도 중 "손절"로 태깅한 비율 — 낮으면 원칙 없이 어쩔 수 없이 팔았을 가능성(손실회피 편향)
		val principledPct = losses.count { it.reasonTag == TradeReason.STOP_LOSS } * 100 / losses.size
		return statRow(session, SessionStatKey.LOSS_AVERSION, principledPct, toneForHigherIsBetter(principledPct), null)
	}

	private fun confirmationBias(session: SimulationSession, trades: List<Trade>): SessionStat {
		val filled = trades.filter { it.filled }
		if (filled.isEmpty()) return statRow(session, SessionStatKey.CONFIRMATION_BIAS, 50, StatTone.AMBER, "매매 기록이 없어요")
		// 물타기(내 판단이 맞다고 믿고 밀어붙이는 행동)를 확증편향의 프록시로 씀
		val averagingDownPct = filled.count { it.reasonTag == TradeReason.AVERAGING_DOWN } * 100 / filled.size
		val goodPct = 100 - averagingDownPct
		return statRow(session, SessionStatKey.CONFIRMATION_BIAS, goodPct, toneForHigherIsBetter(goodPct), null)
	}

	private fun diversification(session: SimulationSession, trades: List<Trade>): SessionStat {
		val uniqueStocks = trades.filter { it.filled && it.side == TradeSide.BUY }.map { it.stockCode }.toSet().size
		if (uniqueStocks == 0) return statRow(session, SessionStatKey.DIVERSIFICATION, 50, StatTone.AMBER, "매수 기록이 없어요")
		val pct = (uniqueStocks * 25).coerceAtMost(100) // 4종목 이상 분산하면 만점
		return statRow(session, SessionStatKey.DIVERSIFICATION, pct, toneForHigherIsBetter(pct), null)
	}

	private fun gamblingSignal(session: SimulationSession, trades: List<Trade>): SessionStat {
		val filled = trades.filter { it.filled }
		val forcedCount = trades.count { it.tradeType == TradeType.FORCED_LIQUIDATION }
		val creditRatio = if (filled.isEmpty()) 0 else filled.count { it.isCredit } * 100 / filled.size
		val score = (100 - creditRatio / 2 - forcedCount * 30).coerceIn(0, 100)
		val note = listOfNotNull(
			if (forcedCount > 0) "반대매매 ${forcedCount}회" else null,
			if (creditRatio > 50) "신용거래 비중 ${creditRatio}%" else null,
		).takeIf { it.isNotEmpty() }?.joinToString(" · ")
		return statRow(session, SessionStatKey.GAMBLING_SIGNAL, score, toneForHigherIsBetter(score), note)
	}

	private fun statRow(session: SimulationSession, key: SessionStatKey, scorePct: Int, tone: StatTone, note: String?) =
		SessionStat(session = session, statKey = key, scorePct = scorePct, tone = tone, note = note)

	private fun toneForHigherIsBetter(scorePct: Int): StatTone = when {
		scorePct >= 70 -> StatTone.GREEN
		scorePct >= 40 -> StatTone.AMBER
		else -> StatTone.RED
	}

	// 온보딩 진단(자기 신고)과 실제 매매 행동 사이의 괴리를 짚어주는 룰 기반 비교 문장.
	private fun buildDiagnosisComparison(
		profile: InvestorProfile?,
		riskManagementPct: Int,
		diversificationPct: Int,
		forcedCount: Int,
	): String? {
		if (profile == null) return null
		val actedRisky = forcedCount > 0 || diversificationPct < 50 || riskManagementPct < 50
		return when {
			profile.profileType == InvestorProfileType.STABLE && actedRisky ->
				"온보딩에서는 안정형으로 진단됐지만, 실제 매매에서는 ${if (forcedCount > 0) "반대매매를 겪을 만큼 " else ""}리스크가 큰 모습을 보였어요. 스스로 생각하는 성향과 실제 행동 사이에 차이가 있을 수 있어요."
			profile.profileType == InvestorProfileType.AGGRESSIVE && !actedRisky ->
				"공격형으로 진단됐는데 실제로는 리스크 관리를 잘 하고 있어요. 자기 성향을 잘 알고 통제하는 편이에요."
			else -> "온보딩 진단과 실제 매매 패턴이 대체로 일치하는 편이에요."
		}
	}
}
