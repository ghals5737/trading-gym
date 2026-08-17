package com.tradinggym.backend.dto

import com.fasterxml.jackson.databind.JsonNode
import com.tradinggym.backend.entity.ExamAction
import com.tradinggym.backend.entity.ExamAttemptStatus
import com.tradinggym.backend.entity.ExamDiagnosisSeverity
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

// 프론트(knowerbot-demo /rewind)가 목업 JSON으로 쓰던 모양을 그대로 맞췄다 —
// 목업을 이 응답으로 갈아끼우기만 하면 되도록.

data class ExamPaperResponse(
	val code: String,
	val title: String,
	val description: String?,
	val difficulty: String,
	val totalTurns: Int,
	val startingCash: Long,
)

// 문제 제시용 — outcome(정답 영역)은 절대 포함하지 않는다.
data class ExamTurnResponse(
	val turnNo: Int,
	val stockName: String,
	val sector: String?,
	val asOfDate: LocalDate,
	val price: Long,
	val holdingQty: Int,
	val avgBuyPrice: Long?,
	val chartPoints: JsonNode,
	val news: JsonNode,
	val disclosure: JsonNode?,
)

// 제출 응답 — 여기서 처음으로 결과가 공개된다.
data class ExamTurnOutcomeResponse(
	val turnNo: Int,
	val myAction: ExamAction,
	val idealAction: ExamAction,
	val isAligned: Boolean,
	val outcomePoints: JsonNode,
	val outcomeChangePct: BigDecimal,
	val outcomeSummary: String,
	val idealRationale: String,
	val learningPoint: String,
	val nextTurnNo: Int?,
	val completed: Boolean,
)

data class SubmitTurnRequest(
	val action: ExamAction,
	val reasonMemo: String,
	val viewedDisclosure: Boolean = false,
	val quantity: Int? = null,
	val secondsSpent: Int? = null,
)

data class ExamAttemptResponse(
	val attemptId: UUID,
	val paper: ExamPaperResponse,
	val status: ExamAttemptStatus,
	val currentTurnNo: Int,
	val totalTurns: Int,
	val alignedCount: Int?,
	val startedAt: Instant,
	val completedAt: Instant?,
	// 진행 중이면 현재 턴 문제를 같이 준다(화면이 한 번의 호출로 그려지게).
	val currentTurn: ExamTurnResponse?,
)

data class ExamEvidenceResponse(
	val turnNo: Int,
	val stockName: String,
	val action: ExamAction,
	val matched: List<String>,
	val memo: String,
	val wasWrong: Boolean,
)

data class ExamDiagnosisResponse(
	val patternKey: String,
	val label: String,
	val severity: ExamDiagnosisSeverity,
	val hitCount: Int,
	val evidence: List<ExamEvidenceResponse>,
)

data class ExamReportResponse(
	val attemptId: UUID,
	val totalTurns: Int,
	val alignedCount: Int,
	val diagnoses: List<ExamDiagnosisResponse>,
)

data class ExamQuizSourceResponse(
	val chunkId: Int?,
	val title: String?,
	val orgName: String?,
	val pageStart: Int?,
	val pageEnd: Int?,
	val score: BigDecimal?,
)

data class ExamQuizOptionResponse(
	val id: UUID,
	val position: Int,
	val label: String,
)

data class ExamQuizQuestionResponse(
	val id: UUID,
	val position: Int,
	val patternKey: String,
	val relatedTurnNo: Int?,
	val question: String,
	val options: List<ExamQuizOptionResponse>,
	val source: ExamQuizSourceResponse,
	// 아래는 답을 제출한 뒤에만 채운다 — 미리 주면 정답이 노출된다.
	val answered: Boolean,
	val answeredOptionId: UUID?,
	val correctOptionId: UUID?,
	val correct: Boolean?,
	val explanation: String?,
	val whyThisQuestion: String?,
)

data class ExamQuizSetResponse(
	val id: UUID,
	val attemptId: UUID,
	val headline: String?,
	val generator: String,
	val createdAt: Instant,
	val questions: List<ExamQuizQuestionResponse>,
)

data class ExamQuizAnswerRequest(val selectedOptionId: UUID)

data class ExamQuizAnswerResponse(
	val correct: Boolean,
	val correctOptionId: UUID,
	val explanation: String,
	val whyThisQuestion: String?,
)
