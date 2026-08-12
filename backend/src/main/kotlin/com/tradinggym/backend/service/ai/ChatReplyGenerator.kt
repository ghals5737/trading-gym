package com.tradinggym.backend.service.ai

import com.tradinggym.backend.chat.ChatRole

// KnowerBot 채팅창의 자유 대화 한 턴 — ChatMessage 엔티티를 그대로 안 쓰고 이걸로 감싸서
// 어댑터가 DB 엔티티에 의존하지 않게 함(다른 AI 어댑터들과 같은 원칙).
data class ChatTurn(val role: ChatRole, val content: String)

// 어댑터 인터페이스 — ConversationAnalyzer와 같은 방식(ai.provider로 구현체 하나만 선택)이지만
// 역할이 다름: 이건 채점이 아니라 자유 대화 답변 생성.
interface ChatReplyGenerator {
	fun reply(history: List<ChatTurn>, newMessage: String): String
}
