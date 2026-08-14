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
import java.util.UUID

@Entity
@Table(name = "personalized_quiz_options")
class PersonalizedQuizOption(
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "quiz_id", nullable = false)
	var quiz: PersonalizedQuiz,

	@Column(nullable = false)
	var position: Int,

	@Column(nullable = false, columnDefinition = "text")
	var label: String,

	// 채점용 정답 플래그 — 문제를 풀기 전엔 API 응답에서 이 값을 안 내려줌(QuizController 참고).
	@Column(name = "is_correct", nullable = false)
	var isCorrect: Boolean,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null
}
