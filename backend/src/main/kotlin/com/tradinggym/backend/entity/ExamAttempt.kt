package com.tradinggym.backend.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.FetchType
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

enum class ExamAttemptStatus { IN_PROGRESS, COMPLETED }

// 응시 1회. 같은 문제지를 다시 풀면 새 행이 생겨서 재도전 전후를 비교할 수 있다.
@Entity
@Table(name = "exam_attempts")
class ExamAttempt(
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "paper_id", nullable = false)
	var paper: ExamPaper,

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "user_id", nullable = false)
	var user: UserEntity,

	@Column(name = "starting_cash", nullable = false)
	var startingCash: Long,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	var status: ExamAttemptStatus = ExamAttemptStatus.IN_PROGRESS

	@Column(name = "current_turn_no", nullable = false)
	var currentTurnNo: Int = 1

	// 모범답안과 일치한 턴 수 — 완료 시 채운다.
	@Column(name = "aligned_count")
	var alignedCount: Int? = null

	@Column(name = "final_return_pct")
	var finalReturnPct: BigDecimal? = null

	@Column(name = "started_at", nullable = false)
	var startedAt: Instant = Instant.now()

	@Column(name = "completed_at")
	var completedAt: Instant? = null
}
