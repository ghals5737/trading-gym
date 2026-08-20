package com.tradinggym.backend.dto

import com.tradinggym.backend.entity.SessionStatCategory
import com.tradinggym.backend.entity.SessionStatKey

// SessionSummaryResponse(턴별 매매 + reasonText 원문)를 통째로 AI에 넘겨서 받은 8개 지표
// 채점 결과 — 예전 BehaviorReportService(순수 규칙 계산)와 달리, reasonText까지 읽고
// 판단해야 하는 지표(충동매매/손실회피/확증편향)까지 전부 AI가 직접 채점함.
data class SessionStatScoreResponse(
	val statKey: SessionStatKey,
	val scorePct: Int,
	val note: String,
)

// 8개 세부 지표를 SessionStatCategoryMapper 매핑대로 묶어 평균 낸 3개 성향 점수 —
// note 없음(평균값이라 문장 근거가 없음, 근거는 세부 지표 쪽 note에서 확인).
data class SessionStatCategoryScoreResponse(
	val categoryKey: SessionStatCategory,
	val scorePct: Int,
)
