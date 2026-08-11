package com.tradinggym.backend.controller

import com.tradinggym.backend.dto.CreateSessionRequest
import com.tradinggym.backend.dto.CreateTradeRequest
import com.tradinggym.backend.dto.QuoteResponse
import com.tradinggym.backend.dto.SessionReportResponse
import com.tradinggym.backend.dto.SessionResponse
import com.tradinggym.backend.dto.StockHistoryResponse
import com.tradinggym.backend.dto.TradeResponse
import com.tradinggym.backend.service.BehaviorReportService
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
	private val behaviorReportService: BehaviorReportService,
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

	@PostMapping("/{sessionId}/advance-turn")
	fun advanceTurn(authentication: Authentication, @PathVariable sessionId: UUID): SessionResponse =
		simulationService.advanceTurn(authentication.name, sessionId)

	@PostMapping("/{sessionId}/complete")
	fun completeSession(authentication: Authentication, @PathVariable sessionId: UUID): SessionResponse =
		simulationService.completeSession(authentication.name, sessionId)

	@GetMapping("/{sessionId}/report")
	fun getReport(authentication: Authentication, @PathVariable sessionId: UUID): SessionReportResponse =
		behaviorReportService.generateReport(authentication.name, sessionId)
}
