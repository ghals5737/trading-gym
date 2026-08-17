package com.tradinggym.backend.dto

import java.math.BigDecimal

// 완료된 세션들 중 유저별 최대 수익률로 줄 세운 랭킹 한 줄 — 진행 중 세션은 아직
// 확정 전이라 집계에서 제외됨.
data class RankingEntryResponse(
	val rank: Int,
	val username: String,
	val returnPct: BigDecimal,
	val isMe: Boolean,
)
