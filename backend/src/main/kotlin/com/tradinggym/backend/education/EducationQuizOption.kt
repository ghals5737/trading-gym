package com.tradinggym.backend.education

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
import java.util.UUID

@Entity
@Table(
	name = "education_quiz_options",
	uniqueConstraints = [UniqueConstraint(columnNames = ["question_id", "position"])],
)
class EducationQuizOption(
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "question_id", nullable = false)
	var question: EducationQuizQuestion,

	@Column(nullable = false)
	var position: Int,

	@Column(columnDefinition = "text", nullable = false)
	var label: String,

	@Column(name = "is_correct", nullable = false)
	var isCorrect: Boolean = false,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null
}
