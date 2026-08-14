package com.tradinggym.backend.service.ai

import com.tradinggym.backend.service.EducationSearchResult
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(name = ["ai.provider"], havingValue = "codex-cli")
class CodexCliChatReplyGenerator : ChatReplyGenerator {

	private val log = LoggerFactory.getLogger(javaClass)

	override fun reply(history: List<ChatTurn>, newMessage: String, ragContext: List<EducationSearchResult>): String {
		val prompt = ChatReplyPrompt.build(history, newMessage, ragContext)
		val output = CodexCli.run(prompt, timeoutSeconds = 45)
		if (output == null) {
			log.warn("codex exec 실패, 대체 답변으로 처리")
			return ChatReplyPrompt.fallbackReply()
		}
		return ChatReplyPrompt.parse(output)
	}
}
