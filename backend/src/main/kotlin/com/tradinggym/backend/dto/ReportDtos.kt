package com.tradinggym.backend.dto

import com.tradinggym.backend.entity.SessionStatKey
import com.tradinggym.backend.entity.StatTone
import java.util.UUID

data class SessionStatResponse(
	val statKey: SessionStatKey,
	val scorePct: Int,
	val tone: StatTone,
	val note: String?,
)

// diagnosisComparison은 온보딩(investor_profiles)을 아직 안 했으면 null — "진단부터 해주세요" 안내는 프론트에서.
data class SessionReportResponse(
	val sessionId: UUID,
	val stats: List<SessionStatResponse>,
	val diagnosisComparison: String?,
)
