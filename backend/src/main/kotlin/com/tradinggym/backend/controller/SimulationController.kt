package com.tradinggym.backend.controller

import com.tradinggym.backend.dto.AdvanceTurnRequest
import com.tradinggym.backend.dto.CreateSessionRequest
import com.tradinggym.backend.dto.CreateTradeRequest
import com.tradinggym.backend.dto.QuoteResponse
import com.tradinggym.backend.dto.SessionResponse
import com.tradinggym.backend.dto.SessionStatScoreResponse
import com.tradinggym.backend.dto.SessionSummaryResponse
import com.tradinggym.backend.dto.StockHistoryResponse
import com.tradinggym.backend.dto.StockNewsResponse
import com.tradinggym.backend.dto.TradeResponse
import com.tradinggym.backend.dto.TurnLogResponse
import com.tradinggym.backend.service.SessionSummaryService
import com.tradinggym.backend.service.SimulationService
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate
import java.util.UUID

@RestController
@RequestMapping("/api/sessions")
class SimulationController(
	private val simulationService: SimulationService,
	private val sessionSummaryService: SessionSummaryService,
) {

	@GetMapping("/available-dates")
	fun getAvailableTradingDates(): List<LocalDate> = simulationService.getAvailableTradingDates()

	@PostMapping
	fun createSession(
		authentication: Authentication,
		@RequestBody request: CreateSessionRequest,
	): ResponseEntity<SessionResponse> {
		val session = simulationService.createSession(authentication.name, request)
		return ResponseEntity.status(HttpStatus.CREATED).body(session)
	}

	@GetMapping("/active")
	fun getActiveSession(authentication: Authentication): ResponseEntity<SessionResponse> {
		val session = simulationService.getActiveSession(authentication.name)
			?: return ResponseEntity.noContent().build()
		return ResponseEntity.ok(session)
	}

	@GetMapping
	fun listSessions(authentication: Authentication): List<SessionResponse> =
		simulationService.listSessions(authentication.name)

	@GetMapping("/{sessionId}/quotes")
	fun getQuotes(authentication: Authentication, @PathVariable sessionId: UUID): List<QuoteResponse> =
		simulationService.getQuotes(authentication.name, sessionId)

	@GetMapping("/{sessionId}/quotes/{stockCode}")
	fun getQuote(
		authentication: Authentication,
		@PathVariable sessionId: UUID,
		@PathVariable stockCode: String,
	): QuoteResponse = simulationService.getQuote(authentication.name, sessionId, stockCode)

	@GetMapping("/{sessionId}/stocks/{stockCode}/history")
	fun getStockHistory(
		authentication: Authentication,
		@PathVariable sessionId: UUID,
		@PathVariable stockCode: String,
	): StockHistoryResponse = simulationService.getStockHistory(authentication.name, sessionId, stockCode)

	// 그 종목의 최근 실제 뉴스(고정 데이터) — 없으면(뉴스가 있는 날짜가 아니거나 너무
	// 오래됐으면) 204로 응답, 프론트는 뉴스 카드를 안 보여주면 됨.
	@GetMapping("/{sessionId}/stocks/{stockCode}/news")
	fun getStockNews(
		authentication: Authentication,
		@PathVariable sessionId: UUID,
		@PathVariable stockCode: String,
	): ResponseEntity<StockNewsResponse> {
		val news = simulationService.getStockNews(authentication.name, sessionId, stockCode)
			?: return ResponseEntity.noContent().build()
		return ResponseEntity.ok(news)
	}

	@PostMapping("/{sessionId}/trades")
	fun recordTrade(
		authentication: Authentication,
		@PathVariable sessionId: UUID,
		@RequestBody request: CreateTradeRequest,
	): ResponseEntity<TradeResponse> {
		val trade = simulationService.recordTrade(authentication.name, sessionId, request)
		return ResponseEntity.status(HttpStatus.CREATED).body(trade)
	}

	@GetMapping("/{sessionId}/trades")
	fun listTrades(authentication: Authentication, @PathVariable sessionId: UUID): List<TradeResponse> =
		simulationService.listTrades(authentication.name, sessionId)

	// turnUnit(하루/일주일/한달)은 매번 필수 — 세션 고정값이 아니라 턴 넘길 때마다 프론트가 고름.
	@PostMapping("/{sessionId}/advance-turn")
	fun advanceTurn(
		authentication: Authentication,
		@PathVariable sessionId: UUID,
		@RequestBody request: AdvanceTurnRequest,
	): SessionResponse = simulationService.advanceTurn(authentication.name, sessionId, request)

	@PostMapping("/{sessionId}/complete")
	fun completeSession(authentication: Authentication, @PathVariable sessionId: UUID): SessionResponse =
		simulationService.completeSession(authentication.name, sessionId)

	// 턴별 타임라인 — 관망한 턴까지 전부 포함. AI가 세션 전체를 종합 분석할 때 쓸 원자료.
	@GetMapping("/{sessionId}/turn-logs")
	fun listTurnLogs(authentication: Authentication, @PathVariable sessionId: UUID): List<TurnLogResponse> =
		simulationService.listTurnLogs(authentication.name, sessionId)

	// turn_logs + trades를 턴 단위로 통째로 묶은 세션 종합 — 나중에 "추천 교육자료/오늘의
	// PT"를 LLM한테 받는 기능의 프롬프트 재료로 쓸 예정. 지금은 이 API 자체가 그 준비 단계.
	@GetMapping("/{sessionId}/summary")
	fun getSessionSummary(authentication: Authentication, @PathVariable sessionId: UUID): SessionSummaryResponse =
		sessionSummaryService.getSessionSummary(authentication.name, sessionId)

	// summary를 AI(SessionStatAnalyzer)에 넘겨서 받은 8개 지표 채점 — reasonText까지 읽고
	// 판단한 결과라 순수 규칙 계산보다 오래 걸릴 수 있음.
	@GetMapping("/{sessionId}/stats")
	fun getSessionStats(authentication: Authentication, @PathVariable sessionId: UUID): List<SessionStatScoreResponse> =
		sessionSummaryService.getSessionStats(authentication.name, sessionId)
}
