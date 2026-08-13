package com.tradinggym.backend.service.ai

import com.tradinggym.backend.dto.SessionStatScoreResponse
import com.tradinggym.backend.dto.SessionSummaryResponse
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(name = ["ai.provider"], havingValue = "codex-cli")
class CodexCliSessionStatAnalyzer : SessionStatAnalyzer {

	private val log = LoggerFactory.getLogger(javaClass)

	override fun analyze(summary: SessionSummaryResponse): List<SessionStatScoreResponse> {
		val prompt = SessionStatAnalysisPrompt.build(summary)
		// 턴 전체 + 8개 지표 채점이라 단일 채팅 답변보다 오래 걸릴 수 있어 넉넉히 잡음.
		val output = CodexCli.run(prompt, timeoutSeconds = 90)
		if (output == null) {
			log.warn("codex exec 실패, 대체 채점으로 처리")
			return SessionStatAnalysisPrompt.fallbackResult(summary)
		}
		return SessionStatAnalysisPrompt.parse(output) ?: SessionStatAnalysisPrompt.fallbackResult(summary)
	}
}
