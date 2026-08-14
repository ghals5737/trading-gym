package com.tradinggym.backend.service.ai

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

// 기본 어댑터 — 재작성 없이 원본 메시지를 그대로 검색어로 씀(rewriter 도입 이전 동작과 동일).
@Component
@ConditionalOnProperty(name = ["ai.provider"], havingValue = "stub", matchIfMissing = true)
class StubSearchQueryRewriter : SearchQueryRewriter {
	override fun rewrite(history: List<ChatTurn>, newMessage: String): String = newMessage
}
