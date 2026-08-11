package com.tradinggym.backend.service.ai

import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(name = ["ai.provider"], havingValue = "codex-cli")
class CodexCliConversationAnalyzer : ConversationAnalyzer {

	private val log = LoggerFactory.getLogger(javaClass)

	override fun analyze(turns: List<ConversationTurnInput>): ConversationAnalysisResult {
		val prompt = ConversationAnalysisPrompt.build(turns)
		// 문항 6개 분량 프롬프트 + 구조화 출력이라 단일 채점 호출보다 오래 걸릴 수 있어 넉넉히 잡음.
		val output = CodexCli.run(prompt, timeoutSeconds = 90)
		if (output == null) {
			log.warn("codex exec 실패, 대체 채점으로 처리")
			return ConversationAnalysisPrompt.fallbackResult(turns)
		}
		return ConversationAnalysisPrompt.parse(output, turns.map { it.question.id }.toSet())
			?: ConversationAnalysisPrompt.fallbackResult(turns)
	}
}
