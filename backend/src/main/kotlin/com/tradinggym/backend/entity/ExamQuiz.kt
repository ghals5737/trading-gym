package com.tradinggym.backend.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import jakarta.persistence.UniqueConstraint
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

// 응시 1회 → 퀴즈 세트 1개. (기존 personalized_quizzes는 session_stats 기반이라 별개다 —
// 이쪽은 모의고사 메모에서 나온 진단을 겨냥한다.)
@Entity
@Table(name = "exam_quiz_sets")
class ExamQuizSet(
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "attempt_id", nullable = false)
	var attempt: ExamAttempt,

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "user_id", nullable = false)
	var user: UserEntity,

	@Column(nullable = false)
	var generator: String,

	@Column(columnDefinition = "text")
	var headline: String? = null,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	@Column(name = "created_at", nullable = false)
	var createdAt: Instant = Instant.now()
}

@Entity
@Table(
	name = "exam_quiz_questions",
	uniqueConstraints = [UniqueConstraint(columnNames = ["set_id", "position"])],
)
class ExamQuizQuestion(
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "set_id", nullable = false)
	var set: ExamQuizSet,

	@Column(nullable = false)
	var position: Int,

	@Column(name = "pattern_key", nullable = false)
	var patternKey: String,

	@Column(nullable = false, columnDefinition = "text")
	var question: String,

	@Column(nullable = false, columnDefinition = "text")
	var explanation: String,

	// "3턴에서 이렇게 적으셨죠" — 이 문제가 왜 이 사람에게 나왔는지.
	@Column(name = "why_this_question", columnDefinition = "text")
	var whyThisQuestion: String? = null,

	// 계기가 된 판단. exam_turns FK는 걸지 않고 번호만 들고 있어도 화면 표시엔 충분하다.
	@Column(name = "related_turn_no")
	var relatedTurnNo: Int? = null,

	// ★ RAG 근거. edu_chunks는 파이썬 인덱서가 만든 테이블이라 JPA 엔티티가 없어서
	// FK 대신 id만 남긴다 — 할루시네이션 방어를 위해 어느 청크에서 나왔는지는 고정해야 한다.
	@Column(name = "source_chunk_id")
	var sourceChunkId: Int? = null,

	@Column(name = "source_title")
	var sourceTitle: String? = null,

	@Column(name = "source_org")
	var sourceOrg: String? = null,

	@Column(name = "source_page_start")
	var sourcePageStart: Int? = null,

	@Column(name = "source_page_end")
	var sourcePageEnd: Int? = null,

	@Column(name = "source_score")
	var sourceScore: BigDecimal? = null,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	// 유저가 고른 보기 — 안 풀었으면 null.
	@Column(name = "answered_option_id")
	var answeredOptionId: UUID? = null
}

@Entity
@Table(
	name = "exam_quiz_options",
	uniqueConstraints = [UniqueConstraint(columnNames = ["question_id", "position"])],
)
class ExamQuizOption(
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "question_id", nullable = false)
	var question: ExamQuizQuestion,

	@Column(nullable = false)
	var position: Int,

	@Column(nullable = false, columnDefinition = "text")
	var label: String,

	@Column(name = "is_correct", nullable = false)
	var isCorrect: Boolean = false,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null
}
