package com.tradinggym.backend.service

import com.tradinggym.backend.entity.SessionStatCategory
import com.tradinggym.backend.entity.SessionStatKey
import kotlin.math.roundToInt

// 8개 세부 지표(SessionStatKey)를 3개 성향 카테고리로 묶는 고정 매핑.
// 병합 결정(2026-08-25): 지표 하나는 축 하나에만 — GAMBLING_SIGNAL을 침착성에만 둔다.
// 예전 안(침착성+공격성 양쪽)은 같은 지표가 두 축을 동시에 움직여서 "침착성이 오르면
// 공격성이 자동으로 내려가는" 연동이 생겨 세 축의 독립성이 깨졌음.
// 이 매핑은 StatCategoryCatalog(마이페이지 개요·온보딩 초기 스탯)와 반드시 같아야 함.
//
// invert 주의: 8개 세부 지표는 전부 "값이 높을수록 바람직한 투자 습관" 방향으로 통일돼
// 있음(SessionStatAnalysisPrompt 참고) — 즉 RISK_MANAGEMENT_SCORE/DIVERSIFICATION/
// GAMBLING_SIGNAL은 높을수록 "안전하다"는 뜻. 이걸 그대로 평균 내서 "공격성"이라고
// 부르면 의미가 거꾸로 됨(점수가 높을수록 안전한데 이름은 공격성이 높다고 읽힘) — 그래서
// 공격성 카테고리에 들어가는 지표는 (100 - score)로 뒤집어서, "높을수록 실제로 더
// 공격적으로 거래했다"는 뜻이 되게 함. 정확성/침착성은 세부 지표 방향이 카테고리 이름과
// 이미 일치해서 뒤집지 않음.
private data class CategoryComponent(val key: SessionStatKey, val invert: Boolean)

object SessionStatCategoryMapper {
	private val COMPONENTS_BY_CATEGORY: Map<SessionStatCategory, List<CategoryComponent>> = mapOf(
		SessionStatCategory.ACCURACY to listOf(
			CategoryComponent(SessionStatKey.JUDGMENT_ACCURACY, invert = false),
			CategoryComponent(SessionStatKey.DISCLOSURE_CHECK_RATE, invert = false),
			CategoryComponent(SessionStatKey.CONFIRMATION_BIAS, invert = false),
		),
		SessionStatCategory.COMPOSURE to listOf(
			CategoryComponent(SessionStatKey.LOSS_AVERSION, invert = false),
			CategoryComponent(SessionStatKey.IMPULSIVE_TRADING, invert = false),
			CategoryComponent(SessionStatKey.GAMBLING_SIGNAL, invert = false),
		),
		SessionStatCategory.AGGRESSIVENESS to listOf(
			CategoryComponent(SessionStatKey.RISK_MANAGEMENT_SCORE, invert = true),
			CategoryComponent(SessionStatKey.DIVERSIFICATION, invert = true),
		),
	)

	val KEYS_BY_CATEGORY: Map<SessionStatCategory, List<SessionStatKey>> =
		COMPONENTS_BY_CATEGORY.mapValues { (_, components) -> components.map { it.key } }

	fun computeCategoryScores(scorePctByKey: Map<SessionStatKey, Int>): Map<SessionStatCategory, Int> =
		COMPONENTS_BY_CATEGORY.mapValues { (_, components) ->
			components.mapNotNull { component ->
				scorePctByKey[component.key]?.let { score -> if (component.invert) 100 - score else score }
			}.average().roundToInt()
		}
}
