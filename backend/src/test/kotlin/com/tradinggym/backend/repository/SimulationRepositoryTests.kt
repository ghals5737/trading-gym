package com.tradinggym.backend.repository

import com.tradinggym.backend.entity.RiskIntervention
import com.tradinggym.backend.entity.RiskInterventionResponse
import com.tradinggym.backend.entity.RiskInterventionType
import com.tradinggym.backend.entity.SessionStat
import com.tradinggym.backend.entity.SessionStatKey
import com.tradinggym.backend.entity.SimulationSession
import com.tradinggym.backend.entity.StatTone
import com.tradinggym.backend.entity.Trade
import com.tradinggym.backend.entity.TradeOrderType
import com.tradinggym.backend.entity.TradeReason
import com.tradinggym.backend.entity.TradeSide
import com.tradinggym.backend.entity.TradeType
import com.tradinggym.backend.user.UserEntity
import com.tradinggym.backend.user.UserJpaRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.time.LocalDate

@SpringBootTest
@Transactional // 테스트 끝나면 자동 롤백 — 로컬 dev DB를 더럽히지 않음
class SimulationRepositoryTests {

	@Autowired lateinit var userRepository: UserJpaRepository
	@Autowired lateinit var sessionRepository: SimulationSessionRepository
	@Autowired lateinit var tradeRepository: TradeRepository
	@Autowired lateinit var statRepository: SessionStatRepository
	@Autowired lateinit var interventionRepository: RiskInterventionRepository

	@Test
	fun `session, trade, stat, intervention round-trip through the full graph`() {
		val user = userRepository.save(UserEntity(username = "sim-test-${System.nanoTime()}", passwordHash = "x"))

		val session = sessionRepository.save(
			SimulationSession(
				user = user,
				startingCash = BigDecimal("10000000"),
				currentCash = BigDecimal("9200000"),
				currentTurnDate = LocalDate.of(2026, 1, 5),
			),
		)

		val trade = tradeRepository.save(
			Trade(
				session = session,
				stockCode = "005930",
				stockName = "대형전자 A",
				side = TradeSide.BUY,
				tradeType = TradeType.NORMAL,
				orderType = TradeOrderType.MARKET,
				filled = true,
				isCredit = true,
				leverageRatio = BigDecimal("2.0"),
				quantity = 40,
				price = BigDecimal("71000"),
				dayOpenPrice = BigDecimal("69000"),
				dayHighPrice = BigDecimal("72000"),
				dayLowPrice = BigDecimal("68500"),
				viewedDisclosure = false,
				reasonTag = TradeReason.CHASE_BUY,
				reasonText = "급등 뉴스 보고 따라 삼",
				simulatedTradeDate = LocalDate.of(2026, 1, 5),
			),
		)

		statRepository.save(
			SessionStat(
				session = session,
				statKey = SessionStatKey.IMPULSIVE_TRADING,
				scorePct = 85,
				tone = StatTone.RED,
			),
		)

		interventionRepository.save(
			RiskIntervention(
				session = session,
				trade = trade,
				riskType = RiskInterventionType.CHASE_BUY,
				message = "이 매매는 추격매수 패턴이에요.",
				userResponse = RiskInterventionResponse.IGNORED,
				simulatedTradeDate = LocalDate.of(2026, 1, 5),
			),
		)

		val sessionId = requireNotNull(session.id)

		assertEquals(1, tradeRepository.findBySessionIdOrderBySimulatedTradeDateAsc(sessionId).size)
		assertEquals(TradeReason.CHASE_BUY, tradeRepository.findBySessionIdOrderBySimulatedTradeDateAsc(sessionId).first().reasonTag)

		val stat = statRepository.findBySessionIdAndStatKey(sessionId, SessionStatKey.IMPULSIVE_TRADING)
		assertEquals(85, stat?.scorePct)
		assertEquals(StatTone.RED, stat?.tone)

		val interventions = interventionRepository.findBySessionId(sessionId)
		assertEquals(1, interventions.size)
		assertEquals(RiskInterventionResponse.IGNORED, interventions.first().userResponse)
		assertEquals(trade.id, interventions.first().trade?.id)

		assertEquals(1, sessionRepository.findByUserIdOrderByStartedAtDesc(requireNotNull(user.id)).size)
	}
}
