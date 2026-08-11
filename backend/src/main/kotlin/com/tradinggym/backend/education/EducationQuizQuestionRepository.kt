package com.tradinggym.backend.education

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface EducationQuizQuestionRepository : JpaRepository<EducationQuizQuestion, UUID> {
	fun findByArticleIdOrderByPositionAsc(articleId: UUID): List<EducationQuizQuestion>
}
