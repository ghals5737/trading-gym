package com.tradinggym.backend.repository

import com.tradinggym.backend.entity.ChatMessage
import com.tradinggym.backend.entity.ChatRole
import com.tradinggym.backend.entity.UserEntity
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.transaction.annotation.Transactional

@SpringBootTest
@Transactional
class ChatMessageRepositoryTests {

	@Autowired lateinit var userRepository: UserJpaRepository
	@Autowired lateinit var chatMessageRepository: ChatMessageRepository

	@Test
	fun `chat messages round-trip`() {
		val user = userRepository.save(UserEntity(username = "chat-test-${System.nanoTime()}", passwordHash = "x"))
		val userId = requireNotNull(user.id)

		chatMessageRepository.save(ChatMessage(user = user, role = ChatRole.USER, content = "반대매매가 뭐예요?"))
		chatMessageRepository.save(
			ChatMessage(user = user, role = ChatRole.ASSISTANT, content = "담보비율이 기준 아래로 떨어지면..."),
		)

		val userQuestions = chatMessageRepository.findTop20ByUserIdAndRoleOrderByCreatedAtDesc(userId, ChatRole.USER)
		assertEquals(1, userQuestions.size)
		assertEquals("반대매매가 뭐예요?", userQuestions.first().content)

		assertEquals(2, chatMessageRepository.findByUserIdOrderByCreatedAtAsc(userId).size)
	}
}
