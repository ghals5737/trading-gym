package com.tradinggym.backend.service

import com.tradinggym.backend.dto.CreateSessionRequest
import com.tradinggym.backend.dto.CreateTradeRequest
import com.tradinggym.backend.dto.PricePoint
import com.tradinggym.backend.dto.QuoteResponse
import com.tradinggym.backend.dto.SessionResponse
import com.tradinggym.backend.dto.StockHistoryResponse
import com.tradinggym.backend.dto.TradeResponse
import com.tradinggym.backend.entity.SimulationSession
import com.tradinggym.backend.entity.SimulationSessionStatus
import com.tradinggym.backend.entity.StockDailyPrice
import com.tradinggym.backend.entity.Trade
import com.tradinggym.backend.entity.TradeOrderType
import com.tradinggym.backend.entity.TradeSide
import com.tradinggym.backend.entity.TradeType
import com.tradinggym.backend.repository.SimulationSessionRepository
import com.tradinggym.backend.repository.StockDailyPriceRepository
import com.tradinggym.backend.repository.TradeRepository
import com.tradinggym.backend.user.UserJpaRepository
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

@Service
class SimulationService(
	private val userJpaRepository: UserJpaRepository,
	private val sessionRepository: SimulationSessionRepository,
	private val tradeRepository: TradeRepository,
	private val stockDailyPriceRepository: StockDailyPriceRepository,
) {

	@Transactional
	fun createSession(username: String, request: CreateSessionRequest): SessionResponse {
		val user = requireUser(username)
		if (!stockDailyPriceRepository.existsByTradeDate(request.currentTurnDate)) {
			throw ResponseStatusException(HttpStatus.BAD_REQUEST, "${request.currentTurnDate}는 시세 데이터가 있는 거래일이 아니에요")
		}
		val session = sessionRepository.save(
			SimulationSession(
				user = user,
				startingCash = request.startingCash,
				currentCash = request.startingCash,
				currentTurnDate = request.currentTurnDate,
			),
		)
		return session.toResponse()
	}

	fun getActiveSession(username: String): SessionResponse? {
		val user = requireUser(username)
		return sessionRepository
			.findFirstByUserIdAndStatusOrderByStartedAtDesc(requireNotNull(user.id), SimulationSessionStatus.ACTIVE)
			?.toResponse()
	}

	// "나의 리포트"에서 최근 세션(진행 중이든 종료됐든)을 찾을 때 씀 — 최신순.
	fun listSessions(username: String): List<SessionResponse> {
		val user = requireUser(username)
		return sessionRepository.findByUserIdOrderByStartedAtDesc(requireNotNull(user.id)).map { it.toResponse() }
	}

	// 세션 시작 화면에서 날짜를 고를 수 있게 — 실제 시세가 있는 날짜만 후보로 줌.
	fun getAvailableTradingDates(): List<LocalDate> = stockDailyPriceRepository.findDistinctTradeDates()

	// 그날 시가만 공개 — 저가/고가/종가는 매매를 시도해야(TradeResponse로) 드러남.
	// 미리 범위를 보여주면 지정가를 항상 저가/고가에 걸어서 "판단"이 사라지기 때문.
	fun getQuote(username: String, sessionId: UUID, stockCode: String): QuoteResponse {
		val session = requireOwnedSession(username, sessionId)
		val marketPrice = requireMarketPrice(stockCode, session.currentTurnDate)
		return QuoteResponse(
			stockCode = marketPrice.stockCode,
			stockName = marketPrice.stockName,
			tradeDate = marketPrice.tradeDate,
			openPrice = marketPrice.openPrice,
		)
	}

	// 종목 리스트 화면용 — 그날(currentTurnDate) 시가를 종목 전부에 대해 한 번에 반환.
	fun getQuotes(username: String, sessionId: UUID): List<QuoteResponse> {
		val session = requireOwnedSession(username, sessionId)
		return stockDailyPriceRepository.findAllByTradeDate(session.currentTurnDate).map {
			QuoteResponse(stockCode = it.stockCode, stockName = it.stockName, tradeDate = it.tradeDate, openPrice = it.openPrice)
		}
	}

	// 차트용 — "어제까지"만(오늘 미포함, 1일차엔 빈 배열). 오늘 아직 시도 안 했는데
	// 오늘 종가부터 보여주면 지정가 설계(미리보기 방지)와 원칙이 충돌해서 일부러 하루 미룸.
	fun getStockHistory(username: String, sessionId: UUID, stockCode: String): StockHistoryResponse {
		val session = requireOwnedSession(username, sessionId)
		val todayQuote = requireMarketPrice(stockCode, session.currentTurnDate) // 종목 존재 검증 + 이름 조회
		val rows = stockDailyPriceRepository.findByStockCodeAndTradeDateLessThanOrderByTradeDateAsc(
			stockCode,
			session.currentTurnDate,
		)
		return StockHistoryResponse(
			stockCode = stockCode,
			stockName = todayQuote.stockName,
			points = rows.map {
				PricePoint(
					tradeDate = it.tradeDate,
					openPrice = it.openPrice,
					highPrice = it.highPrice,
					lowPrice = it.lowPrice,
					closePrice = it.closePrice,
				)
			},
		)
	}

	@Transactional
	fun recordTrade(username: String, sessionId: UUID, request: CreateTradeRequest): TradeResponse {
		val session = requireOwnedActiveSession(username, sessionId)

		// 하루 한 종목당 주문 한 번만 — 미체결 지정가를 반복 시도해서 그날 범위를
		// 알아내는(이분탐색) 걸 막기 위함.
		if (tradeRepository.existsBySessionIdAndStockCodeAndSimulatedTradeDate(sessionId, request.stockCode, session.currentTurnDate)) {
			throw ResponseStatusException(HttpStatus.CONFLICT, "오늘 ${request.stockCode}은 이미 주문을 시도했어요 — 다음 거래일에 다시 시도해보세요")
		}
		if (request.orderType == TradeOrderType.LIMIT && request.limitPrice == null) {
			throw ResponseStatusException(HttpStatus.BAD_REQUEST, "지정가 주문은 limitPrice가 필요해요")
		}
		if (request.side == TradeSide.SELL) {
			val owned = computeHoldingsQuantities(sessionId)[request.stockCode] ?: 0
			if (owned < request.quantity) {
				throw ResponseStatusException(HttpStatus.BAD_REQUEST, "보유 수량이 부족해요 (보유: ${owned}주)")
			}
		}

		// 체결가는 서버가 세션의 currentTurnDate 기준 실제 KRX 시세로 결정 — 클라이언트가
		// 부른 가격은 절대 신뢰하지 않음(모의투자 API 설계 논의에서 정정된 부분).
		val marketPrice = requireMarketPrice(request.stockCode, session.currentTurnDate)

		val filled: Boolean
		val executionPrice: BigDecimal?
		when (request.orderType) {
			TradeOrderType.MARKET -> {
				filled = true
				executionPrice = marketPrice.openPrice
			}
			TradeOrderType.LIMIT -> {
				val limitPrice = requireNotNull(request.limitPrice)
				filled = limitPrice in marketPrice.lowPrice..marketPrice.highPrice
				executionPrice = if (filled) limitPrice else null
			}
		}

		// 신용매수 증거금 계산 — leverageRatio=1.5면 포지션 금액의 1/1.5(≈67%)만 현금에서 빠지고
		// 나머지가 대출로 잡힘. 현금이 증거금보다 부족하면 아예 거부(그동안은 검증이 없었음).
		var marginRequired: BigDecimal? = null
		var borrowedPortion: BigDecimal? = null
		if (filled && request.side == TradeSide.BUY) {
			val positionValue = requireNotNull(executionPrice).multiply(BigDecimal(request.quantity))
			if (request.isCredit) {
				val leverageRatio = request.leverageRatio?.takeIf { it > BigDecimal.ONE } ?: BigDecimal.ONE
				marginRequired = positionValue.divide(leverageRatio, 4, RoundingMode.HALF_UP)
				borrowedPortion = positionValue.subtract(marginRequired)
			} else {
				marginRequired = positionValue
				borrowedPortion = BigDecimal.ZERO
			}
			if (marginRequired > session.currentCash) {
				throw ResponseStatusException(
					HttpStatus.BAD_REQUEST,
					"현금이 부족해요 (필요 증거금 ${marginRequired.toPlainString()}원, 보유 현금 ${session.currentCash.toPlainString()}원)",
				)
			}
		}

		val trade = tradeRepository.save(
			Trade(
				session = session,
				stockCode = marketPrice.stockCode,
				stockName = marketPrice.stockName,
				side = request.side,
				orderType = request.orderType,
				limitPrice = request.limitPrice,
				filled = filled,
				isCredit = request.isCredit,
				leverageRatio = request.leverageRatio,
				quantity = request.quantity,
				price = executionPrice,
				dayOpenPrice = marketPrice.openPrice,
				dayHighPrice = marketPrice.highPrice,
				dayLowPrice = marketPrice.lowPrice,
				viewedDisclosure = request.viewedDisclosure,
				reasonTag = request.reasonTag,
				reasonText = request.reasonText,
				simulatedTradeDate = session.currentTurnDate,
			),
		)

		if (filled) {
			when (request.side) {
				TradeSide.BUY -> {
					session.currentCash = session.currentCash.subtract(requireNotNull(marginRequired))
					session.borrowedAmount = session.borrowedAmount.add(requireNotNull(borrowedPortion))
				}
				TradeSide.SELL -> {
					val amount = requireNotNull(executionPrice).multiply(BigDecimal(request.quantity))
					session.currentCash = session.currentCash.add(amount)
				}
			}
			sessionRepository.save(session)
			checkMarginCall(session) // 신용 포지션이 있으면 담보비율 체크 → 미달 시 반대매매
		}

		return trade.toResponse()
	}

	fun listTrades(username: String, sessionId: UUID): List<TradeResponse> {
		val session = requireOwnedSession(username, sessionId)
		return tradeRepository.findBySessionIdOrderBySimulatedTradeDateAsc(requireNotNull(session.id)).map { it.toResponse() }
	}

	// 다음 실제 거래일로 currentTurnDate를 이동. "거래일 캘린더"는 stock_daily_prices에
	// 실제로 데이터가 있는 날짜들 그 자체 — 주말/공휴일은 자연히 빠짐.
	@Transactional
	fun advanceTurn(username: String, sessionId: UUID): SessionResponse {
		val session = requireOwnedActiveSession(username, sessionId)
		val nextDay = stockDailyPriceRepository.findTop1ByTradeDateGreaterThanOrderByTradeDateAsc(session.currentTurnDate)
			?: throw ResponseStatusException(HttpStatus.CONFLICT, "더 이상 진행할 거래일이 없어요")
		session.currentTurnDate = nextDay.tradeDate
		sessionRepository.save(session)
		// 밤새 가격이 움직여서(다음날 시가) 담보비율이 무너질 수 있음 — 턴 넘길 때도 체크.
		checkMarginCall(session)
		return session.toResponse()
	}

	// 세션을 끝냄 — "재도전 루프"의 시작점. 끝난 세션은 더 이상 매매/턴진행 안 되고,
	// getActiveSession이 null을 반환하니 프론트가 자연스럽게 새 세션 시작 화면으로 감.
	@Transactional
	fun completeSession(username: String, sessionId: UUID): SessionResponse {
		val session = requireOwnedActiveSession(username, sessionId)
		session.status = SimulationSessionStatus.COMPLETED
		session.endedAt = Instant.now()
		return sessionRepository.save(session).toResponse()
	}

	// 필터된(수량>0) 종목별 보유 수량 — filled 매매만 집계.
	private fun computeHoldingsQuantities(sessionId: UUID): Map<String, Int> {
		val holdings = mutableMapOf<String, Int>()
		for (t in tradeRepository.findBySessionIdOrderBySimulatedTradeDateAsc(sessionId)) {
			if (!t.filled) continue
			val delta = if (t.side == TradeSide.BUY) t.quantity else -t.quantity
			holdings[t.stockCode] = (holdings[t.stockCode] ?: 0) + delta
		}
		return holdings.filterValues { it > 0 }
	}

	// 담보비율(현금+보유종목 평가액 / 대출원금)이 140% 밑으로 떨어지면 보유 종목을 전부
	// 그날 시가로 강제 매도해서 대출을 정리함 — 이 서비스의 핵심 교육 시나리오.
	// 평가/체결 가격 둘 다 시가를 씀(이 앱 전체에서 "현재 아는 가격"의 기준이 시가라서).
	private fun checkMarginCall(session: SimulationSession) {
		if (session.borrowedAmount <= BigDecimal.ZERO) return
		val sessionId = requireNotNull(session.id)
		val holdings = computeHoldingsQuantities(sessionId)

		var equity = session.currentCash
		val holdingPrices = mutableMapOf<String, StockDailyPrice>()
		for ((stockCode, quantity) in holdings) {
			val price = stockDailyPriceRepository.findByStockCodeAndTradeDate(stockCode, session.currentTurnDate) ?: continue
			holdingPrices[stockCode] = price
			equity = equity.add(price.openPrice.multiply(BigDecimal(quantity)))
		}

		val ratio = equity.divide(session.borrowedAmount, 4, RoundingMode.HALF_UP)
		if (ratio >= MAINTENANCE_RATIO) return

		for ((stockCode, quantity) in holdings) {
			val price = holdingPrices[stockCode] ?: continue
			tradeRepository.save(
				Trade(
					session = session,
					stockCode = price.stockCode,
					stockName = price.stockName,
					side = TradeSide.SELL,
					orderType = TradeOrderType.MARKET,
					tradeType = TradeType.FORCED_LIQUIDATION,
					filled = true,
					quantity = quantity,
					price = price.openPrice,
					dayOpenPrice = price.openPrice,
					dayHighPrice = price.highPrice,
					dayLowPrice = price.lowPrice,
					reasonText = "담보비율 미달로 반대매매 처리됨",
					simulatedTradeDate = session.currentTurnDate,
				),
			)
			session.currentCash = session.currentCash.add(price.openPrice.multiply(BigDecimal(quantity)))
		}
		session.borrowedAmount = BigDecimal.ZERO
		sessionRepository.save(session)
	}

	private fun requireUser(username: String) =
		userJpaRepository.findByUsername(username)
			?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "사용자를 찾을 수 없습니다")

	private fun requireOwnedSession(username: String, sessionId: UUID): SimulationSession {
		val session = sessionRepository.findById(sessionId)
			.orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND, "세션을 찾을 수 없습니다") }
		if (session.user.username != username) {
			throw ResponseStatusException(HttpStatus.FORBIDDEN, "본인 세션이 아닙니다")
		}
		return session
	}

	private fun requireOwnedActiveSession(username: String, sessionId: UUID): SimulationSession {
		val session = requireOwnedSession(username, sessionId)
		if (session.status != SimulationSessionStatus.ACTIVE) {
			throw ResponseStatusException(HttpStatus.CONFLICT, "이미 종료된 세션이에요")
		}
		return session
	}

	private fun requireMarketPrice(stockCode: String, tradeDate: LocalDate): StockDailyPrice =
		stockDailyPriceRepository.findByStockCodeAndTradeDate(stockCode, tradeDate)
			?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "${tradeDate}에 ${stockCode} 시세 데이터가 없어요")

	companion object {
		private val MAINTENANCE_RATIO = BigDecimal("1.4") // 담보 유지비율 140% (RiskInterventionModal mock 수치와 동일)
	}
}

private fun SimulationSession.toResponse() = SessionResponse(
	id = requireNotNull(id),
	status = status,
	startingCash = startingCash,
	currentCash = currentCash,
	borrowedAmount = borrowedAmount,
	currentTurnDate = currentTurnDate,
	startedAt = startedAt,
	endedAt = endedAt,
)

private fun Trade.toResponse() = TradeResponse(
	id = requireNotNull(id),
	stockCode = stockCode,
	stockName = stockName,
	side = side,
	tradeType = tradeType,
	orderType = orderType,
	limitPrice = limitPrice,
	filled = filled,
	isCredit = isCredit,
	leverageRatio = leverageRatio,
	quantity = quantity,
	price = price,
	dayOpenPrice = dayOpenPrice,
	dayHighPrice = dayHighPrice,
	dayLowPrice = dayLowPrice,
	viewedDisclosure = viewedDisclosure,
	reasonTag = reasonTag,
	reasonText = reasonText,
	simulatedTradeDate = simulatedTradeDate,
	createdAt = createdAt,
)
