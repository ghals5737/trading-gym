package com.tradinggym.backend.education

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface UserArticleProgressRepository : JpaRepository<UserArticleProgress, UUID> {
	fun findByUserId(userId: UUID): List<UserArticleProgress>
	fun findByUserIdAndArticleId(userId: UUID, articleId: UUID): UserArticleProgress?
}
