package com.tradinggym.backend.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.tradinggym.backend.dto.ExamDiagnosisResponse
import com.tradinggym.backend.dto.ExamEvidenceResponse
import com.tradinggym.backend.dto.ExamQuizAnswerResponse
import com.tradinggym.backend.dto.ExamQuizOptionResponse
import com.tradinggym.backend.dto.ExamQuizQuestionResponse
import com.tradinggym.backend.dto.ExamQuizSetResponse
import com.tradinggym.backend.dto.ExamQuizSourceResponse
import com.tradinggym.backend.dto.ExamReportResponse
import com.tradinggym.backend.entity.ExamAttempt
import com.tradinggym.backend.entity.ExamAttemptStatus
import com.tradinggym.backend.entity.ExamDiagnosis
import com.tradinggym.backend.entity.ExamQuizOption
import com.tradinggym.backend.entity.ExamQuizQuestion
import com.tradinggym.backend.entity.ExamQuizSet
import com.tradinggym.backend.repository.ExamDiagnosisRepository
import com.tradinggym.backend.repository.ExamQuizOptionRepository
import com.tradinggym.backend.repository.ExamQuizQuestionRepository
import com.tradinggym.backend.repository.ExamQuizSetRepository
import com.tradinggym.backend.repository.ExamResponseRepository
import com.tradinggym.backend.service.ai.ExamQuizGenerator
import com.tradinggym.backend.service.ai.ExamQuizInput
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.math.RoundingMode
import java.util.UUID

// 모의고사 응답(메모) → 규칙 진단 → edu_chunks RAG 검색 → LLM 문제 생성 → 저장.
//
// mock-exam/quizgen.py를 그대로 옮긴 것이고, 벡터 검색만 파이썬 검색 서버(/api/search)를
// 호출한다(임베딩 모델이 파이썬 전용이라 JVM에서 못 돌림 — EducationSearchClient 주석 참고).
@Service
class ExamQuizService(
	private val examService: ExamService,
	private val responseRepository: ExamResponseRepository,
	private val diagnosisRepository: ExamDiagnosisRepository,
	private val quizSetRepository: ExamQuizSetRepository,
	private val quizQuestionRepository: ExamQuizQuestionRepository,
	private val quizOptionRepository: ExamQuizOptionRepository,
	private val educationSearchClient: EducationSearchClient,
	private val quizGenerator: ExamQuizGenerator,
	private val objectMapper: ObjectMapper,
) {
	private val log = LoggerFactory.getLogger(javaClass)

	// 진단이 여러 개 나와도 문제는 이만큼만 — 다 내면 학습이 아니라 시험이 된다.
	private val maxQuestions = 3

	@Transactional
	fun buildReport(username: String, attemptId: UUID): ExamReportResponse {
		val attempt = examService.requireOwnedAttempt(username, attemptId)
		requireCompleted(attempt)

		val diagnoses = diagnoseAndSave(attempt)
		return ExamReportResponse(
			attemptId = attemptId,
			totalTurns = attempt.paper.totalTurns,
			alignedCount = attempt.alignedCount ?: 0,
			diagnoses = diagnoses.map { it.toResponse() },
		)
	}

	@Transactional
	fun generateQuiz(username: String, attemptId: UUID): ExamQuizSetResponse {
		val attempt = examService.requireOwnedAttempt(username, attemptId)
		requireCompleted(attempt)

		val diagnoses = diagnoseAndSave(attempt)
		if (diagnoses.isEmpty()) {
			throw ResponseStatusException(
				HttpStatus.BAD_REQUEST,
				"눈에 띄는 습관이 잡히지 않아 맞춤 문제를 만들지 못했어요. 판단 이유를 조금 더 구체적으로 적어보세요.",
			)
		}

		// 같은 응시로 다시 만들면 이전 세트를 지운다(중복 노출 방지).
		deletePreviousSets(attemptId)

		val set = quizSetRepository.save(
			ExamQuizSet(
				attempt = attempt,
				user = attempt.user,
				generator = quizGenerator.javaClass.simpleName,
				headline = "${diagnoses.first().label} 습관이 ${diagnoses.first().hitCount}번 보였어요",
			),
		)

		val usedTurns = mutableSetOf<Int>()
		var position = 0
		for (diagnosis in diagnoses.take(maxQuestions)) {
			val sources = educationSearchClient.search(diagnosis.ragQuery, topK = 3)
			if (sources.isEmpty()) {
				log.warn("근거 자료를 못 찾아 건너뜁니다: ${diagnosis.patternKey}")
				continue
			}
			val evidence = ExamDiagnosisRules.pickEvidence(diagnosis, usedTurns)
			usedTurns += evidence.turnNo

			val generated = quizGenerator.generate(
				ExamQuizInput(
					patternLabel = diagnosis.label,
					turnNo = evidence.turnNo,
					stockName = evidence.stockName,
					action = evidence.action.name,
					memo = evidence.memo,
					outcomeChangePct = evidence.outcomeChangePct,
					sourceExcerpts = sources,
				),
			)
			if (generated == null) {
				log.warn("퀴즈 생성 실패로 건너뜁니다: ${diagnosis.patternKey}")
				continue
			}

			val top = sources.first()
			val question = quizQuestionRepository.save(
				ExamQuizQuestion(
					set = set,
					position = position++,
					patternKey = diagnosis.patternKey,
					question = generated.question,
					explanation = generated.explanation,
					whyThisQuestion = generated.whyThisQuestion,
					relatedTurnNo = evidence.turnNo,
					sourceChunkId = null, // 검색 API가 chunk id를 안 돌려줘서 비워둔다(아래 주석 참고)
					sourceTitle = top.title,
					sourceOrg = top.orgName,
					sourcePageStart = top.pageStart,
					sourcePageEnd = top.pageEnd,
					sourceScore = BigDecimal.valueOf(top.score).setScale(4, RoundingMode.HALF_UP),
				),
			)
			generated.options.forEachIndexed { i, label ->
				quizOptionRepository.save(
					ExamQuizOption(
						question = question,
						position = i,
						label = label,
						isCorrect = i == generated.correctIndex,
					),
				)
			}
		}

		if (position == 0) {
			throw ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "지금은 문제를 만들지 못했어요. 잠시 후 다시 시도해주세요.")
		}
		return loadSet(set)
	}

	fun getQuiz(username: String, attemptId: UUID): ExamQuizSetResponse? {
		examService.requireOwnedAttempt(username, attemptId)
		val set = quizSetRepository.findFirstByAttemptIdOrderByCreatedAtDesc(attemptId) ?: return null
		return loadSet(set)
	}

	@Transactional
	fun answer(username: String, questionId: UUID, selectedOptionId: UUID): ExamQuizAnswerResponse {
		val question = quizQuestionRepository.findById(questionId)
			.orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND, "문제를 찾을 수 없어요") }
		if (question.set.user.username != username) {
			throw ResponseStatusException(HttpStatus.FORBIDDEN, "이 문제에 접근할 수 없어요")
		}
		val options = quizOptionRepository.findByQuestionIdOrderByPositionAsc(questionId)
		val selected = options.find { it.id == selectedOptionId }
			?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "잘못된 보기예요")
		val correct = options.first { it.isCorrect }

		question.answeredOptionId = selected.id
		quizQuestionRepository.save(question)

		return ExamQuizAnswerResponse(
			correct = selected.isCorrect,
			correctOptionId = requireNotNull(correct.id),
			explanation = question.explanation,
			whyThisQuestion = question.whyThisQuestion,
		)
	}

	// --- 내부 ---

	// 진단은 매번 새로 계산해서 저장한다(규칙이 바뀌면 리포트도 따라 바뀌게).
	private fun diagnoseAndSave(attempt: ExamAttempt): List<ExamDiagnosisRules.Diagnosis> {
		val attemptId = requireNotNull(attempt.id)
		val rows = responseRepository.findByAttemptIdOrderByTurn_TurnNoAsc(attemptId).map {
			ExamDiagnosisRules.Row(
				turnNo = it.turn.turnNo,
				stockName = it.turn.stockName,
				action = it.action,
				reasonMemo = it.reasonMemo,
				viewedDisclosure = it.viewedDisclosure,
				isAligned = it.isAligned,
				outcomeChangePct = it.turn.outcomeChangePct.toDouble(),
			)
		}
		val diagnoses = ExamDiagnosisRules.diagnose(rows)

		// flush가 없으면 안 된다: Hibernate는 한 트랜잭션 안에서 INSERT를 DELETE보다 먼저
		// 내보내기 때문에, 지우기 전에 같은 (attempt_id, pattern_key)가 들어가 유니크 제약을
		// 위반한다. 실제로 겪은 버그라 주석으로 남겨둔다.
		diagnosisRepository.deleteByAttemptId(attemptId)
		diagnosisRepository.flush()

		diagnoses.forEach { d ->
			diagnosisRepository.save(
				ExamDiagnosis(
					attempt = attempt,
					patternKey = d.patternKey,
					severity = d.severity,
					hitCount = d.hitCount,
					evidence = objectMapper.writeValueAsString(d.evidence),
					ragQuery = d.ragQuery,
				),
			)
		}
		return diagnoses
	}

	// 보기 → 문항 → 세트 순으로 지운다. FK에 ON DELETE CASCADE가 없어서 순서를 지켜야 하고,
	// 새 세트를 넣기 전에 flush해야 한다(Hibernate가 INSERT를 DELETE보다 먼저 내보내기 때문).
	private fun deletePreviousSets(attemptId: UUID) {
		val sets = quizSetRepository.findByAttemptId(attemptId)
		if (sets.isEmpty()) return
		sets.forEach { set ->
			val questions = quizQuestionRepository.findBySetIdOrderByPositionAsc(requireNotNull(set.id))
			questions.forEach { q ->
				quizOptionRepository.deleteAll(quizOptionRepository.findByQuestionIdOrderByPositionAsc(requireNotNull(q.id)))
			}
			quizOptionRepository.flush()
			quizQuestionRepository.deleteAll(questions)
			quizQuestionRepository.flush()
		}
		quizSetRepository.deleteAll(sets)
		quizSetRepository.flush()
	}

	private fun requireCompleted(attempt: ExamAttempt) {
		if (attempt.status != ExamAttemptStatus.COMPLETED) {
			throw ResponseStatusException(HttpStatus.BAD_REQUEST, "모의고사를 끝까지 풀어야 리포트를 만들 수 있어요")
		}
	}

	private fun loadSet(set: ExamQuizSet): ExamQuizSetResponse {
		val setId = requireNotNull(set.id)
		val questions = quizQuestionRepository.findBySetIdOrderByPositionAsc(setId).map { q ->
			val options = quizOptionRepository.findByQuestionIdOrderByPositionAsc(requireNotNull(q.id))
			val answered = q.answeredOptionId != null
			val correct = options.first { it.isCorrect }
			ExamQuizQuestionResponse(
				id = requireNotNull(q.id),
				position = q.position,
				patternKey = q.patternKey,
				relatedTurnNo = q.relatedTurnNo,
				question = q.question,
				options = options.map { ExamQuizOptionResponse(requireNotNull(it.id), it.position, it.label) },
				source = ExamQuizSourceResponse(
					chunkId = q.sourceChunkId,
					title = q.sourceTitle,
					orgName = q.sourceOrg,
					pageStart = q.sourcePageStart,
					pageEnd = q.sourcePageEnd,
					score = q.sourceScore,
				),
				answered = answered,
				answeredOptionId = q.answeredOptionId,
				// 정답·해설은 답한 뒤에만 — 안 그러면 응답 JSON만 봐도 정답을 알 수 있다.
				correctOptionId = if (answered) correct.id else null,
				correct = if (answered) q.answeredOptionId == correct.id else null,
				explanation = if (answered) q.explanation else null,
				whyThisQuestion = if (answered) q.whyThisQuestion else null,
			)
		}
		return ExamQuizSetResponse(
			id = setId,
			attemptId = requireNotNull(set.attempt.id),
			headline = set.headline,
			generator = set.generator,
			createdAt = set.createdAt,
			questions = questions,
		)
	}

	private fun ExamDiagnosisRules.Diagnosis.toResponse() = ExamDiagnosisResponse(
		patternKey = patternKey,
		label = label,
		severity = severity,
		hitCount = hitCount,
		evidence = evidence.map {
			ExamEvidenceResponse(it.turnNo, it.stockName, it.action, it.matched, it.memo, it.wasWrong)
		},
	)
}
