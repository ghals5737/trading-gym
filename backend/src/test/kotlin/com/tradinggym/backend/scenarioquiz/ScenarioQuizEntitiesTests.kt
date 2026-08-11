package com.tradinggym.backend.scenarioquiz

import com.tradinggym.backend.entity.SessionStatKey
import com.tradinggym.backend.user.UserEntity
import com.tradinggym.backend.user.UserJpaRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.transaction.annotation.Transactional

@SpringBootTest
@Transactional
class ScenarioQuizEntitiesTests {

	@Autowired lateinit var userRepository: UserJpaRepository
	@Autowired lateinit var promptRepository: ScenarioQuizPromptRepository
	@Autowired lateinit var optionRepository: ScenarioQuizOptionRepository
	@Autowired lateinit var responseRepository: UserScenarioQuizResponseRepository

	@Test
	fun `prompt, options with behavior tag, and user response round-trip`() {
		val user = userRepository.save(UserEntity(username = "quiz-test-${System.nanoTime()}", passwordHash = "x"))

		val prompt = promptRepository.save(
			ScenarioQuizPrompt(
				headline = "보유 중인 '대형전자 A', 하루 만에 -15% 급락",
				context = "남은 현금은 320만 원, 신용 매수분 포함 40주 보유 중",
				feedbackTemplate = "위험을 나눠 담는 선택, 좋아요.",
				xpReward = 120,
			),
		)

		optionRepository.save(
			ScenarioQuizOption(
				prompt = prompt,
				position = 1,
				label = "오히려 추가 매수로 평단가를 낮춘다",
				hint = "물타기 — 확신 없이는 위험이 커져요",
				behaviorTag = SessionStatKey.CONFIRMATION_BIAS,
			),
		)
		val chosen = optionRepository.save(
			ScenarioQuizOption(
				prompt = prompt,
				position = 2,
				label = "실적 발표를 지켜보며 절반만 매도한다",
				hint = "위험을 나눠 담아보는 선택이에요",
				behaviorTag = SessionStatKey.DIVERSIFICATION,
			),
		)

		responseRepository.save(
			UserScenarioQuizResponse(user = user, prompt = prompt, selectedOption = chosen, xpGained = 120),
		)

		val promptId = requireNotNull(prompt.id)
		val userId = requireNotNull(user.id)

		assertEquals(2, optionRepository.findByPromptIdOrderByPositionAsc(promptId).size)
		assertEquals(1, optionRepository.findByBehaviorTag(SessionStatKey.DIVERSIFICATION).size)

		val responses = responseRepository.findByUserId(userId)
		assertEquals(1, responses.size)
		assertEquals(120, responses.first().xpGained)
		assertEquals(chosen.id, responses.first().selectedOption.id)
	}
}
