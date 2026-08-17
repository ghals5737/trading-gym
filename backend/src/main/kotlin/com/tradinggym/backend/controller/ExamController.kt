package com.tradinggym.backend.controller

import com.tradinggym.backend.dto.ExamAttemptResponse
import com.tradinggym.backend.dto.ExamQuizAnswerRequest
import com.tradinggym.backend.dto.ExamQuizAnswerResponse
import com.tradinggym.backend.dto.ExamQuizSetResponse
import com.tradinggym.backend.dto.ExamReportResponse
import com.tradinggym.backend.dto.ExamTurnOutcomeResponse
import com.tradinggym.backend.dto.ExamTurnResponse
import com.tradinggym.backend.dto.SubmitTurnRequest
import com.tradinggym.backend.service.ExamQuizService
import com.tradinggym.backend.service.ExamService
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

// 모의고사(리와인드) API. 프론트 /rewind 화면의 단계와 1:1로 대응한다:
//   시작 → 턴 제출(결과 공개) → 리포트 → 맞춤 퀴즈 → 퀴즈 답변
@RestController
@RequestMapping("/api/exam")
class ExamController(
	private val examService: ExamService,
	private val examQuizService: ExamQuizService,
) {

	@PostMapping("/start")
	fun start(
		authentication: Authentication,
		@RequestParam(required = false) paperCode: String?,
	): ExamAttemptResponse = examService.start(authentication.name, paperCode)

	// 진행 중인 응시 — 새로고침해도 이어서 풀 수 있게.
	@GetMapping("/active")
	fun active(authentication: Authentication): ResponseEntity<ExamAttemptResponse> {
		val attempt = examService.getActive(authentication.name) ?: return ResponseEntity.noContent().build()
		return ResponseEntity.ok(attempt)
	}

	@GetMapping("/latest")
	fun latest(authentication: Authentication): ResponseEntity<ExamAttemptResponse> {
		val attempt = examService.getLatest(authentication.name) ?: return ResponseEntity.noContent().build()
		return ResponseEntity.ok(attempt)
	}

	@GetMapping("/{attemptId}/turns/{turnNo}")
	fun turn(
		authentication: Authentication,
		@PathVariable attemptId: UUID,
		@PathVariable turnNo: Int,
	): ExamTurnResponse = examService.getTurn(authentication.name, attemptId, turnNo)

	// 제출해야 비로소 결과(이후 주가 흐름·모범답안)가 응답에 담긴다.
	@PostMapping("/{attemptId}/submit")
	fun submit(
		authentication: Authentication,
		@PathVariable attemptId: UUID,
		@RequestBody request: SubmitTurnRequest,
	): ExamTurnOutcomeResponse = examService.submitTurn(authentication.name, attemptId, request)

	@GetMapping("/{attemptId}/report")
	fun report(
		authentication: Authentication,
		@PathVariable attemptId: UUID,
	): ExamReportResponse = examQuizService.buildReport(authentication.name, attemptId)

	@PostMapping("/{attemptId}/quiz")
	fun generateQuiz(
		authentication: Authentication,
		@PathVariable attemptId: UUID,
	): ExamQuizSetResponse = examQuizService.generateQuiz(authentication.name, attemptId)

	@GetMapping("/{attemptId}/quiz")
	fun quiz(
		authentication: Authentication,
		@PathVariable attemptId: UUID,
	): ResponseEntity<ExamQuizSetResponse> {
		val set = examQuizService.getQuiz(authentication.name, attemptId) ?: return ResponseEntity.noContent().build()
		return ResponseEntity.ok(set)
	}

	@PostMapping("/quiz/questions/{questionId}/answer")
	fun answerQuiz(
		authentication: Authentication,
		@PathVariable questionId: UUID,
		@RequestBody request: ExamQuizAnswerRequest,
	): ExamQuizAnswerResponse =
		examQuizService.answer(authentication.name, questionId, request.selectedOptionId)
}
