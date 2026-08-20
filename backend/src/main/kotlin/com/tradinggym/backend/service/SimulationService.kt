package com.tradinggym.backend.service

import com.tradinggym.backend.dto.AdvanceTurnRequest
import com.tradinggym.backend.dto.CreateSessionRequest
import com.tradinggym.backend.dto.CreateTradeRequest
import com.tradinggym.backend.dto.PricePoint
import com.tradinggym.backend.dto.QuoteResponse
import com.tradinggym.backend.dto.SessionResponse
import com.tradinggym.backend.dto.StockHistoryResponse
import com.tradinggym.backend.dto.StockNewsResponse
import com.tradinggym.backend.dto.TradeResponse
import com.tradinggym.backend.dto.TurnLogResponse
import com.tradinggym.backend.dto.TurnNewsResponse
import com.tradinggym.backend.entity.SimulationSession
import com.tradinggym.backend.entity.SimulationSessionStatus
import com.tradinggym.backend.entity.StockDailyPrice
import com.tradinggym.backend.entity.StockNews
import com.tradinggym.backend.entity.Trade
import com.tradinggym.backend.entity.TradeOrderType
import com.tradinggym.backend.entity.TradeSide
import com.tradinggym.backend.entity.TradeType
import com.tradinggym.backend.entity.TurnAction
import com.tradinggym.backend.entity.TurnLog
import com.tradinggym.backend.entity.TurnUnit
import com.tradinggym.backend.repository.SimulationSessionRepository
import com.tradinggym.backend.repository.StockDailyPriceRepository
import com.tradinggym.backend.repository.StockNewsRepository
import com.tradinggym.backend.repository.TradeRepository
import com.tradinggym.backend.repository.TurnLogRepository
import com.tradinggym.backend.repository.UserJpaRepository
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.LocalDate
import java.time.Period
import java.time.temporal.ChronoUnit
import java.util.UUID

@Service
class SimulationService(
	private val userJpaRepository: UserJpaRepository,
	private val sessionRepository: SimulationSessionRepository,
	private val tradeRepository: TradeRepository,
	private val stockDailyPriceRepository: StockDailyPriceRepository,
	private val stockNewsRepository: StockNewsRepository,
	private val turnLogRepository: TurnLogRepository,
	private val sessionSummaryService: SessionSummaryService,
) {

	@Transactional
	fun createSession(username: String, request: CreateSessionRequest): SessionResponse {
		val user = requireUser(username)
		if (!stockDailyPriceRepository.existsByTradeDate(request.currentTurnDate)) {
			throw ResponseStatusException(HttpStatus.BAD_REQUEST, "${request.currentTurnDate}는 시세 데이터가 있는 거래일이 아니에요")
		}
		if (!stockDailyPriceRepository.existsByTradeDate(request.targetEndDate)) {
			throw ResponseStatusException(HttpStatus.BAD_REQUEST, "${request.targetEndDate}는 시세 데이터가 있는 거래일이 아니에요")
		}
		val selectableRange = selectableDateRange()
		if (selectableRange == null || request.currentTurnDate !in selectableRange || request.targetEndDate !in selectableRange) {
			throw ResponseStatusException(
				HttpStatus.BAD_REQUEST,
				"시작일·종료일 모두 ${selectableRange?.start}부터 ${selectableRange?.endInclusive}까지 중에서만 고를 수 있어요" +
					"(데이터 앞뒤로 ${START_DATE_EDGE_BUFFER.months}개월은 제외돼요)",
			)
		}
		val rangeTradingDays = tradingDayCountBetween(request.currentTurnDate, request.targetEndDate)
		if (rangeTradingDays < MIN_START_DATE_RANGE_DAYS) {
			throw ResponseStatusException(
				HttpStatus.BAD_REQUEST,
				"시작일부터 종료일까지 실제 거래일이 최소 ${MIN_START_DATE_RANGE_DAYS}일은 있어야 해요(지금은 ${rangeTradingDays}일)",
			)
		}
		val session = sessionRepository.save(
			SimulationSession(
				user = user,
				startingCash = request.startingCash,
				currentCash = request.startingCash,
				currentTurnDate = request.currentTurnDate,
				targetEndDate = request.targetEndDate,
			),
		)
		// 1턴째를 미리 열어둠 — 이후 trade가 생기는 즉시 turn_log_id를 붙일 수 있어야 해서.
		turnLogRepository.save(
			TurnLog(
				session = session,
				turnNumber = session.turnCount,
				turnDate = session.currentTurnDate,
				cash = session.currentCash,
				borrowedAmount = session.borrowedAmount,
				holdingsValue = BigDecimal.ZERO,
				portfolioValue = session.currentCash,
				tradeCount = 0,
				action = TurnAction.HELD,
			),
		)
		return session.toResponse()
	}

	// 세션 리포트/AI 종합 분석용 — 턴 하나하나가 관망이었는지 매매가 있었는지까지 전부 나옴.
	fun listTurnLogs(username: String, sessionId: UUID): List<TurnLogResponse> {
		val session = requireOwnedSession(username, sessionId)
		val logs = turnLogRepository.findBySessionIdOrderByTurnNumberAsc(requireNotNull(session.id))
		return logs.mapIndexed { index, log ->
			log.toResponse(newsForTurnPeriod(logs, index).map { it.toTurnNewsResponse() })
		}
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

	// 세션 시작 화면에서 시작일/종료일을 고를 수 있게 — 둘 다 이 같은 풀에서 고름.
	// 데이터 양 끝(첫날/마지막날)에서 달력으로 START_DATE_EDGE_BUFFER 이상 떨어진 날짜만
	// 후보로 줌(앞뒤 다 무조건 지켜야 하는 하한선). 시작~종료 사이 최소 거래일수
	// (MIN_START_DATE_RANGE_DAYS) 조건은 두 날짜를 다 고른 뒤 createSession에서 별도 검증함.
	fun getAvailableTradingDates(): List<LocalDate> {
		val range = selectableDateRange() ?: return emptyList()
		return stockDailyPriceRepository.findDistinctTradeDates().filter { it in range }
	}

	private fun selectableDateRange(): ClosedRange<LocalDate>? {
		val allDates = stockDailyPriceRepository.findDistinctTradeDates()
		if (allDates.isEmpty()) return null
		val minSelectable = allDates.first().plus(START_DATE_EDGE_BUFFER)
		val maxSelectable = allDates.last().minus(START_DATE_EDGE_BUFFER)
		if (minSelectable > maxSelectable) return null
		return minSelectable..maxSelectable
	}

	// start~end(둘 다 포함) 사이에 실제 시세가 있는 거래일이 몇 개인지 — 세션 시작 시
	// "최소 20거래일 이상 떨어져야 함" 검증에 씀.
	private fun tradingDayCountBetween(start: LocalDate, end: LocalDate): Int =
		stockDailyPriceRepository.findDistinctTradeDates().count { it in start..end }

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

	// 그 종목의 실제 뉴스(고정 데이터) 중 세션 현재 거래일 이전이거나 같은 날짜의 가장
	// 최근 것 하나 — 뉴스가 있는 날짜는 드물어서(가격이 크게 움직인 날 위주) "오늘"만
	// 정확히 맞추면 거의 항상 없음. 대신 NEWS_LOOKBACK_DAYS 이내로만 보여줘서, 몇 달 전
	// 뉴스가 "최신 뉴스"인 것처럼 계속 남아있지 않게 함.
	fun getStockNews(username: String, sessionId: UUID, stockCode: String): StockNewsResponse? {
		val session = requireOwnedSession(username, sessionId)
		val latest = stockNewsRepository.findTop1ByStockCodeAndTradeDateLessThanEqualOrderByTradeDateDesc(
			stockCode,
			session.currentTurnDate,
		) ?: return null
		val daysSince = ChronoUnit.DAYS.between(latest.tradeDate, session.currentTurnDate)
		if (daysSince > NEWS_LOOKBACK_DAYS) return null
		return StockNewsResponse(headline = latest.headline, summary = latest.summary, source = latest.source, tradeDate = latest.tradeDate)
	}

	@Transactional
	fun recordTrade(username: String, sessionId: UUID, request: CreateTradeRequest): TradeResponse {
		val session = requireOwnedActiveSession(username, sessionId)
		val currentTurnLog = requireCurrentTurnLog(session)

		// HOLD(관망)는 이 엔드포인트로 안 옴 — advanceTurn이 매매 없는 턴을 닫을 때 알아서 만듦.
		if (request.side == TradeSide.HOLD) {
			throw ResponseStatusException(HttpStatus.BAD_REQUEST, "HOLD는 직접 매매로 기록할 수 없어요")
		}

		if (request.orderType == TradeOrderType.LIMIT && request.limitPrice == null) {
			throw ResponseStatusException(HttpStatus.BAD_REQUEST, "지정가 주문은 limitPrice가 필요해요")
		}
		if (request.reasonText.isBlank()) {
			throw ResponseStatusException(HttpStatus.BAD_REQUEST, "매매 이유를 입력해주세요")
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
				turnLog = currentTurnLog,
				turnNumber = currentTurnLog.turnNumber,
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
				TradeSide.HOLD -> {} // 이 함수 초입에서 이미 거부됨 — when 완전성용
			}
			sessionRepository.save(session)
			checkMarginCall(session, currentTurnLog) // 신용 포지션이 있으면 담보비율 체크 → 미달 시 반대매매
		}

		return trade.toResponse()
	}

	fun listTrades(username: String, sessionId: UUID): List<TradeResponse> {
		val session = requireOwnedSession(username, sessionId)
		return tradeRepository.findBySessionIdOrderBySimulatedTradeDateAsc(requireNotNull(session.id)).map { it.toResponse() }
	}

	// currentTurnDate를 요청받은 turnUnit(하루/일주일/한달)만큼 건너뛴 다음, 그 시점 이후
	// 첫 실제 거래일로 스냅함 — turnUnit은 세션 고정값이 아니라 턴 넘길 때마다 매번 고름.
	// "거래일 캘린더"는 stock_daily_prices에 실제로 데이터가 있는 날짜들 그 자체 —
	// 주말/공휴일은 자연히 빠짐. MAX_TURNS(20)에 도달하면 더 진행 못 함.
	@Transactional
	fun advanceTurn(username: String, sessionId: UUID, request: AdvanceTurnRequest): SessionResponse {
		val session = requireOwnedActiveSession(username, sessionId)
		if (session.turnCount >= MAX_TURNS) {
			throw ResponseStatusException(HttpStatus.CONFLICT, "이번 시뮬레이션의 최대 턴(${MAX_TURNS}턴)에 도달했어요. 시뮬레이션을 종료해주세요")
		}
		val closingTurnLog = requireCurrentTurnLog(session)
		val tradesThisClosingTurn = tradeRepository.findByTurnLogId(requireNotNull(closingTurnLog.id))
		if (tradesThisClosingTurn.isEmpty()) {
			// 이번 턴에 매매를 하나도 안 했으면 관망 이유가 필수 — HOLD 성격의 trades 행을 하나 남김.
			if (request.holdReasonText.isNullOrBlank()) {
				throw ResponseStatusException(HttpStatus.BAD_REQUEST, "관망 이유를 입력해주세요")
			}
			tradeRepository.save(
				Trade(
					session = session,
					turnLog = closingTurnLog,
					turnNumber = closingTurnLog.turnNumber,
					side = TradeSide.HOLD,
					reasonText = request.holdReasonText,
					simulatedTradeDate = session.currentTurnDate,
				),
			)
		}
		finalizeTurnLog(session) // 지금 막 끝나는 턴의 최종 스냅샷을 확정
		val targetDate = when (request.turnUnit) {
			TurnUnit.DAY -> session.currentTurnDate.plusDays(1)
			TurnUnit.WEEK -> session.currentTurnDate.plusWeeks(1)
			TurnUnit.MONTH -> session.currentTurnDate.plusMonths(1)
		}
		val nextDay = stockDailyPriceRepository.findTop1ByTradeDateGreaterThanEqualOrderByTradeDateAsc(targetDate)
		if (nextDay == null || nextDay.tradeDate > session.targetEndDate) {
			// 이번 턴 단위(하루/일주일/한달)만큼 넘기면 사용자가 정한 종료 예정일을 넘어가거나
			// (혹은 그마저 없을 만큼 시세 데이터 자체가 바닥남) — 에러로 막는 대신 세션을
			// 정상 종료 처리함(방금 finalizeTurnLog로 마지막 턴 스냅샷은 이미 확정됨).
			// 프론트는 status=COMPLETED를 보고 종료 팝업을 띄우면 됨.
			session.status = SimulationSessionStatus.COMPLETED
			session.endedAt = Instant.now()
			val saved = sessionRepository.save(session).toResponse()
			sessionSummaryService.finalizeAndPersistStats(username, sessionId)
			return saved
		}
		session.currentTurnDate = nextDay.tradeDate
		session.turnCount += 1
		sessionRepository.save(session)
		val openingHoldingsValue = computeHoldingsValue(session)
		val newTurnLog = turnLogRepository.save(
			TurnLog(
				session = session,
				turnNumber = session.turnCount,
				turnDate = session.currentTurnDate,
				turnUnit = request.turnUnit,
				cash = session.currentCash,
				borrowedAmount = session.borrowedAmount,
				holdingsValue = openingHoldingsValue,
				portfolioValue = session.currentCash.add(openingHoldingsValue),
				tradeCount = 0,
				action = TurnAction.HELD,
			),
		)
		// 밤새(또는 며칠/몇 주 사이) 가격이 움직여서 담보비율이 무너질 수 있음 — 턴 넘길 때도 체크.
		// 이 시점에 강제청산이 나오면 새로 연 turnLog(새 턴)에 붙음.
		checkMarginCall(session, newTurnLog)
		return session.toResponse()
	}

	// 세션을 끝냄 — "재도전 루프"의 시작점. 끝난 세션은 더 이상 매매/턴진행 안 되고,
	// getActiveSession이 null을 반환하니 프론트가 자연스럽게 새 세션 시작 화면으로 감.
	// 종료 시점에 AI 채점(SessionStatAnalyzer)을 한 번 계산해서 session_stats에 영구
	// 저장함 — 세션을 거듭할수록 지표가 어떻게 바뀌는지 성장 추이를 볼 수 있게 하려는 목적.
	@Transactional
	fun completeSession(username: String, sessionId: UUID): SessionResponse {
		val session = requireOwnedActiveSession(username, sessionId)
		finalizeTurnLog(session) // 마지막 턴(아직 안 닫힌 턴)의 최종 스냅샷 확정
		session.status = SimulationSessionStatus.COMPLETED
		session.endedAt = Instant.now()
		val saved = sessionRepository.save(session).toResponse()
		sessionSummaryService.finalizeAndPersistStats(username, sessionId)
		return saved
	}

	// 필터된(수량>0) 종목별 보유 수량 — filled된 BUY/SELL 매매만 집계(HOLD는 종목이 없어서 제외).
	private fun computeHoldingsQuantities(sessionId: UUID): Map<String, Int> {
		val holdings = mutableMapOf<String, Int>()
		for (t in tradeRepository.findBySessionIdOrderBySimulatedTradeDateAsc(sessionId)) {
			if (!t.filled || t.side == TradeSide.HOLD) continue
			val stockCode = requireNotNull(t.stockCode)
			val quantity = requireNotNull(t.quantity)
			val delta = if (t.side == TradeSide.BUY) quantity else -quantity
			holdings[stockCode] = (holdings[stockCode] ?: 0) + delta
		}
		return holdings.filterValues { it > 0 }
	}

	// 담보비율(현금+보유종목 평가액 / 대출원금)이 140% 밑으로 떨어지면 보유 종목을 전부
	// 그날 시가로 강제 매도해서 대출을 정리함 — 이 서비스의 핵심 교육 시나리오.
	// 평가/체결 가격 둘 다 시가를 씀(이 앱 전체에서 "현재 아는 가격"의 기준이 시가라서).
	// turnLog는 이 강제청산이 어느 턴 소속인지(호출부가 이미 알고 있어서 넘겨받음) — recordTrade에서
	// 부르면 지금 턴, advanceTurn에서 부르면 방금 새로 연 턴.
	private fun checkMarginCall(session: SimulationSession, turnLog: TurnLog) {
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
					turnLog = turnLog,
					turnNumber = turnLog.turnNumber,
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

	// 세션의 현재 시가 기준 보유종목 평가액 — checkMarginCall의 equity 계산과 같은 방식이지만
	// 턴 스냅샷(finalizeTurnLog/advanceTurn) 용도로 별도 함수로 뺌.
	private fun computeHoldingsValue(session: SimulationSession): BigDecimal {
		val holdings = computeHoldingsQuantities(requireNotNull(session.id))
		var value = BigDecimal.ZERO
		for ((stockCode, quantity) in holdings) {
			val price = stockDailyPriceRepository.findByStockCodeAndTradeDate(stockCode, session.currentTurnDate) ?: continue
			value = value.add(price.openPrice.multiply(BigDecimal(quantity)))
		}
		return value
	}

	private fun requireCurrentTurnLog(session: SimulationSession): TurnLog =
		turnLogRepository.findBySessionIdAndTurnNumber(requireNotNull(session.id), session.turnCount)
			?: error("세션 ${session.id}의 ${session.turnCount}턴 turn_log가 없어요 — 데이터 정합성 문제")

	// 턴이 닫히는 시점(advanceTurn/completeSession)에 그 턴의 최종 스냅샷을 확정 — 관망만
	// 했어도 이 호출로 cash/holdingsValue 등이 실제 값으로 채워짐(생성 시점엔 추정치였음).
	private fun finalizeTurnLog(session: SimulationSession) {
		val turnLog = requireCurrentTurnLog(session)
		val tradesThisTurn = tradeRepository.findByTurnLogId(requireNotNull(turnLog.id))
		val realTrades = tradesThisTurn.filter { it.side != TradeSide.HOLD } // HOLD는 매매 시도 횟수에 안 들어감
		val holdingsValue = computeHoldingsValue(session)
		turnLog.cash = session.currentCash
		turnLog.borrowedAmount = session.borrowedAmount
		turnLog.holdingsValue = holdingsValue
		turnLog.portfolioValue = session.currentCash.add(holdingsValue)
		turnLog.tradeCount = realTrades.size
		turnLog.action = when {
			realTrades.any { it.tradeType == TradeType.FORCED_LIQUIDATION } -> TurnAction.FORCED_LIQUIDATED
			realTrades.isNotEmpty() -> TurnAction.TRADED
			else -> TurnAction.HELD
		}
		turnLogRepository.save(turnLog)
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

	// logs[index]가 열리기까지 건너뛴 기간(직전 턴 날짜 다음날 ~ 이 턴 날짜) 동안 있었던
	// 뉴스 — 1턴째(index=0)는 건너뛴 구간이 없어서 그날 하루만 봄.
	private fun newsForTurnPeriod(logs: List<TurnLog>, index: Int): List<StockNews> {
		val rangeStart = if (index == 0) logs[index].turnDate else logs[index - 1].turnDate.plusDays(1)
		return stockNewsRepository.findByTradeDateBetweenOrderByTradeDateAsc(rangeStart, logs[index].turnDate)
	}

	companion object {
		private val MAINTENANCE_RATIO = BigDecimal("1.4") // 담보 유지비율 140% (RiskInterventionModal mock 수치와 동일)
		const val MAX_TURNS = 20 // 세션당 최대 턴 수 — 턴 단위(하루/일주일/한달)와 무관하게 동일하게 적용

		// 사용자가 고르는 시작일~종료일 사이에 최소 이만큼의 실제 거래일은 있어야 함 —
		// MAX_TURNS와 같은 수치로 맞춰서, 제일 촘촘한 하루 단위로 20턴을 다 채워도
		// 종료일 전에 데이터가 바닥나지 않는 걸 보장함.
		private const val MIN_START_DATE_RANGE_DAYS = MAX_TURNS

		// 시작일/종료일 선택 범위에서 데이터 앞뒤로 무조건 제외하는 달력 buffer.
		// 여기 하나만 바꾸면 검증 전체에 반영됨.
		private val START_DATE_EDGE_BUFFER: Period = Period.ofMonths(1)

		// 종목 뉴스(고정 데이터)가 "최신 뉴스"로 보일 수 있는 최대 기간(달력일) — 이보다
		// 오래된 뉴스는 getStockNews가 null로 처리해서 화면에서 사라짐.
		private const val NEWS_LOOKBACK_DAYS = 14
	}
}

private fun SimulationSession.toResponse() = SessionResponse(
	id = requireNotNull(id),
	status = status,
	startingCash = startingCash,
	currentCash = currentCash,
	borrowedAmount = borrowedAmount,
	currentTurnDate = currentTurnDate,
	targetEndDate = targetEndDate,
	turnCount = turnCount,
	maxTurns = SimulationService.MAX_TURNS,
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
	reasonText = reasonText,
	turnNumber = turnNumber,
	simulatedTradeDate = simulatedTradeDate,
	createdAt = createdAt,
)

private fun StockNews.toTurnNewsResponse() = TurnNewsResponse(
	stockCode = stockCode,
	headline = headline,
	summary = summary,
	source = source,
	tradeDate = tradeDate,
)

private fun TurnLog.toResponse(news: List<TurnNewsResponse>) = TurnLogResponse(
	id = requireNotNull(id),
	turnNumber = turnNumber,
	turnDate = turnDate,
	turnUnit = turnUnit,
	cash = cash,
	borrowedAmount = borrowedAmount,
	holdingsValue = holdingsValue,
	news = news,
	portfolioValue = portfolioValue,
	tradeCount = tradeCount,
	action = action,
)
