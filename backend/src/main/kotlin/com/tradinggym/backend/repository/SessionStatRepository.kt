package com.tradinggym.backend.repository

import com.tradinggym.backend.entity.SessionStat
import com.tradinggym.backend.entity.SessionStatKey
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface SessionStatRepository : JpaRepository<SessionStat, UUID> {
	fun findBySessionId(sessionId: UUID): List<SessionStat>
	fun findBySessionIdAndStatKey(sessionId: UUID, statKey: SessionStatKey): SessionStat?
}
