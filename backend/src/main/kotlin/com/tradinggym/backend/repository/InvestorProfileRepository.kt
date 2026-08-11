package com.tradinggym.backend.repository

import com.tradinggym.backend.entity.InvestorProfile
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface InvestorProfileRepository : JpaRepository<InvestorProfile, UUID> {
	fun findByUserId(userId: UUID): InvestorProfile?
}
