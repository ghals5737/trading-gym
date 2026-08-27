package com.tradinggym.backend.service.ai

import org.slf4j.LoggerFactory
import java.io.File
import java.util.concurrent.TimeUnit

// codex CLI(ChatGPT 로그인 기반 — API 과금과 무관)를 서브프로세스로 호출하는 공용 헬퍼.
// --output-last-message로 배너/로그 노이즈 없이 최종 응답만 파일로 받음.
// --sandbox read-only는 필수 — 사용자 자유 텍스트가 프롬프트에 그대로 들어가는
// headless 호출이라, 무슨 내용이 들어오든 파일시스템에 손 못 대게 막아둠.
object CodexCli {
	private val log = LoggerFactory.getLogger(javaClass)

	fun run(prompt: String, timeoutSeconds: Long = 45): String? {
		val outputFile = File.createTempFile("codex-onboarding-", ".txt")
		return try {
			val builder = ProcessBuilder(
				"codex", "exec",
				"--skip-git-repo-check",
				"--sandbox", "read-only",
				"--output-last-message", outputFile.absolutePath,
				prompt,
			)
				// ProcessBuilder의 기본 stdin은 열려있는 파이프라 EOF가 안 옴 — codex exec가
				// "Reading additional input from stdin..."에서 영원히 블로킹함. /dev/null로
				// 즉시 EOF를 줘야 함(직접 셸에서 실행할 땐 터미널 stdin이 바로 EOF라 안 드러났던 버그).
				.redirectInput(File("/dev/null"))
				.redirectErrorStream(true)
			// 백엔드를 실행한 셸이 (지금은 닫힌) cmux 세션이 남긴 죽은 NODE_OPTIONS를 물려받고
			// 있으면 codex가 즉시 MODULE_NOT_FOUND로 죽음 — codex는 Node.js 기반이라 이 값을
			// 서브프로세스 환경에서 지워야 함(edu-rag-indexer/articlegen.py에서 겪은 것과 동일한 버그).
			builder.environment().remove("NODE_OPTIONS")
			val process = builder.start()
			val finished = process.waitFor(timeoutSeconds, TimeUnit.SECONDS)
			if (!finished) {
				process.destroyForcibly()
				log.warn("codex exec 타임아웃(${timeoutSeconds}초)")
				return null
			}
			if (process.exitValue() != 0) {
				log.warn("codex exec 종료 코드 ${process.exitValue()}")
				return null
			}
			outputFile.readText().trim().takeIf { it.isNotBlank() }
		} catch (e: Exception) {
			log.warn("codex exec 실행 실패: ${e.message}")
			null
		} finally {
			outputFile.delete()
		}
	}
}
