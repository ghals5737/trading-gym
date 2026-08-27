package com.tradinggym.backend.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.LocalDate
import java.util.UUID

// DART(전자공시시스템) 공시를 사람이 읽기 좋게 요약해 둔 고정 데이터
// (seed-data/stock_disclosures.csv) — 실제 있었던 그 종목의 공시를 손으로 골라 요약함.
// StockNews와 같은 이유로 실시간 API 대신 이 방식(데모 당일 API 장애와 무관, 과거 날짜 재현 가능).
// 뉴스와 달리 공시는 "가장 최근 것"이 계속 유효한 정보라서(분기보고서 등) lookback 제한 없이
// currentTurnDate 이전 최신 몇 건을 보여준다.
@Entity
@Table(name = "stock_disclosures")
class StockDisclosure(
	@Column(name = "stock_code", nullable = false)
	var stockCode: String,

	@Column(name = "disclosed_date", nullable = false)
	var disclosedDate: LocalDate,

	// 공시 제목 — DART 원문 제목을 거의 그대로 (예: "분기보고서 (2025.09)")
	@Column(nullable = false)
	var title: String,

	// 투자 판단에 필요한 핵심만 뽑은 한두 문장 요약 — 초보자용 쉬운 표현
	@Column(columnDefinition = "text", nullable = false)
	var summary: String,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null
}
