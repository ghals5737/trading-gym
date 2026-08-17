package com.tradinggym.backend.dto

import com.tradinggym.backend.entity.SessionStatKey

data class ProductTourStatusResponse(
	val seen: Boolean,
)

// session_stats를 유저 단위로 묶어 지표(stat_key)별로 평균 낸 값 — 지금은 모의투자
// 세션들만 소스지만, 나중에 상황퀴즈·자료 열람 스탯이 생기면 AggregateStatService
// 안에서 소스만 추가하면 됨(전용 캐시 테이블 없이 매 요청마다 라이브로 계산).
data class AggregateStatResponse(
	val statKey: SessionStatKey,
	val avgScorePct: Int,
	val sessionCount: Int,
)
