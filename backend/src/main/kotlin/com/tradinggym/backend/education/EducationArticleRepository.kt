package com.tradinggym.backend.education

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface EducationArticleRepository : JpaRepository<EducationArticle, UUID> {
	fun findBySlug(slug: String): EducationArticle?
	fun findByCategory(category: EducationCategory): List<EducationArticle>
}
