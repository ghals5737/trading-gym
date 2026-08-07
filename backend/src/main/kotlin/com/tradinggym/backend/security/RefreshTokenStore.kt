package com.tradinggym.backend.security

import org.springframework.stereotype.Component
import java.util.concurrent.ConcurrentHashMap

/**
 * In-memory refresh-token registry. Each token is single-use: [consume] removes it,
 * so a successful /refresh call rotates to a new refresh token and the old one can't be replayed.
 * Not persisted across restarts — fine for the current mock-data stage of the project.
 */
@Component
class RefreshTokenStore {

	private val tokensByUsername = ConcurrentHashMap<String, String>()

	fun store(token: String, username: String) {
		tokensByUsername[token] = username
	}

	fun consume(token: String): String? = tokensByUsername.remove(token)

	fun revokeAllFor(username: String) {
		tokensByUsername.entries.removeIf { it.value == username }
	}
}
