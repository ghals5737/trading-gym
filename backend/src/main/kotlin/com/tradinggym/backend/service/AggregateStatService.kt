package com.tradinggym.backend.service

import com.tradinggym.backend.dto.AggregateStatCategoryResponse
import com.tradinggym.backend.dto.AggregateStatResponse
import com.tradinggym.backend.entity.SessionStatKey
import com.tradinggym.backend.repository.PersonalizedQuizOptionRepository
import com.tradinggym.backend.repository.PersonalizedQuizRepository
import com.tradinggym.backend.repository.SessionStatRepository
import org.springframework.stereotype.Service
import kotlin.math.roundToInt

@Service
class AggregateStatService(
	private val sessionStatRepository: SessionStatRepository,
	private val quizRepository: PersonalizedQuizRepository,
	private val quizOptionRepository: PersonalizedQuizOptionRepository,
) {

	// session_stats(모의투자 채점) 점수들에 퀴즈 정답률까지 가중평균으로 합침 —
	// "오늘의 PT" 문제를 맞히면 그 지표 평균이 올라가서 다음 약점 판정
	// (QuizGenerationService.generateForUser)에도 실제로 반영되고, /my 스탯 탭·대시보드
	// (getMyAggregateStatCategories가 이 메서드 결과를 그대로 씀)에도 그대로 보임.
	fun getMyAggregateStats(username: String): List<AggregateStatResponse> {
		val sessionScoresByKey = sessionStatRepository.findBySession_User_UsernameOrderByComputedAtAsc(username)
			.groupBy({ it.statKey }, { it.scorePct })
		val quizSamplesByKey = quizSamplesByStatKey(username)
		val statKeys = sessionScoresByKey.keys + quizSamplesByKey.keys
		return statKeys.map { statKey ->
			val sessionScores = sessionScoresByKey[statKey].orEmpty()
			val quizSamples = quizSamplesByKey[statKey].orEmpty()
			val weightedSum = sessionScores.sumOf { it.toDouble() } + quizSamples.sumOf { it.toDouble() } * QUIZ_SAMPLE_WEIGHT
			val weightedCount = sessionScores.size + quizSamples.size * QUIZ_SAMPLE_WEIGHT
			AggregateStatResponse(
				statKey = statKey,
				avgScorePct = (weightedSum / weightedCount).roundToInt(),
				sessionCount = sessionScores.size,
			)
		}
	}

	// getMyAggregateStats(퀴즈 정답 반영된 8개 세부 지표)를 SessionStatCategoryMapper로
	// 묶은 3개 성향 카테고리 평균 — session_stat_categories(세션 종료 시점 스냅샷)를 직접
	// 읽지 않고 매번 다시 계산함, 퀴즈를 새로 맞힐 때마다 카테고리 점수도 같이 움직이게
	// 하려는 목적(세션이 하나도 안 늘어도 퀴즈만으로 갱신됨).
	fun getMyAggregateStatCategories(username: String): List<AggregateStatCategoryResponse> {
		val keyScores = getMyAggregateStats(username).associate { it.statKey to it.avgScorePct }
		val categoryScores = SessionStatCategoryMapper.computeCategoryScores(keyScores)
		val sessionCountByKey = sessionStatRepository.findBySession_User_UsernameOrderByComputedAtAsc(username)
			.groupingBy { it.statKey }.eachCount()
		return SessionStatCategoryMapper.KEYS_BY_CATEGORY.map { (category, keys) ->
			AggregateStatCategoryResponse(
				categoryKey = category,
				avgScorePct = categoryScores.getValue(category),
				sessionCount = keys.maxOfOrNull { sessionCountByKey[it] ?: 0 } ?: 0,
			)
		}
	}

	// 그 지표를 겨냥한, 이미 답한 퀴즈마다 정답=100/오답=0인 표본 하나 — session_stats처럼
	// 퀴즈 하나하나가 각자 표본이라 "많이 풀수록(맞힐수록) 영향력이 커짐"이 유지됨. 다만
	// 표본 하나당 무게는 QUIZ_SAMPLE_WEIGHT(<1)라 세션 표본보다는 항상 덜 흔듦 — 모의투자
	// 행동(session_stats)이 단순 지식 확인(퀴즈)보다 우선하도록.
	private fun quizSamplesByStatKey(username: String): Map<SessionStatKey, List<Int>> {
		val answered = quizRepository.findByUser_UsernameAndAnsweredOptionIdIsNotNull(username)
		if (answered.isEmpty()) return emptyMap()
		val correctOptionIdByQuizId = quizOptionRepository
			.findByQuizIdInAndIsCorrectTrue(answered.mapNotNull { it.id })
			.associate { it.quiz.id to it.id }
		return answered
			.groupBy { it.targetStatKey }
			.mapValues { (_, quizzes) ->
				quizzes.map { quiz -> if (quiz.answeredOptionId == correctOptionIdByQuizId[quiz.id]) 100 else 0 }
			}
	}

	companion object {
		// 세션 표본 1개의 무게를 1로 봤을 때 퀴즈 표본 1개의 무게 — 0.5면 퀴즈 하나가
		// 세션 하나의 절반만큼만 스탯을 밀어올림(모의투자 세션 기록의 우선순위를 지킴).
		// 표본 개수 자체는 안 줄이니, 퀴즈를 많이 맞힐수록 누적 영향력은 계속 커짐.
		private const val QUIZ_SAMPLE_WEIGHT = 0.5
	}
}
