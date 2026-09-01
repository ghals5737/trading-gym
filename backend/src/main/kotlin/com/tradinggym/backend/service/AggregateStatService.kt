package com.tradinggym.backend.service

import com.tradinggym.backend.dto.AggregateStatCategoryResponse
import com.tradinggym.backend.dto.AggregateStatResponse
import com.tradinggym.backend.dto.StatCategoryScoreResponse
import com.tradinggym.backend.dto.StatOverviewResponse
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

	// 소스 2개를 합쳐서 지표별 평균을 냄(회의 결정: 모의고사·퀴즈 각각 스탯을 뽑고 평균):
	//  1) session_stats — 모의고사가 끝날 때마다 AI가 채점한 8개 지표
	//  2) 오늘의 PT 퀴즈 — 문제마다 겨냥한 지표(targetStatKey)가 있어서, 정답이면 100점
	//     오답이면 20점짜리 표본으로 취급(0점이 아닌 이유: 풀었다는 것 자체가 학습 신호라서).
	// 전용 캐시 테이블 없이 매 요청마다 라이브로 계산하는 방식 유지.
	fun getMyAggregateStats(username: String): List<AggregateStatResponse> {
		data class Sample(val score: Int, val note: String, val fromQuiz: Boolean)

		val samples = mutableMapOf<SessionStatKey, MutableList<Sample>>()

		// 소스 1: 모의고사 채점(시간순 — 마지막 표본이 가장 최근)
		for (stat in sessionStatRepository.findBySession_User_UsernameOrderByComputedAtAsc(username)) {
			samples.getOrPut(stat.statKey) { mutableListOf() } += Sample(stat.scorePct, stat.note, fromQuiz = false)
		}

		// 소스 2: 답을 제출한 퀴즈(최신순 반환이라 뒤집어서 시간순으로)
		for (quiz in quizRepository.findByUser_UsernameOrderByCreatedAtDesc(username).reversed()) {
			val answeredId = quiz.answeredOptionId ?: continue
			val options = quizOptionRepository.findByQuizIdOrderByPositionAsc(requireNotNull(quiz.id))
			val correct = options.firstOrNull { it.isCorrect }?.id == answeredId
			samples.getOrPut(quiz.targetStatKey) { mutableListOf() } += Sample(
				score = if (correct) QUIZ_CORRECT_SCORE else QUIZ_WRONG_SCORE,
				note = if (correct) "오늘의 PT 퀴즈를 맞혔어요" else "오늘의 PT 퀴즈를 틀렸어요 — 해설을 다시 읽어보세요",
				fromQuiz = true,
			)
		}

		return samples.map { (statKey, list) ->
			AggregateStatResponse(
				statKey = statKey,
				avgScorePct = list.map { it.score }.average().roundToInt(),
				sessionCount = list.count { !it.fromQuiz },
				quizCount = list.count { it.fromQuiz },
				latestNote = list.last().note,
			)
		}
	}

	// 8개 세부 지표(퀴즈 반영 평균)를 3개 카테고리로 묶은 평균 — 대시보드 티어 등이 씀.
	// session_stat_categories(세션 종료 시점 스냅샷)를 직접 읽지 않고 매번 다시 계산하는
	// 이유(ksj): 퀴즈를 새로 맞힐 때마다 카테고리 점수도 같이 움직이게 하려는 것.
	// 매핑은 SessionStatCategoryMapper 한 곳(hhm 규칙 — 도박성은 침착성에만).
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

	// 8개 세부 지표를 3개 대분류(정확성/침착성/공격성)로 묶은 개요 + 한 줄 요약.
	// 데이터가 하나도 없으면 null(프론트는 빈 상태 안내).
	fun getMyStatOverview(username: String): StatOverviewResponse? {
		val stats = getMyAggregateStats(username)
		if (stats.isEmpty()) return null
		val byKey = stats.associateBy { it.statKey }

		val categories = StatCategoryCatalog.DEFINITIONS.map { def ->
			val memberScores = def.memberKeys.mapNotNull { byKey[it]?.avgScorePct }
			val raw = if (memberScores.isEmpty()) 50.0 else memberScores.average()
			StatCategoryScoreResponse(
				category = def.category.name,
				label = def.label,
				scorePct = (if (def.reversed) 100.0 - raw else raw).roundToInt(),
				description = def.description,
				higherIsBetter = def.higherIsBetter,
				memberKeys = def.memberKeys,
				reversed = def.reversed,
			)
		}

		return StatOverviewResponse(
			summaryText = buildSummaryText(categories),
			categories = categories,
			stats = stats,
		)
	}

	// 카테고리 점수로 만드는 규칙 기반 한 줄 요약 — 마이페이지 "투자성향 간단 요약" 용도.
	private fun buildSummaryText(categories: List<StatCategoryScoreResponse>): String {
		val accuracy = categories.first { it.category == "ACCURACY" }.scorePct
		val composure = categories.first { it.category == "COMPOSURE" }.scorePct
		val aggressiveness = categories.first { it.category == "AGGRESSIVENESS" }.scorePct

		val strength = if (accuracy >= composure) "정확성" else "침착성"
		val weakness = if (accuracy < composure) "정확성" else "침착성"
		val strengthScore = maxOf(accuracy, composure)
		val weaknessScore = minOf(accuracy, composure)

		val styleText = when {
			aggressiveness >= 65 -> "위험을 크게 잡는 공격적인 스타일"
			aggressiveness >= 35 -> "위험을 적당히 잡는 균형 잡힌 스타일"
			else -> "위험을 작게 잡는 신중한 스타일"
		}
		val habitText = when {
			weaknessScore >= 70 -> "${strength}·${weakness} 모두 안정적이에요."
			strengthScore - weaknessScore >= 15 -> "${strength}(${strengthScore}점)은 강점이지만 ${weakness}(${weaknessScore}점)이 아직 약한 편이에요."
			else -> "${strength}(${strengthScore}점)과 ${weakness}(${weaknessScore}점) 모두 연습이 더 필요해요."
		}
		return "$styleText(공격성 ${aggressiveness}점)이고, $habitText"
	}

	companion object {
		private const val QUIZ_CORRECT_SCORE = 100
		private const val QUIZ_WRONG_SCORE = 20
	}
}
