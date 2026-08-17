package com.tradinggym.backend.dto

import com.tradinggym.backend.entity.SessionStatKey
import java.time.Instant
import java.util.UUID

// 정답 플래그(isCorrect)는 일부러 안 담음 — 풀기 전에 정답이 응답에 노출되면 안 되니까.
data class PersonalizedQuizOptionResponse(
	val id: UUID,
	val position: Int,
	val label: String,
)

data class PersonalizedQuizResponse(
	val id: UUID,
	val targetStatKey: SessionStatKey,
	val question: String,
	val options: List<PersonalizedQuizOptionResponse>,
	val sourceOrgName: String?,
	val sourceTitle: String?,
	val sourcePageStart: Int?,
	val sourcePageEnd: Int?,
	val createdAt: Instant,
)

data class QuizAnswerRequest(val selectedOptionId: UUID)

data class QuizAnswerResponse(
	val correct: Boolean,
	val correctOptionId: UUID,
	val explanation: String,
)

// "지난 퀴즈" 목록 한 건 — 아직 안 푼 문제는 correct/correctOptionId/explanation을 안 담아서
// (PersonalizedQuizResponse와 같은 이유로) 정답을 미리 노출하지 않음.
data class QuizHistoryItemResponse(
	val id: UUID,
	val targetStatKey: SessionStatKey,
	val question: String,
	val options: List<PersonalizedQuizOptionResponse>,
	val answered: Boolean,
	val answeredOptionId: UUID?,
	val correct: Boolean?,
	val correctOptionId: UUID?,
	val explanation: String?,
	val sourceOrgName: String?,
	val sourceTitle: String?,
	val sourcePageStart: Int?,
	val sourcePageEnd: Int?,
	val createdAt: Instant,
)
