package com.tradinggym.backend.service.ai

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

// 기본 어댑터 — 실제 LLM API 키/CLI 없이도 온보딩이 항상 동작하도록 함.
@Component
@ConditionalOnProperty(name = ["ai.provider"], havingValue = "stub", matchIfMissing = true)
class StubConversationAnalyzer : ConversationAnalyzer {
	override fun analyze(turns: List<ConversationTurnInput>): ConversationAnalysisResult =
		ConversationAnalysisPrompt.fallbackResult(turns)
}
