package com.tradinggym.backend.repository

import com.tradinggym.backend.entity.SessionStat
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface SessionStatRepository : JpaRepository<SessionStat, UUID> {
	fun findBySessionIdOrderByStatKeyAsc(sessionId: UUID): List<SessionStat>

	// 유저 단위로 시간순으로 모아서 지표별 성장 추이를 보여줄 때 씀(예: 충동매매 억제
	// 점수가 세션을 거듭할수록 어떻게 바뀌는지).
	fun findBySession_User_UsernameOrderByComputedAtAsc(username: String): List<SessionStat>
}
