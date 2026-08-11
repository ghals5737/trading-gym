package com.tradinggym.backend.education

import com.tradinggym.backend.user.UserEntity
import com.tradinggym.backend.user.UserJpaRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.transaction.annotation.Transactional

@SpringBootTest
@Transactional
class EducationEntitiesTests {

	@Autowired lateinit var userRepository: UserJpaRepository
	@Autowired lateinit var articleRepository: EducationArticleRepository
	@Autowired lateinit var questionRepository: EducationQuizQuestionRepository
	@Autowired lateinit var optionRepository: EducationQuizOptionRepository
	@Autowired lateinit var chunkRepository: EducationChunkRepository
	@Autowired lateinit var progressRepository: UserArticleProgressRepository
	@Autowired lateinit var answerRepository: UserQuizAnswerRepository

	@Test
	fun `article, quiz, chunk, progress and answer round-trip`() {
		val user = userRepository.save(UserEntity(username = "edu-test-${System.nanoTime()}", passwordHash = "x"))

		val article = articleRepository.save(
			EducationArticle(
				slug = "margin-call-basics-${System.nanoTime()}",
				category = EducationCategory.RISK_MANAGEMENT,
				title = "반대매매란",
				summary = "담보비율이 기준 아래로 떨어지면 강제 청산돼요.",
				source = "금융감독원",
				body = "본문...",
			),
		)

		chunkRepository.save(EducationChunk(article = article, chunkIndex = 0, content = "첫 문단"))
		chunkRepository.save(EducationChunk(article = article, chunkIndex = 1, content = "둘째 문단"))

		val question = questionRepository.save(
			EducationQuizQuestion(article = article, position = 1, question = "반대매매는 언제 발생하나요?"),
		)
		val wrongOption = optionRepository.save(
			EducationQuizOption(question = question, position = 1, label = "아무 때나", isCorrect = false),
		)
		optionRepository.save(
			EducationQuizOption(question = question, position = 2, label = "담보비율 미달 시", isCorrect = true),
		)

		progressRepository.save(UserArticleProgress(user = user, article = article))

		answerRepository.save(
			UserQuizAnswer(user = user, question = question, selectedOption = wrongOption, isCorrect = false),
		)

		val articleId = requireNotNull(article.id)
		val userId = requireNotNull(user.id)

		assertEquals(2, chunkRepository.findByArticleIdOrderByChunkIndexAsc(articleId).size)
		assertEquals(2, optionRepository.findByQuestionIdOrderByPositionAsc(requireNotNull(question.id)).size)
		assertEquals(article.slug, articleRepository.findBySlug(article.slug)?.slug)
		assertTrue(articleRepository.findByCategory(EducationCategory.RISK_MANAGEMENT).any { it.id == articleId })

		val progress = progressRepository.findByUserIdAndArticleId(userId, articleId)
		assertTrue(progress != null)

		val answers = answerRepository.findByUserId(userId)
		assertEquals(1, answers.size)
		assertEquals(false, answers.first().isCorrect)
	}
}
