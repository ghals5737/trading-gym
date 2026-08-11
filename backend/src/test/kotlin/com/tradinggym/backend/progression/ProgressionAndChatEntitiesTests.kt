package com.tradinggym.backend.progression

import com.tradinggym.backend.chat.ChatMessage
import com.tradinggym.backend.chat.ChatMessageRepository
import com.tradinggym.backend.chat.ChatRole
import com.tradinggym.backend.user.UserEntity
import com.tradinggym.backend.user.UserJpaRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.transaction.annotation.Transactional

@SpringBootTest
@Transactional
class ProgressionAndChatEntitiesTests {

	@Autowired lateinit var userRepository: UserJpaRepository
	@Autowired lateinit var aiCharacterRepository: AiCharacterRepository
	@Autowired lateinit var xpEventRepository: XpEventRepository
	@Autowired lateinit var chatMessageRepository: ChatMessageRepository

	@Test
	fun `ai character, xp events, and chat messages round-trip`() {
		val user = userRepository.save(UserEntity(username = "progress-test-${System.nanoTime()}", passwordHash = "x"))
		val userId = requireNotNull(user.id)

		aiCharacterRepository.save(AiCharacter(user = user, xp = 620, level = 3))

		xpEventRepository.save(XpEvent(user = user, source = XpSource.SIMULATION, amount = 280))
		xpEventRepository.save(XpEvent(user = user, source = XpSource.EDUCATION_QUIZ, amount = 220))

		chatMessageRepository.save(ChatMessage(user = user, role = ChatRole.USER, content = "반대매매가 뭐예요?"))
		chatMessageRepository.save(
			ChatMessage(user = user, role = ChatRole.ASSISTANT, content = "담보비율이 기준 아래로 떨어지면..."),
		)

		val character = aiCharacterRepository.findByUserId(userId)
		assertEquals(620, character?.xp)
		assertEquals(3, character?.level)

		val events = xpEventRepository.findByUserIdOrderByCreatedAtDesc(userId)
		assertEquals(2, events.size)
		assertEquals(500, events.sumOf { it.amount })

		val userQuestions = chatMessageRepository.findTop20ByUserIdAndRoleOrderByCreatedAtDesc(userId, ChatRole.USER)
		assertEquals(1, userQuestions.size)
		assertEquals("반대매매가 뭐예요?", userQuestions.first().content)

		assertEquals(2, chatMessageRepository.findByUserIdOrderByCreatedAtAsc(userId).size)
	}
}
