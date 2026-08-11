package com.tradinggym.backend.education

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface EducationQuizOptionRepository : JpaRepository<EducationQuizOption, UUID> {
	fun findByQuestionIdOrderByPositionAsc(questionId: UUID): List<EducationQuizOption>
}
