package com.tradinggym.backend.service

import com.tradinggym.backend.entity.SessionStatKey

// 8개 세부 지표를 3개 대분류(정확성/침착성/공격성)로 묶는 매핑 — 회의 결정.
// Pompian(2006)의 인지·감정 2분류에 위험행동 축을 더해 자체 구성한 체계.
enum class StatCategory { ACCURACY, COMPOSURE, AGGRESSIVENESS }

object StatCategoryCatalog {

	data class CategoryDef(
		val category: StatCategory,
		val label: String,
		val description: String,
		val memberKeys: List<SessionStatKey>,
		// true면 구성 지표를 (100-점수)로 뒤집어 평균 — 공격성은 "안전할수록 높은" 지표들의
		// 역방향이라 뒤집어야 "높을수록 공격적"이 됨.
		val reversed: Boolean,
		// 정확성·침착성은 높을수록 좋음(higherIsBetter=true). 공격성은 좋고 나쁨이 아니라
		// "성향"이라 프론트가 중립 색으로 그리게 구분함.
		val higherIsBetter: Boolean,
	)

	// GAMBLING_SIGNAL은 침착성에만 넣음 — 예전 안(침착성+공격성 양쪽)은 같은 지표가 두 축을
	// 동시에 움직여서(침착성↑ = 공격성↓ 자동 연동) 세 축이 독립적으로 안 움직이는 문제가 있었음.
	val DEFINITIONS = listOf(
		CategoryDef(
			StatCategory.ACCURACY,
			"정확성",
			"근거를 확인하고 판단하는 힘 — 판단 정확도·공시 확인·확증편향 억제",
			listOf(SessionStatKey.JUDGMENT_ACCURACY, SessionStatKey.DISCLOSURE_CHECK_RATE, SessionStatKey.CONFIRMATION_BIAS),
			reversed = false,
			higherIsBetter = true,
		),
		CategoryDef(
			StatCategory.COMPOSURE,
			"침착성",
			"감정에 휘둘리지 않는 힘 — 충동매매·손실 회피·도박성 베팅 억제",
			listOf(SessionStatKey.IMPULSIVE_TRADING, SessionStatKey.LOSS_AVERSION, SessionStatKey.GAMBLING_SIGNAL),
			reversed = false,
			higherIsBetter = true,
		),
		CategoryDef(
			StatCategory.AGGRESSIVENESS,
			"공격성",
			"위험을 크게 잡는 스타일 — 레버리지·집중투자 성향 (좋고 나쁨이 아니라 성향이에요)",
			listOf(SessionStatKey.RISK_MANAGEMENT_SCORE, SessionStatKey.DIVERSIFICATION),
			reversed = true,
			higherIsBetter = false,
		),
	)
}
