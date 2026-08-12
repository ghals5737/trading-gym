package com.tradinggym.backend.controller

import com.tradinggym.backend.dto.ChatMessageResponse
import com.tradinggym.backend.dto.SendChatMessageRequest
import com.tradinggym.backend.service.ChatService
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/chat")
class ChatController(private val chatService: ChatService) {

	@GetMapping("/messages")
	fun getHistory(authentication: Authentication): List<ChatMessageResponse> =
		chatService.getHistory(authentication.name)

	// 유저 메시지를 저장하고, 최근 대화 맥락과 함께 AI에 넘겨 받은 답변을 저장한 뒤 그 답변만 돌려줌
	// — 유저 메시지는 프론트가 이미 화면에 그려놨으니 다시 안 돌려줘도 됨.
	@PostMapping("/messages")
	fun sendMessage(authentication: Authentication, @RequestBody request: SendChatMessageRequest): ChatMessageResponse =
		chatService.sendMessage(authentication.name, request.text)
}
