package com.tradinggym.backend.progression

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface XpEventRepository : JpaRepository<XpEvent, UUID> {
	fun findByUserIdOrderByCreatedAtDesc(userId: UUID): List<XpEvent>
}
