package com.tradinggym.backend.repository

import com.tradinggym.backend.entity.PersonalizedQuiz
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface PersonalizedQuizRepository : JpaRepository<PersonalizedQuiz, UUID> {
	fun findTop1ByUser_UsernameOrderByCreatedAtDesc(username: String): PersonalizedQuiz?
	fun findByUser_UsernameOrderByCreatedAtDesc(username: String): List<PersonalizedQuiz>

	// 이미 답한(정답이든 오답이든) 퀴즈만 — AggregateStatService가 지표별 "퀴즈 정답률"을
	// 계산할 때 씀.
	fun findByUser_UsernameAndAnsweredOptionIdIsNotNull(username: String): List<PersonalizedQuiz>
}
