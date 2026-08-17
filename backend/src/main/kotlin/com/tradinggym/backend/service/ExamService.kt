package com.tradinggym.backend.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.tradinggym.backend.dto.ExamAttemptResponse
import com.tradinggym.backend.dto.ExamPaperResponse
import com.tradinggym.backend.dto.ExamTurnOutcomeResponse
import com.tradinggym.backend.dto.ExamTurnResponse
import com.tradinggym.backend.dto.SubmitTurnRequest
import com.tradinggym.backend.entity.ExamAttempt
import com.tradinggym.backend.entity.ExamAttemptStatus
import com.tradinggym.backend.entity.ExamPaper
import com.tradinggym.backend.entity.ExamResponse
import com.tradinggym.backend.entity.ExamTurn
import com.tradinggym.backend.repository.ExamAttemptRepository
import com.tradinggym.backend.repository.ExamPaperRepository
import com.tradinggym.backend.repository.ExamResponseRepository
import com.tradinggym.backend.repository.ExamTurnRepository
import com.tradinggym.backend.repository.UserJpaRepository
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.time.Instant
import java.util.UUID

// 모의고사 진행 — 시작 / 현재 문제 조회 / 턴 제출.
//
// 정답 영역(outcome_*, ideal_*)은 제출 응답에서만 나간다. 문제 조회 DTO에 아예 필드가
// 없어서 실수로 미리 내려줄 수 없게 해뒀다 — 프론트가 조심하는 것에 기대지 않는 편이 낫다.
@Service
class ExamService(
	private val userJpaRepository: UserJpaRepository,
	private val paperRepository: ExamPaperRepository,
	private val turnRepository: ExamTurnRepository,
	private val attemptRepository: ExamAttemptRepository,
	private val responseRepository: ExamResponseRepository,
	private val objectMapper: ObjectMapper,
) {

	// 메모가 이 길이 미만이면 진단이 행동 통계로 떨어져서 맞춤 퀴즈의 의미가 사라진다.
	private val minMemoLength = 10

	@Transactional
	fun start(username: String, paperCode: String?): ExamAttemptResponse {
		val user = requireUser(username)
		val paper = paperCode?.let { paperRepository.findByCode(it) }
			?: paperRepository.findAll().firstOrNull()
			?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "등록된 모의고사가 없어요")

		val attempt = attemptRepository.save(
			ExamAttempt(paper = paper, user = user, startingCash = paper.startingCash),
		)
		return attempt.toResponse(currentTurn(paper, 1))
	}

	fun getActive(username: String): ExamAttemptResponse? {
		val attempt = attemptRepository.findFirstByUser_UsernameAndStatusOrderByStartedAtDesc(
			username, ExamAttemptStatus.IN_PROGRESS,
		) ?: return null
		return attempt.toResponse(currentTurn(attempt.paper, attempt.currentTurnNo))
	}

	fun getLatest(username: String): ExamAttemptResponse? =
		attemptRepository.findFirstByUser_UsernameOrderByStartedAtDesc(username)
			?.let { it.toResponse(if (it.status == ExamAttemptStatus.IN_PROGRESS) currentTurn(it.paper, it.currentTurnNo) else null) }

	@Transactional
	fun submitTurn(username: String, attemptId: UUID, request: SubmitTurnRequest): ExamTurnOutcomeResponse {
		val attempt = requireOwnedAttempt(username, attemptId)
		if (attempt.status == ExamAttemptStatus.COMPLETED) {
			throw ResponseStatusException(HttpStatus.CONFLICT, "이미 끝난 모의고사예요")
		}
		if (request.reasonMemo.trim().length < minMemoLength) {
			throw ResponseStatusException(
				HttpStatus.BAD_REQUEST,
				"판단한 이유를 ${minMemoLength}자 이상 적어주세요 — 이 메모로 투자 습관을 진단해요",
			)
		}

		val paperId = requireNotNull(attempt.paper.id)
		val turn = turnRepository.findByPaperIdAndTurnNo(paperId, attempt.currentTurnNo)
			?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "현재 턴 문제를 찾을 수 없어요")
		if (request.action == com.tradinggym.backend.entity.ExamAction.SELL && turn.holdingQty <= 0) {
			throw ResponseStatusException(HttpStatus.BAD_REQUEST, "보유한 주식이 없어 매도할 수 없어요")
		}
		if (responseRepository.findByAttemptIdAndTurnId(attemptId, requireNotNull(turn.id)) != null) {
			throw ResponseStatusException(HttpStatus.CONFLICT, "이미 제출한 턴이에요")
		}

		val aligned = request.action == turn.idealAction
		responseRepository.save(
			ExamResponse(
				attempt = attempt,
				turn = turn,
				action = request.action,
				reasonMemo = request.reasonMemo.trim(),
				viewedDisclosure = request.viewedDisclosure,
				quantity = request.quantity,
				secondsSpent = request.secondsSpent,
				isAligned = aligned,
			),
		)

		val totalTurns = attempt.paper.totalTurns
		val isLast = attempt.currentTurnNo >= totalTurns
		if (isLast) {
			attempt.status = ExamAttemptStatus.COMPLETED
			attempt.completedAt = Instant.now()
			attempt.alignedCount = responseRepository.findByAttemptIdOrderByTurn_TurnNoAsc(attemptId).count { it.isAligned }
		} else {
			attempt.currentTurnNo += 1
		}
		attemptRepository.save(attempt)

		return ExamTurnOutcomeResponse(
			turnNo = turn.turnNo,
			myAction = request.action,
			idealAction = turn.idealAction,
			isAligned = aligned,
			outcomePoints = objectMapper.readTree(turn.outcomePoints),
			outcomeChangePct = turn.outcomeChangePct,
			outcomeSummary = turn.outcomeSummary,
			idealRationale = turn.idealRationale,
			learningPoint = turn.learningPoint,
			nextTurnNo = if (isLast) null else attempt.currentTurnNo,
			completed = isLast,
		)
	}

	fun getTurn(username: String, attemptId: UUID, turnNo: Int): ExamTurnResponse {
		val attempt = requireOwnedAttempt(username, attemptId)
		// 아직 도달하지 않은 턴을 미리 보는 걸 막는다(정답을 유추할 여지를 없앰).
		if (turnNo > attempt.currentTurnNo) {
			throw ResponseStatusException(HttpStatus.FORBIDDEN, "아직 진행하지 않은 턴이에요")
		}
		val turn = turnRepository.findByPaperIdAndTurnNo(requireNotNull(attempt.paper.id), turnNo)
			?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "문제를 찾을 수 없어요")
		return turn.toResponse()
	}

	// --- 내부 ---

	internal fun requireOwnedAttempt(username: String, attemptId: UUID): ExamAttempt {
		val attempt = attemptRepository.findById(attemptId)
			.orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND, "응시 기록을 찾을 수 없어요") }
		if (attempt.user.username != username) {
			throw ResponseStatusException(HttpStatus.FORBIDDEN, "본인 응시 기록이 아니에요")
		}
		return attempt
	}

	private fun requireUser(username: String) =
		userJpaRepository.findByUsername(username)
			?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "사용자를 찾을 수 없습니다")

	private fun currentTurn(paper: ExamPaper, turnNo: Int): ExamTurnResponse? =
		turnRepository.findByPaperIdAndTurnNo(requireNotNull(paper.id), turnNo)?.toResponse()

	private fun ExamTurn.toResponse() = ExamTurnResponse(
		turnNo = turnNo,
		stockName = stockName,
		sector = sector,
		asOfDate = asOfDate,
		price = price,
		holdingQty = holdingQty,
		avgBuyPrice = avgBuyPrice,
		chartPoints = objectMapper.readTree(chartPoints),
		news = objectMapper.readTree(news),
		disclosure = disclosure?.let { objectMapper.readTree(it) },
	)

	private fun ExamAttempt.toResponse(turn: ExamTurnResponse?) = ExamAttemptResponse(
		attemptId = requireNotNull(id),
		paper = ExamPaperResponse(
			code = paper.code,
			title = paper.title,
			description = paper.description,
			difficulty = paper.difficulty,
			totalTurns = paper.totalTurns,
			startingCash = paper.startingCash,
		),
		status = status,
		currentTurnNo = currentTurnNo,
		totalTurns = paper.totalTurns,
		alignedCount = alignedCount,
		startedAt = startedAt,
		completedAt = completedAt,
		currentTurn = turn,
	)
}
