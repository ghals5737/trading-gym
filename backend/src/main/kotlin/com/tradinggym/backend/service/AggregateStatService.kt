package com.tradinggym.backend.service

import com.tradinggym.backend.dto.AggregateStatResponse
import com.tradinggym.backend.repository.SessionStatRepository
import org.springframework.stereotype.Service
import kotlin.math.roundToInt

@Service
class AggregateStatService(private val sessionStatRepository: SessionStatRepository) {

	// 지금은 session_stats(모의투자)만 소스임 — 나중에 상황퀴즈·자료 열람 스탯이 생기면
	// 여기서 그 레포지토리들 조회 결과를 소스로 더 합치면 됨(전용 캐시 테이블 없이
	// 매 요청마다 라이브로 계산하는 방식 유지).
	fun getMyAggregateStats(username: String): List<AggregateStatResponse> =
		sessionStatRepository.findBySession_User_UsernameOrderByComputedAtAsc(username)
			.groupBy { it.statKey }
			.map { (statKey, stats) ->
				AggregateStatResponse(
					statKey = statKey,
					avgScorePct = stats.map { it.scorePct }.average().roundToInt(),
					sessionCount = stats.size,
				)
			}
}
