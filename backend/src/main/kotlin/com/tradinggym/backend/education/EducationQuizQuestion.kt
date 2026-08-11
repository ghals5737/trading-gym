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
	name = "education_quiz_questions",
	uniqueConstraints = [UniqueConstraint(columnNames = ["article_id", "position"])],
)
class EducationQuizQuestion(
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "article_id", nullable = false)
	var article: EducationArticle,

	@Column(nullable = false)
	var position: Int,

	@Column(columnDefinition = "text", nullable = false)
	var question: String,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null
}
