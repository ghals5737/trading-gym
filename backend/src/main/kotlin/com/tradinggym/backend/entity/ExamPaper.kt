package com.tradinggym.backend.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

// 모의고사 문제지 1회분. 콘텐츠(문제지·턴)와 기록(응시·응답)을 분리해둔 이유는
// 같은 모의고사를 여러 명이 풀고, 재응시로 개선 여부를 봐야 하기 때문.
@Entity
@Table(name = "exam_papers")
class ExamPaper(
	@Column(nullable = false, unique = true)
	var code: String,

	@Column(nullable = false)
	var title: String,

	@Column(columnDefinition = "text")
	var description: String? = null,

	@Column(nullable = false)
	var difficulty: String = "NORMAL",

	@Column(name = "total_turns", nullable = false)
	var totalTurns: Int,

	@Column(name = "starting_cash", nullable = false)
	var startingCash: Long,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	@Column(name = "created_at", nullable = false)
	var createdAt: Instant = Instant.now()
}
