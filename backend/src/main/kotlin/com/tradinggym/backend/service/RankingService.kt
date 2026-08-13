package com.tradinggym.backend.service

import com.tradinggym.backend.dto.RankingEntryResponse
import com.tradinggym.backend.entity.SimulationSessionStatus
import com.tradinggym.backend.repository.SimulationSessionRepository
import com.tradinggym.backend.repository.TurnLogRepository
import org.springframework.stereotype.Service
import java.math.BigDecimal
import java.math.RoundingMode

// 랭킹은 일단 수익률 하나만 씀(반대매매·레버리지 반영한 "안정적 운용" 랭킹은 나중 과제) —
// 종료된 세션의 최종 portfolioValue로 계산한 수익률 중, 유저별 최고 기록으로 줄 세움.
@Service
class RankingService(
	private val sessionRepository: SimulationSessionRepository,
	private val turnLogRepository: TurnLogRepository,
) {

	fun getReturnRateRanking(username: String, limit: Int = 10): List<RankingEntryResponse> {
		val bestPctByUsername = mutableMapOf<String, BigDecimal>()
		for (session in sessionRepository.findByStatus(SimulationSessionStatus.COMPLETED)) {
			val lastLog = turnLogRepository.findTop1BySessionIdOrderByTurnNumberDesc(requireNotNull(session.id)) ?: continue
			val returnPct = lastLog.portfolioValue
				.subtract(session.startingCash)
				.divide(session.startingCash, 4, RoundingMode.HALF_UP)
				.multiply(BigDecimal(100))
			val owner = session.user.username
			val current = bestPctByUsername[owner]
			if (current == null || returnPct > current) bestPctByUsername[owner] = returnPct
		}

		val ranked = bestPctByUsername.entries
			.sortedByDescending { it.value }
			.mapIndexed { i, entry -> RankingEntryResponse(rank = i + 1, username = entry.key, returnPct = entry.value, isMe = entry.key == username) }

		val top = ranked.take(limit)
		// 본인이 top 안에 없고 랭킹엔 있으면(즉 완료 세션이 있으면) 맨 아래 자기 순위를 덧붙임 —
		// 완료 세션이 아예 없는 사람은 애초에 ranked에 없으니 그냥 top만 돌아감.
		return if (top.any { it.isMe } || ranked.none { it.isMe }) top else top + ranked.first { it.isMe }
	}
}
