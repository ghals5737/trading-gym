package com.tradinggym.backend.service.ai

import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(name = ["ai.provider"], havingValue = "codex-cli")
class CodexCliQuizGenerator : QuizGenerator {

	private val log = LoggerFactory.getLogger(javaClass)

	override fun generate(input: QuizGenerationInput): GeneratedQuiz? {
		val prompt = QuizGenerationPrompt.build(input)
		val output = CodexCli.run(prompt, timeoutSeconds = 45)
		if (output == null) {
			log.warn("codex exec 퀴즈 생성 실패")
			return null
		}
		return QuizGenerationPrompt.parse(output)
	}
}
