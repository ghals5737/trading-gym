package com.tradinggym.backend.service.ai

import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(name = ["ai.provider"], havingValue = "codex-cli")
class CodexCliSearchQueryRewriter : SearchQueryRewriter {

	private val log = LoggerFactory.getLogger(javaClass)

	override fun rewrite(history: List<ChatTurn>, newMessage: String): String {
		val prompt = SearchQueryRewritePrompt.build(history, newMessage)
		val output = CodexCli.run(prompt, timeoutSeconds = 20)
		if (output == null) {
			log.warn("codex exec 검색어 재작성 실패, 원문 그대로 검색")
			return SearchQueryRewritePrompt.fallback(newMessage)
		}
		return SearchQueryRewritePrompt.parse(output, newMessage)
	}
}
