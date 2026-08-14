package com.tradinggym.backend.service

import com.tradinggym.backend.dto.ChatMessageResponse
import com.tradinggym.backend.entity.ChatMessage
import com.tradinggym.backend.entity.ChatRole
import com.tradinggym.backend.repository.ChatMessageRepository
import com.tradinggym.backend.repository.UserJpaRepository
import com.tradinggym.backend.service.ai.ChatReplyGenerator
import com.tradinggym.backend.service.ai.ChatTurn
import com.tradinggym.backend.service.ai.SearchQueryRewriter
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
	private val educationSearchClient: EducationSearchClient,
	private val searchQueryRewriter: SearchQueryRewriter,
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

		// "그거 왜 위험한데?"처럼 대명사로만 된 메시지는 그대로 검색하면 헛돌아서, 대화 맥락을
		// 참고해 독립적인 검색어로 먼저 바꿈(실패하면 원문 그대로 — SearchQueryRewritePrompt.fallback).
		val searchQuery = searchQueryRewriter.rewrite(recentHistory, text)
		// edu-rag-indexer가 죽어있거나 관련 자료가 없으면 빈 리스트가 오고, 그럼 근거 없이
		// 평소처럼 답함(EducationSearchClient가 흡수함).
		val ragContext = educationSearchClient.search(searchQuery)
		val replyText = chatReplyGenerator.reply(recentHistory, text, ragContext)
		// 출처 표기는 LLM 판단에 안 맡기고(생략할 때가 있음) 실제로 검색에 쓰인 자료 목록으로
		// 여기서 확정적으로 붙임 — 답변 내용이 아니라 "이 답변이 참고한 근거가 있는지"를
		// 항상 같은 형식으로 보여주기 위함.
		val fullReplyText = replyText + buildSourceFootnote(ragContext)
		val botMessage = chatMessageRepository.save(ChatMessage(user = user, role = ChatRole.ASSISTANT, content = fullReplyText))

		return botMessage.toResponse()
	}

	private fun requireUser(username: String) =
		userJpaRepository.findByUsername(username)
			?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "사용자를 찾을 수 없습니다")

	// 같은 문서에서 나온 청크(페이지만 다름)는 한 줄로 묶어서 보여줌 — 안 그러면 같은 자료가
	// "134쪽", "134-135쪽"처럼 여러 줄로 중복 표시됨(레버리지 질의에서 실제로 겪은 케이스).
	private fun buildSourceFootnote(ragContext: List<EducationSearchResult>): String {
		if (ragContext.isEmpty()) return ""
		val lines = ragContext
			.groupBy { it.orgName to it.title }
			.entries
			.joinToString("\n") { (key, items) ->
				val (org, title) = key
				val pages = items
					.mapNotNull { r -> r.pageStart?.let { start -> if (start == r.pageEnd) "${start}쪽" else "${start}-${r.pageEnd}쪽" } }
					.distinct()
					.joinToString(", ")
				"· ${org ?: "출처 미상"} 「$title」${if (pages.isNotBlank()) " $pages" else ""}"
			}
		return "\n\n📚 참고 자료\n$lines"
	}

	companion object {
		private const val MAX_MESSAGE_LENGTH = 500
	}
}

private fun ChatMessage.toResponse() = ChatMessageResponse(role = role, content = content, createdAt = createdAt)
