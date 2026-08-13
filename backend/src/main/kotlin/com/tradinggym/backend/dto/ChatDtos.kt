package com.tradinggym.backend.dto

import com.tradinggym.backend.entity.ChatRole
import java.time.Instant

data class SendChatMessageRequest(
	val text: String,
)

data class ChatMessageResponse(
	val role: ChatRole,
	val content: String,
	val createdAt: Instant,
)
