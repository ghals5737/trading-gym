package com.tradinggym.backend.controller

import com.tradinggym.backend.dto.PersonalizedQuizResponse
import com.tradinggym.backend.dto.QuizAnswerRequest
import com.tradinggym.backend.dto.QuizAnswerResponse
import com.tradinggym.backend.dto.QuizHistoryItemResponse
import com.tradinggym.backend.service.QuizGenerationService
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/quiz")
class QuizController(private val quizGenerationService: QuizGenerationService) {

	@PostMapping("/generate")
	fun generate(authentication: Authentication): PersonalizedQuizResponse =
		quizGenerationService.generateForUser(authentication.name)

	@GetMapping("/latest")
	fun latest(authentication: Authentication): ResponseEntity<PersonalizedQuizResponse> {
		val quiz = quizGenerationService.getLatest(authentication.name) ?: return ResponseEntity.noContent().build()
		return ResponseEntity.ok(quiz)
	}

	@GetMapping("/history")
	fun history(authentication: Authentication): List<QuizHistoryItemResponse> =
		quizGenerationService.getHistory(authentication.name)

	@PostMapping("/{quizId}/answer")
	fun answer(
		authentication: Authentication,
		@PathVariable quizId: UUID,
		@RequestBody request: QuizAnswerRequest,
	): QuizAnswerResponse = quizGenerationService.answer(authentication.name, quizId, request.selectedOptionId)
}
