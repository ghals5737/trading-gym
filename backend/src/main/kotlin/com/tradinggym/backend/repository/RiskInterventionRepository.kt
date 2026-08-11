package com.tradinggym.backend.repository

import com.tradinggym.backend.entity.RiskIntervention
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface RiskInterventionRepository : JpaRepository<RiskIntervention, UUID> {
	fun findBySessionId(sessionId: UUID): List<RiskIntervention>
}
