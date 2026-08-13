package com.tradinggym.backend.service.ai

import com.tradinggym.backend.entity.ChatRole

// 다섯 어댑터(ChatReplyGenerator 구현체)가 공유하는 프롬프트 조립 + 대체 답변.
object ChatReplyPrompt {

	fun build(history: List<ChatTurn>, newMessage: String): String {
		val transcript = history.joinToString("\n") {
			"${if (it.role == ChatRole.USER) "사용자" else "KnowerBot"}: ${it.content}"
		}

		return """
			너는 '트레이딩 짐'이라는 모의투자 교육 서비스의 AI 코치 캐릭터 'KnowerBot'이야.
			사용자와 채팅으로 자유롭게 대화 중이야. 투자·리스크 관리·이 서비스 사용법 질문이면
			최대한 도움이 되게 답하고, 그 외의 잡담이어도 자연스럽게 받아주면 돼.
			존댓말로, 친근하지만 전문적인 톤으로, 1~3문장 정도로 짧게 답해.

			${if (transcript.isNotBlank()) "지금까지 대화:\n$transcript\n" else ""}
			사용자: $newMessage

			KnowerBot 답변만 출력해(다른 말이나 따옴표 절대 덧붙이지 마):
		""".trimIndent()
	}

	fun fallbackReply(): String = "지금은 생각을 정리하지 못했어요. 조금 있다가 다시 말해주실래요?"

	// 모델이 지시를 완벽히 안 따라서 "KnowerBot: " 접두사나 양끝 따옴표를 붙이는 경우가
	// 있어서 관대하게 벗겨냄. 너무 길면(폭주 응답) 잘라서 채팅창이 안 깨지게 함.
	fun parse(rawResponse: String): String {
		var text = rawResponse.trim()
		text = text.removePrefix("KnowerBot:").removePrefix("knowerbot:").trim()
		if (text.length >= 2 && text.first() in "\"'" && text.last() in "\"'") {
			text = text.substring(1, text.length - 1).trim()
		}
		return text.take(MAX_REPLY_LENGTH).ifBlank { fallbackReply() }
	}

	private const val MAX_REPLY_LENGTH = 400
}
