package com.tradinggym.backend.service

import com.tradinggym.backend.dto.ChatMessageResponse
import com.tradinggym.backend.entity.ChatMessage
import com.tradinggym.backend.entity.ChatRole
import com.tradinggym.backend.repository.ChatMessageRepository
import com.tradinggym.backend.repository.UserJpaRepository
import com.tradinggym.backend.service.ai.ChatReplyGenerator
import com.tradinggym.backend.service.ai.ChatTurn
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

// KnowerBot 채팅창의 자유 대화 — 유저 메시지를 저장하고, 최근 대화 맥락과 함께 AI에 넘겨
// 답변을 받아 그것도 저장함. 온보딩(진단 채점용)·매매 이유 질문과는 별개의 대화 로그.
@Service
class ChatService(
	private val userJpaRepository: UserJpaRepository,
	private val chatMessageRepository: ChatMessageRepository,
	private val chatReplyGenerator: ChatReplyGenerator,
) {

	fun getHistory(username: String): List<ChatMessageResponse> {
		val user = requireUser(username)
		return chatMessageRepository.findByUserIdOrderByCreatedAtAsc(requireNotNull(user.id)).map { it.toResponse() }
	}

	@Transactional
	fun sendMessage(username: String, text: String): ChatMessageResponse {
		if (text.isBlank()) {
			throw ResponseStatusException(HttpStatus.BAD_REQUEST, "메시지를 입력해주세요")
		}
		if (text.length > MAX_MESSAGE_LENGTH) {
			throw ResponseStatusException(HttpStatus.BAD_REQUEST, "메시지가 너무 길어요. ${MAX_MESSAGE_LENGTH}자 이내로 보내주세요")
		}
		val user = requireUser(username)
		val userId = requireNotNull(user.id)

		// 최근 순으로 가져온 걸 시간순으로 뒤집어서 프롬프트에 씀(오래된 것부터).
		val recentHistory = chatMessageRepository.findTop20ByUserIdOrderByCreatedAtDesc(userId)
			.asReversed()
			.map { ChatTurn(role = it.role, content = it.content) }

		chatMessageRepository.save(ChatMessage(user = user, role = ChatRole.USER, content = text))

		val replyText = chatReplyGenerator.reply(recentHistory, text)
		val botMessage = chatMessageRepository.save(ChatMessage(user = user, role = ChatRole.ASSISTANT, content = replyText))

		return botMessage.toResponse()
	}

	private fun requireUser(username: String) =
		userJpaRepository.findByUsername(username)
			?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "사용자를 찾을 수 없습니다")

	companion object {
		private const val MAX_MESSAGE_LENGTH = 500
	}
}

private fun ChatMessage.toResponse() = ChatMessageResponse(role = role, content = content, createdAt = createdAt)
