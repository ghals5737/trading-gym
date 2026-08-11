package com.tradinggym.backend.controller

import com.tradinggym.backend.dto.InvestorProfileResponse
import com.tradinggym.backend.dto.OnboardingQuestionResponse
import com.tradinggym.backend.dto.SaveAnswerRequest
import com.tradinggym.backend.dto.SavedAnswerResponse
import com.tradinggym.backend.dto.SubmitOnboardingResponse
import com.tradinggym.backend.service.OnboardingService
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/onboarding")
class OnboardingController(private val onboardingService: OnboardingService) {

	@GetMapping("/questions")
	fun getQuestions(): List<OnboardingQuestionResponse> = onboardingService.getQuestions()

	@PostMapping("/answer")
	fun saveAnswer(authentication: Authentication, @RequestBody request: SaveAnswerRequest): SavedAnswerResponse =
		onboardingService.saveAnswer(authentication.name, request)

	@GetMapping("/progress")
	fun getProgress(authentication: Authentication): List<SavedAnswerResponse> =
		onboardingService.getProgress(authentication.name)

	// 문항 6개 답이 다 저장돼있어야 함 — 대화 전체를 AI에 넘겨 채점+설명을 한 번에 받고 확정함.
	// 답변 중 질문이랑 무관해 보이는 게 있으면 profile 대신 questionsToRetry가 채워짐.
	@PostMapping("/submit")
	fun submitOnboarding(authentication: Authentication): SubmitOnboardingResponse =
		onboardingService.submitOnboarding(authentication.name)

	@GetMapping("/profile")
	fun getMyProfile(authentication: Authentication): ResponseEntity<InvestorProfileResponse> {
		val profile = onboardingService.getMyProfile(authentication.name) ?: return ResponseEntity.noContent().build()
		return ResponseEntity.ok(profile)
	}
}
