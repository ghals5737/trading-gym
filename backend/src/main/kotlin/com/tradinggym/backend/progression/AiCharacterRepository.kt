package com.tradinggym.backend.progression

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface AiCharacterRepository : JpaRepository<AiCharacter, UUID> {
	fun findByUserId(userId: UUID): AiCharacter?
}
