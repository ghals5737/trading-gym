package com.tradinggym.backend.repository

import com.tradinggym.backend.entity.ExamAttempt
import com.tradinggym.backend.entity.ExamAttemptStatus
import com.tradinggym.backend.entity.ExamDiagnosis
import com.tradinggym.backend.entity.ExamPaper
import com.tradinggym.backend.entity.ExamQuizOption
import com.tradinggym.backend.entity.ExamQuizQuestion
import com.tradinggym.backend.entity.ExamQuizSet
import com.tradinggym.backend.entity.ExamResponse
import com.tradinggym.backend.entity.ExamTurn
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface ExamPaperRepository : JpaRepository<ExamPaper, UUID> {
	fun findByCode(code: String): ExamPaper?
}

interface ExamTurnRepository : JpaRepository<ExamTurn, UUID> {
	fun findByPaperIdOrderByTurnNoAsc(paperId: UUID): List<ExamTurn>
	fun findByPaperIdAndTurnNo(paperId: UUID, turnNo: Int): ExamTurn?
}

interface ExamAttemptRepository : JpaRepository<ExamAttempt, UUID> {
	fun findFirstByUser_UsernameOrderByStartedAtDesc(username: String): ExamAttempt?
	fun findFirstByUser_UsernameAndStatusOrderByStartedAtDesc(
		username: String,
		status: ExamAttemptStatus,
	): ExamAttempt?
	fun findByUser_UsernameOrderByStartedAtDesc(username: String): List<ExamAttempt>
}

interface ExamResponseRepository : JpaRepository<ExamResponse, UUID> {
	fun findByAttemptIdOrderByTurn_TurnNoAsc(attemptId: UUID): List<ExamResponse>
	fun findByAttemptIdAndTurnId(attemptId: UUID, turnId: UUID): ExamResponse?
	fun countByAttemptId(attemptId: UUID): Long
}

interface ExamDiagnosisRepository : JpaRepository<ExamDiagnosis, UUID> {
	fun findByAttemptId(attemptId: UUID): List<ExamDiagnosis>
	fun deleteByAttemptId(attemptId: UUID)
}

interface ExamQuizSetRepository : JpaRepository<ExamQuizSet, UUID> {
	fun findFirstByAttemptIdOrderByCreatedAtDesc(attemptId: UUID): ExamQuizSet?
	fun findFirstByUser_UsernameOrderByCreatedAtDesc(username: String): ExamQuizSet?
	fun findByAttemptId(attemptId: UUID): List<ExamQuizSet>
}

interface ExamQuizQuestionRepository : JpaRepository<ExamQuizQuestion, UUID> {
	fun findBySetIdOrderByPositionAsc(setId: UUID): List<ExamQuizQuestion>
}

interface ExamQuizOptionRepository : JpaRepository<ExamQuizOption, UUID> {
	fun findByQuestionIdOrderByPositionAsc(questionId: UUID): List<ExamQuizOption>
}
