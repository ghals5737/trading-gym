package com.tradinggym.backend.chat

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface ChatMessageRepository : JpaRepository<ChatMessage, UUID> {
	fun findByUserIdOrderByCreatedAtAsc(userId: UUID): List<ChatMessage>
	fun findTop20ByUserIdAndRoleOrderByCreatedAtDesc(userId: UUID, role: ChatRole): List<ChatMessage>
}
