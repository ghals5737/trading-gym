package com.tradinggym.backend.service.ai

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

// 기본 어댑터 — 실제 LLM API 키/CLI 없이도 채팅이 항상 동작하도록 함. 예전에 프론트(vanilla-JS
// knowerbot-runtime.js)에 있던 mockAiReply의 키워드 규칙을 그대로 서버로 옮겨옴.
@Component
@ConditionalOnProperty(name = ["ai.provider"], havingValue = "stub", matchIfMissing = true)
class StubChatReplyGenerator : ChatReplyGenerator {
	override fun reply(history: List<ChatTurn>, newMessage: String): String = when {
		Regex("위험|리스크|손실|레버리지").containsMatchIn(newMessage) ->
			"좋아요. 지금은 레버리지 비중과 손절 기준을 먼저 확인하는 흐름으로 볼게요."
		else -> "좋아요. 지금 화면을 기준으로 같이 확인해볼게요."
	}
}
