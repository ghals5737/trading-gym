package com.tradinggym.backend.service.ai

import com.tradinggym.backend.dto.RiskWarningRequest
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(name = ["ai.provider"], havingValue = "codex-cli")
class CodexCliRiskWarningGenerator : RiskWarningGenerator {

	private val log = LoggerFactory.getLogger(javaClass)

	override fun generate(request: RiskWarningRequest): String {
		val prompt = RiskWarningPrompt.build(request)
		val output = CodexCli.run(prompt, timeoutSeconds = 45)
		if (output == null) {
			log.warn("codex exec 실패, 대체 경고 문구로 처리")
			return RiskWarningPrompt.fallbackMessage(request)
		}
		return RiskWarningPrompt.parse(output, request)
	}
}
