package com.tradinggym.backend.repository

import com.tradinggym.backend.entity.OnboardingConversationTurn
import com.tradinggym.backend.entity.OnboardingQuestionId
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface OnboardingConversationTurnRepository : JpaRepository<OnboardingConversationTurn, UUID> {
	fun findByUserId(userId: UUID): List<OnboardingConversationTurn>
	fun findByUserIdAndQuestionId(userId: UUID, questionId: OnboardingQuestionId): OnboardingConversationTurn?
}
