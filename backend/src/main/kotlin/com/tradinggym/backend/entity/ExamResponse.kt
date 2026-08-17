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
import jakarta.persistence.UniqueConstraint
import java.time.Instant
import java.util.UUID

// 턴별 응답. reasonMemo("왜 그렇게 판단했는지")가 이 설계의 핵심이다.
// 매매 기록만 보면 "1턴에 매수했다"까지만 알 수 있지만, 메모가 있어야
// "리딩방을 보고 샀다" vs "평단가를 낮추려고 샀다"를 구분해 다른 처방을 줄 수 있다.
@Entity
@Table(
	name = "exam_responses",
	uniqueConstraints = [UniqueConstraint(columnNames = ["attempt_id", "turn_id"])],
)
class ExamResponse(
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "attempt_id", nullable = false)
	var attempt: ExamAttempt,

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "turn_id", nullable = false)
	var turn: ExamTurn,

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	var action: ExamAction,

	@Column(name = "reason_memo", nullable = false, columnDefinition = "text")
	var reasonMemo: String,

	// 공시를 열어봤는지 — DISCLOSURE_IGNORED 진단의 근거가 된다.
	@Column(name = "viewed_disclosure", nullable = false)
	var viewedDisclosure: Boolean = false,

	var quantity: Int? = null,

	@Column(name = "seconds_spent")
	var secondsSpent: Int? = null,

	// 모범답안(turn.idealAction)과 일치했는가 — 저장 시점에 계산해둔다.
	@Column(name = "is_aligned", nullable = false)
	var isAligned: Boolean = false,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	@Column(name = "responded_at", nullable = false)
	var respondedAt: Instant = Instant.now()
}
