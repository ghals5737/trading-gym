package com.tradinggym.backend.repository

import com.tradinggym.backend.entity.PersonalizedQuizOption
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface PersonalizedQuizOptionRepository : JpaRepository<PersonalizedQuizOption, UUID> {
	fun findByQuizIdOrderByPositionAsc(quizId: UUID): List<PersonalizedQuizOption>

	// 여러 퀴즈의 정답 보기를 한 번에 조회 — AggregateStatService가 답한 퀴즈들의 정답
	// 여부를 판정할 때 퀴즈마다 따로 조회하지 않게 함.
	fun findByQuizIdInAndIsCorrectTrue(quizIds: List<UUID>): List<PersonalizedQuizOption>
}
