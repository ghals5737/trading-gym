package com.tradinggym.backend.repository

import com.tradinggym.backend.entity.ChatMessage
import com.tradinggym.backend.entity.ChatRole
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface ChatMessageRepository : JpaRepository<ChatMessage, UUID> {
	fun findByUserIdOrderByCreatedAtAsc(userId: UUID): List<ChatMessage>
	fun findTop20ByUserIdAndRoleOrderByCreatedAtDesc(userId: UUID, role: ChatRole): List<ChatMessage>

	// ChatService가 AI에게 넘길 최근 대화 맥락(양쪽 역할 다 포함)을 가져올 때 씀 —
	// 위 메서드는 role 하나로 필터되니 이거랑 용도가 다름.
	fun findTop20ByUserIdOrderByCreatedAtDesc(userId: UUID): List<ChatMessage>
}
