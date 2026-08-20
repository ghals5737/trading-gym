package com.tradinggym.backend.dto

import java.math.BigDecimal

// 신용매수 시도 시 담보비율이 위험 수준까지 떨어지면(SimulationController 호출 시점에 프론트가
// 이미 계산해서 넘김) AI가 그 자리에서 경고 메시지를 만듦 — 유저가 KnowerBot 채팅으로 이미
// 답했던 매매 이유(reasonText)까지 참고해서 "그 이유가 지금 위험을 정당화하는지"까지 짚어주는
// 게 기존 고정 문구 대비 차별점. DB에 저장 안 함(그 순간 한 번 보여주고 끝나는 일회성 메시지).
data class RiskWarningRequest(
	val stockName: String,
	val quantity: Int,
	val leverageRatio: BigDecimal,
	val expectedCollateralRatioPct: BigDecimal,
	val liquidationThresholdPct: BigDecimal,
	val reasonText: String,
	val diagnosisWarning: String?,
)

data class RiskWarningResponse(
	val message: String,
)
