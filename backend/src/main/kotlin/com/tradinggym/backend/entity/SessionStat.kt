package com.tradinggym.backend.entity

// 매매 이력에서 룰 기반으로 자동 채점하던 session_stats/BehaviorReportService는 없앴음
// (reasonTag 제거로 3개 지표 근거가 사라졌고, 나머지도 8개뿐이라 너무 얇아서 — 나중에
// reason_text를 AI가 분석하게 되면 6개 카테고리로 다시 설계하기로 함). 이 enum만 남긴
// 이유는 scenarioquiz.ScenarioQuizOption.behaviorTag가 "약한 습관 축 타겟팅" 용도로
// 재사용 중이라서(채점용 아님) — session_stats 테이블 자체는 삭제됨.
enum class SessionStatKey {
	JUDGMENT_ACCURACY,
	DISCLOSURE_CHECK_RATE,
	RISK_MANAGEMENT_SCORE,
	IMPULSIVE_TRADING,
	LOSS_AVERSION,
	CONFIRMATION_BIAS,
	DIVERSIFICATION,
	GAMBLING_SIGNAL,
}
