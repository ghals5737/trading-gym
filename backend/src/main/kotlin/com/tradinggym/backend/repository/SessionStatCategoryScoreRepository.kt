package com.tradinggym.backend.repository

import com.tradinggym.backend.entity.SessionStatCategoryScore
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface SessionStatCategoryScoreRepository : JpaRepository<SessionStatCategoryScore, UUID> {
	fun findBySessionIdOrderByCategoryKeyAsc(sessionId: UUID): List<SessionStatCategoryScore>

	fun findBySession_User_UsernameOrderByComputedAtAsc(username: String): List<SessionStatCategoryScore>
}
