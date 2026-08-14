package com.tradinggym.backend.repository

import com.tradinggym.backend.entity.PersonalizedQuiz
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface PersonalizedQuizRepository : JpaRepository<PersonalizedQuiz, UUID> {
	fun findTop1ByUser_UsernameOrderByCreatedAtDesc(username: String): PersonalizedQuiz?
	fun findByUser_UsernameOrderByCreatedAtDesc(username: String): List<PersonalizedQuiz>
}
