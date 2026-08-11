package com.tradinggym.backend.education

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface EducationChunkRepository : JpaRepository<EducationChunk, UUID> {
	fun findByArticleIdOrderByChunkIndexAsc(articleId: UUID): List<EducationChunk>
}
