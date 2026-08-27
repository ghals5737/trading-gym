package com.tradinggym.backend.service

import com.tradinggym.backend.dto.PersonalizedQuizOptionResponse
import com.tradinggym.backend.dto.PersonalizedQuizResponse
import com.tradinggym.backend.dto.QuizAnswerResponse
import com.tradinggym.backend.dto.QuizHistoryItemResponse
import com.tradinggym.backend.entity.PersonalizedQuiz
import com.tradinggym.backend.entity.PersonalizedQuizOption
import com.tradinggym.backend.entity.SessionStatKey
import com.tradinggym.backend.entity.UserEntity
import com.tradinggym.backend.repository.PersonalizedQuizOptionRepository
import com.tradinggym.backend.repository.PersonalizedQuizRepository
import com.tradinggym.backend.repository.UserJpaRepository
import com.tradinggym.backend.service.ai.QuizGenerationInput
import com.tradinggym.backend.service.ai.QuizGenerator
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

// 유저 스탯(session_stats 평균) → 가장 약한 지표 하나를 골라 → 그 지표를 RAG로 검색해 근거
// 자료를 찾고 → LLM이 그 자료를 바탕으로 4지선다 퀴즈를 만듦 → 저장.
// "오늘의 PT"(/pt) 화면이 이 서비스를 씀.
@Service
class QuizGenerationService(
	private val userJpaRepository: UserJpaRepository,
	private val aggregateStatService: AggregateStatService,
	private val sessionSummaryService: SessionSummaryService,
	private val educationSearchClient: EducationSearchClient,
	private val quizGenerator: QuizGenerator,
	private val quizRepository: PersonalizedQuizRepository,
	private val quizOptionRepository: PersonalizedQuizOptionRepository,
	// 프롬프트 버전 실험용(v1/v2) — QuizGenerationPrompt 참고. 다음주 비교 후 하나로 확정 예정.
	@Value("\${quiz.prompt-version:v1}") private val promptVersion: String,
) {

	@Transactional
	fun generateForUser(username: String): PersonalizedQuizResponse {
		val user = requireUser(username)
		val stats = aggregateStatService.getMyAggregateStats(username)
		val weakest = stats.minByOrNull { it.avgScorePct }
			?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "아직 완료한 모의고사가 없어서 맞춤 문제를 만들 수 없어요. 모의고사를 먼저 끝내주세요.")
		return generateAndSave(user, weakest.statKey, sourceSessionId = null)
	}

	// generateForUser와 달리 유저 전체 평균이 아니라 방금 끝난 세션 "하나"의 스탯만 보고
	// 약점을 고름 — 모의고사를 마치자마자 그 세션 결과로만 문제를 내주는 기능.
	// getSessionStats는 세션이 이미 완료돼 session_stats에 저장돼있으면 그걸 쓰고, 아직이면
	// 그 자리에서 라이브 계산함(SessionSummaryService 참고) — 진행 중인 세션에도 쓸 수 있음.
	@Transactional
	fun generateForSession(username: String, sessionId: UUID): PersonalizedQuizResponse {
		val user = requireUser(username)
		val stats = sessionSummaryService.getSessionStats(username, sessionId)
		val weakest = stats.minByOrNull { it.scorePct }
			?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "이 세션에는 채점된 지표가 없어서 문제를 만들 수 없어요.")
		return generateAndSave(user, weakest.statKey, sourceSessionId = sessionId)
	}

	private fun requireUser(username: String): UserEntity =
		userJpaRepository.findByUsername(username)
			?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "사용자를 찾을 수 없습니다")

	private fun generateAndSave(user: UserEntity, statKey: SessionStatKey, sourceSessionId: UUID?): PersonalizedQuizResponse {
		// 라벨·검색어 매핑은 SessionStatCatalog 한 곳(자료실 추천과 공유)
		val label = SessionStatCatalog.LABEL.getValue(statKey)
		val searchQuery = SessionStatCatalog.SEARCH_QUERY.getValue(statKey)
		val sources = educationSearchClient.search(searchQuery, topK = 3)

		val generated = quizGenerator.generate(QuizGenerationInput(targetStatLabel = label, sourceExcerpts = sources, promptVersion = promptVersion))
			?: throw ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "지금은 문제를 만들지 못했어요. 잠시 후 다시 시도해주세요.")

		val topSource = sources.firstOrNull()
		val quiz = quizRepository.save(
			PersonalizedQuiz(
				user = user,
				targetStatKey = statKey,
				question = generated.question,
				explanation = generated.explanation,
				sourceOrgName = topSource?.orgName,
				sourceTitle = topSource?.title,
				sourcePageStart = topSource?.pageStart,
				sourcePageEnd = topSource?.pageEnd,
				sourceSessionId = sourceSessionId,
			),
		)
		val options = generated.options.mapIndexed { index, label ->
			quizOptionRepository.save(
				PersonalizedQuizOption(quiz = quiz, position = index, label = label, isCorrect = index == generated.correctIndex),
			)
		}
		return quiz.toResponse(options)
	}

	fun getLatest(username: String): PersonalizedQuizResponse? {
		val quiz = quizRepository.findTop1ByUser_UsernameOrderByCreatedAtDesc(username) ?: return null
		val options = quizOptionRepository.findByQuizIdOrderByPositionAsc(requireNotNull(quiz.id))
		return quiz.toResponse(options)
	}

	// 지금까지 만들어진 모든 퀴즈 — 프론트가 targetStatKey별로 묶어서 보여줌(최신순).
	fun getHistory(username: String): List<QuizHistoryItemResponse> =
		quizRepository.findByUser_UsernameOrderByCreatedAtDesc(username).map { quiz ->
			val options = quizOptionRepository.findByQuizIdOrderByPositionAsc(requireNotNull(quiz.id))
			val correctOption = options.first { it.isCorrect }
			val answered = quiz.answeredOptionId != null
			QuizHistoryItemResponse(
				id = requireNotNull(quiz.id),
				targetStatKey = quiz.targetStatKey,
				question = quiz.question,
				options = options.map { PersonalizedQuizOptionResponse(requireNotNull(it.id), it.position, it.label) },
				answered = answered,
				answeredOptionId = quiz.answeredOptionId,
				correct = if (answered) quiz.answeredOptionId == correctOption.id else null,
				correctOptionId = if (answered) correctOption.id else null,
				explanation = if (answered) quiz.explanation else null,
				sourceOrgName = quiz.sourceOrgName,
				sourceTitle = quiz.sourceTitle,
				sourcePageStart = quiz.sourcePageStart,
				sourcePageEnd = quiz.sourcePageEnd,
				sourceSessionId = quiz.sourceSessionId,
				createdAt = quiz.createdAt,
			)
		}

	@Transactional
	fun answer(username: String, quizId: UUID, selectedOptionId: UUID): QuizAnswerResponse {
		val quiz = quizRepository.findById(quizId)
			.orElseThrow { ResponseStatusException(HttpStatus.NOT_FOUND, "문제를 찾을 수 없어요") }
		if (quiz.user.username != username) {
			throw ResponseStatusException(HttpStatus.FORBIDDEN, "이 문제에 접근할 수 없어요")
		}
		val options = quizOptionRepository.findByQuizIdOrderByPositionAsc(quizId)
		val selected = options.find { it.id == selectedOptionId }
			?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "잘못된 보기예요")
		val correctOption = options.first { it.isCorrect }
		quiz.answeredOptionId = selected.id
		quizRepository.save(quiz)
		return QuizAnswerResponse(
			correct = selected.isCorrect,
			correctOptionId = requireNotNull(correctOption.id),
			explanation = quiz.explanation,
		)
	}

}

private fun PersonalizedQuiz.toResponse(options: List<PersonalizedQuizOption>) = PersonalizedQuizResponse(
	id = requireNotNull(id),
	targetStatKey = targetStatKey,
	question = question,
	options = options.map { PersonalizedQuizOptionResponse(requireNotNull(it.id), it.position, it.label) },
	sourceOrgName = sourceOrgName,
	sourceTitle = sourceTitle,
	sourcePageStart = sourcePageStart,
	sourcePageEnd = sourcePageEnd,
	sourceSessionId = sourceSessionId,
	createdAt = createdAt,
)
