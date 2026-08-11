package com.tradinggym.backend.education

import com.tradinggym.backend.user.UserEntity
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "user_quiz_answers")
class UserQuizAnswer(
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "user_id", nullable = false)
	var user: UserEntity,

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "question_id", nullable = false)
	var question: EducationQuizQuestion,

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "selected_option_id", nullable = false)
	var selectedOption: EducationQuizOption,

	@Column(name = "is_correct", nullable = false)
	var isCorrect: Boolean, // 응답 시점 스냅샷(문항이 나중에 바뀌어도 기록 보존)
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	@Column(name = "answered_at", nullable = false, updatable = false)
	var answeredAt: Instant = Instant.now()
}
