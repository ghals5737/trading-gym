package com.tradinggym.backend.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.FetchType
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

enum class ChatRole { USER, ASSISTANT }

// 전 라우트에 떠 있는 전역 KnowerBot 위젯이라 세션에 안 묶고 유저 단위로만 기록.
@Entity
@Table(name = "chat_messages")
class ChatMessage(
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "user_id", nullable = false)
	var user: UserEntity,

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	var role: ChatRole,

	@Column(columnDefinition = "text", nullable = false)
	var content: String,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	@Column(name = "created_at", nullable = false, updatable = false)
	var createdAt: Instant = Instant.now()
}
