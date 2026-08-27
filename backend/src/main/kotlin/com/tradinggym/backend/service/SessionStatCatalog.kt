package com.tradinggym.backend.service

import com.tradinggym.backend.entity.SessionStatKey

// 스탯 키 → 한국어 라벨 / RAG 검색어 매핑 — 오늘의 PT(QuizGenerationService)와
// 자료실 추천(LibraryService)이 같은 매핑을 써야 해서 한 곳으로 뺌.
object SessionStatCatalog {

	// /my "스탯" 탭(SESSION_STAT_LABELS)과 같은 한국어 라벨 — 프롬프트에 그대로 넣어서 씀.
	val LABEL = mapOf(
		SessionStatKey.JUDGMENT_ACCURACY to "판단 정확도",
		SessionStatKey.DISCLOSURE_CHECK_RATE to "공시 확인율",
		SessionStatKey.RISK_MANAGEMENT_SCORE to "리스크 관리",
		SessionStatKey.IMPULSIVE_TRADING to "충동매매 억제",
		SessionStatKey.LOSS_AVERSION to "손실 회피 대응",
		SessionStatKey.CONFIRMATION_BIAS to "확증편향 억제",
		SessionStatKey.DIVERSIFICATION to "분산투자",
		SessionStatKey.GAMBLING_SIGNAL to "도박성 신호 낮음",
	)

	// 각 지표를 RAG 검색어로 바꾸는 매핑 — SessionStatKey 자체는 영어 코드라 그대로 검색하면
	// 안 걸려서, 그 지표가 실제로 뜻하는 개념을 자연어 검색어로 풀어씀.
	val SEARCH_QUERY = mapOf(
		SessionStatKey.JUDGMENT_ACCURACY to "투자 판단을 정확하게 하는 방법",
		SessionStatKey.DISCLOSURE_CHECK_RATE to "매수 전 공시를 확인해야 하는 이유",
		SessionStatKey.RISK_MANAGEMENT_SCORE to "레버리지 신용거래 리스크 관리",
		SessionStatKey.IMPULSIVE_TRADING to "충동매매 뇌동매매 위험성",
		SessionStatKey.LOSS_AVERSION to "손실 회피 손절 기준",
		SessionStatKey.CONFIRMATION_BIAS to "확증편향 투자 판단",
		SessionStatKey.DIVERSIFICATION to "분산투자를 해야 하는 이유",
		SessionStatKey.GAMBLING_SIGNAL to "손실 후 베팅을 키우는 도박성 매매",
	)
}
