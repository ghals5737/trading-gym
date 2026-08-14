package com.tradinggym.backend.service.ai

import com.tradinggym.backend.entity.ChatRole

// 다섯 어댑터가 공유하는 프롬프트 조립 + 파싱 + 대체값.
object SearchQueryRewritePrompt {

	fun build(history: List<ChatTurn>, newMessage: String): String {
		// 검색어 판단에 도움 되는 최근 대화 몇 턴만 — 너무 길게 주면 오히려 엉뚱한 과거 주제로 끌려감.
		val recent = history.takeLast(6)
		val transcript = recent.joinToString("\n") {
			"${if (it.role == ChatRole.USER) "사용자" else "KnowerBot"}: ${it.content}"
		}

		return """
			너는 채팅 메시지를 지식베이스 검색용 검색어로 바꾸는 역할이야. 아래 규칙을 따라:
			- "그거", "저거", "그럼" 같은 대명사·접속사는 대화 맥락에서 실제로 가리키는 대상으로 바꿔써.
			- 인사말, 감탄사, 잡담 표현은 빼고 핵심 주제만 남겨.
			- 검색어는 5~20자 정도의 명사구로. 문장으로 쓰지 마.
			- 대화 내용과 무관한 잡담·인사면 원래 메시지를 거의 그대로 짧게 반환해도 돼.
			- 검색어만 출력해(설명·따옴표·번호 절대 붙이지 마).

			${if (transcript.isNotBlank()) "최근 대화:\n$transcript\n" else ""}
			방금 메시지: $newMessage

			검색어:
		""".trimIndent()
	}

	// 실패하거나 응답이 이상하면 원래 메시지를 그대로 검색어로 씀 — 재작성 이전 동작으로 안전하게 폴백.
	fun fallback(newMessage: String): String = newMessage

	fun parse(rawResponse: String, newMessage: String): String {
		var text = rawResponse.trim().lines().firstOrNull { it.isNotBlank() }?.trim() ?: ""
		text = text.removePrefix("검색어:").trim()
		if (text.length >= 2 && text.first() in "\"'" && text.last() in "\"'") {
			text = text.substring(1, text.length - 1).trim()
		}
		if (text.isBlank() || text.length > MAX_QUERY_LENGTH) return fallback(newMessage)
		return text
	}

	private const val MAX_QUERY_LENGTH = 60
}
