package com.tradinggym.backend.repository

import com.tradinggym.backend.entity.PersonalizedQuizOption
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface PersonalizedQuizOptionRepository : JpaRepository<PersonalizedQuizOption, UUID> {
	fun findByQuizIdOrderByPositionAsc(quizId: UUID): List<PersonalizedQuizOption>
}
