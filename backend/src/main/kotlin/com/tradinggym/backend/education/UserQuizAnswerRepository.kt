package com.tradinggym.backend.education

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface UserQuizAnswerRepository : JpaRepository<UserQuizAnswer, UUID> {
	fun findByUserId(userId: UUID): List<UserQuizAnswer>
}
