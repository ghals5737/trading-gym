package com.tradinggym.backend.dto

import com.tradinggym.backend.entity.AgeBand
import com.tradinggym.backend.entity.InvestorProfileType
import com.tradinggym.backend.entity.SessionStatCategory
import com.tradinggym.backend.entity.SessionStatKey

data class ProductTourStatusResponse(
	val seen: Boolean,
)

// session_stats를 유저 단위로 묶어 지표(stat_key)별로 평균 낸 값 — 지금은 모의투자
// 세션들만 소스지만, 나중에 상황퀴즈·자료 열람 스탯이 생기면 AggregateStatService
// 안에서 소스만 추가하면 됨(전용 캐시 테이블 없이 매 요청마다 라이브로 계산).
data class AggregateStatResponse(
	val statKey: SessionStatKey,
	val avgScorePct: Int, // 모의고사 채점 + 퀴즈 결과를 합친 평균
	val sessionCount: Int, // 이 지표가 채점된 모의고사 세션 수
	val quizCount: Int, // 이 지표를 겨냥한 퀴즈 중 답을 제출한 개수
	val latestNote: String, // 가장 최근 채점의 판단근거(AI가 쓴 한 문장) — 마이페이지 스탯 탭에 노출
)

// 마이페이지 스탯 탭 상단 — 8개 세부 지표를 3개 대분류(정확성/침착성/공격성)로 묶은 개요.
data class StatCategoryScoreResponse(
	val category: String, // ACCURACY | COMPOSURE | AGGRESSIVENESS
	val label: String,
	val scorePct: Int,
	val description: String,
	val higherIsBetter: Boolean, // false(공격성)면 좋고 나쁨이 아니라 "성향" — 프론트가 중립 색으로 그림
	// 이 카테고리 점수를 만든 세부 지표들 — 리포트에서 "3개 성향 = 8개 지표"라는 구성을
	// 화면으로 보여주려면 프론트가 매핑을 알아야 한다. 매핑을 프론트에 복사해두면
	// StatCategoryCatalog와 어긋날 수 있어서 서버가 같이 내려준다.
	//
	// 기본값이 빈 목록인 이유: 온보딩 설문으로 만드는 초기 스탯(OnboardingService)은
	// 8개 행동 지표가 아니라 설문 문항에서 나오므로 구성 지표가 없다.
	val memberKeys: List<SessionStatKey> = emptyList(),
	// 공격성처럼 (100 - 점수)로 뒤집어 평균 낸 카테고리인지 — 세부 지표 점수와 카테고리
	// 점수가 반대 방향이라 화면에서 설명이 필요하다.
	val reversed: Boolean = false,
)

data class StatOverviewResponse(
	val summaryText: String, // 카테고리 점수 기반 한 줄 요약
	val categories: List<StatCategoryScoreResponse>,
	val stats: List<AggregateStatResponse>,
)

data class AgeBandResponse(
	val ageBand: AgeBand?,
)

data class UpdateAgeBandRequest(
	val ageBand: AgeBand,
)

// "내 또래 대비 투자성향" — 같은 나이대 사용자들의 온보딩 리스크 점수(riskTotalScore)
// 평균과 내 점수를 비교. 행동 스탯이 아니라 온보딩 진단 기준인 이유: 또래 전원이 모의투자를
// 완료했다는 보장이 없어서, 표본이 가장 넓은 사전조사 점수를 비교 기준으로 삼음.
data class PeerComparisonResponse(
	val ageBand: AgeBand,
	val myRiskScore: Int,
	val myProfileType: InvestorProfileType,
	val peerAvgRiskScore: Double,
	val peerCount: Int, // 나를 뺀 같은 나이대 진단 완료자 수
	val comparisonText: String, // "내 또래에 비해 공격성이 높아요" 류의 한 문장
)

// session_stat_categories를 유저 단위로 묶어 카테고리별로 평균 낸 값 — AggregateStatResponse의
// 3개 성향 카테고리 버전.
data class AggregateStatCategoryResponse(
	val categoryKey: SessionStatCategory,
	val avgScorePct: Int,
	val sessionCount: Int,
)
