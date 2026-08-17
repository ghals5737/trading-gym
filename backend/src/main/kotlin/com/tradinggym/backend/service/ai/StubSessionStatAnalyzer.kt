package com.tradinggym.backend.service.ai

import com.tradinggym.backend.dto.SessionStatScoreResponse
import com.tradinggym.backend.dto.SessionSummaryResponse
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

// 기본 어댑터 — 실제 LLM API 키/CLI 없이도 항상 동작하도록 함.
@Component
@ConditionalOnProperty(name = ["ai.provider"], havingValue = "stub", matchIfMissing = true)
class StubSessionStatAnalyzer : SessionStatAnalyzer {
	override fun analyze(summary: SessionSummaryResponse): List<SessionStatScoreResponse> =
		SessionStatAnalysisPrompt.fallbackResult(summary)
}
