package com.tradinggym.backend.education

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

// lib/education-content.ts의 한글 카테고리 5종과 1:1 대응 (기초 개념/리스크 관리/
// 차트 분석/제도와 공시/투자 심리) — DB 컬럼값은 영문 상수명으로 저장됨(다른 enum들과 동일 원칙).
enum class EducationCategory {
	BASIC_CONCEPTS,         // 기초 개념
	RISK_MANAGEMENT,        // 리스크 관리
	CHART_ANALYSIS,         // 차트 분석
	REGULATION_DISCLOSURE,  // 제도와 공시
	INVESTOR_PSYCHOLOGY,    // 투자 심리
}

@Entity
@Table(name = "education_articles")
class EducationArticle(
	@Column(nullable = false, unique = true)
	var slug: String,

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	var category: EducationCategory,

	@Column(nullable = false)
	var title: String,

	@Column(columnDefinition = "text", nullable = false)
	var summary: String,

	@Column(nullable = false)
	var source: String,

	@Column(columnDefinition = "text", nullable = false)
	var body: String,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	@Column(name = "created_at", nullable = false, updatable = false)
	var createdAt: Instant = Instant.now()

	@Column(name = "updated_at", nullable = false)
	var updatedAt: Instant = Instant.now()
}
