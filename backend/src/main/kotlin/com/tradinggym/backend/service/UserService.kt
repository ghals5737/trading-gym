package com.tradinggym.backend.service

import com.tradinggym.backend.dto.AgeBandResponse
import com.tradinggym.backend.dto.PeerComparisonResponse
import com.tradinggym.backend.dto.ProductTourStatusResponse
import com.tradinggym.backend.dto.UpdateAgeBandRequest
import com.tradinggym.backend.entity.AgeBand
import com.tradinggym.backend.repository.InvestorProfileRepository
import com.tradinggym.backend.repository.UserJpaRepository
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

@Service
class UserService(
	private val userJpaRepository: UserJpaRepository,
	private val investorProfileRepository: InvestorProfileRepository,
) {

	fun getProductTourStatus(username: String): ProductTourStatusResponse =
		ProductTourStatusResponse(seen = requireUser(username).hasSeenProductTour)

	@Transactional
	fun markProductTourSeen(username: String): ProductTourStatusResponse {
		val user = requireUser(username)
		user.hasSeenProductTour = true
		userJpaRepository.save(user)
		return ProductTourStatusResponse(seen = true)
	}

	fun getAgeBand(username: String): AgeBandResponse = AgeBandResponse(ageBand = requireUser(username).ageBand)

	@Transactional
	fun updateAgeBand(username: String, request: UpdateAgeBandRequest): AgeBandResponse {
		val user = requireUser(username)
		user.ageBand = request.ageBand
		userJpaRepository.save(user)
		return AgeBandResponse(ageBand = user.ageBand)
	}

	// "내 또래 대비 투자성향" — 나이대를 안 알려줬거나 온보딩 진단이 없으면 null(프론트가
	// 섹션을 숨김). 또래가 한 명도 없으면 peerCount=0 + 비교 불가 안내 문구로 응답.
	// 사용자 수가 적은 데모 스코프라 전체 조회 후 메모리 필터(별도 집계 쿼리 없이).
	fun getPeerComparison(username: String): PeerComparisonResponse? {
		val user = requireUser(username)
		val ageBand = user.ageBand ?: return null
		val myProfile = investorProfileRepository.findByUserId(requireNotNull(user.id)) ?: return null

		val peerScores = investorProfileRepository.findAll()
			.filter { it.user.ageBand == ageBand && it.user.id != user.id }
			.map { it.riskTotalScore }

		val peerAvg = if (peerScores.isEmpty()) 0.0 else peerScores.average()
		val text = buildComparisonText(ageBand, myProfile.riskTotalScore, peerAvg, peerScores.size)
		return PeerComparisonResponse(
			ageBand = ageBand,
			myRiskScore = myProfile.riskTotalScore,
			myProfileType = myProfile.profileType,
			peerAvgRiskScore = peerAvg,
			peerCount = peerScores.size,
			comparisonText = text,
		)
	}

	private fun buildComparisonText(ageBand: AgeBand, myScore: Int, peerAvg: Double, peerCount: Int): String {
		val bandLabel = when (ageBand) {
			AgeBand.TEENS -> "10대"
			AgeBand.TWENTIES -> "20대"
			AgeBand.THIRTIES -> "30대"
			AgeBand.FORTIES -> "40대"
			AgeBand.FIFTIES_PLUS -> "50대 이상"
		}
		if (peerCount == 0) return "아직 같은 ${bandLabel} 사용자의 진단 데이터가 부족해서 또래 비교를 만들 수 없어요."
		val diff = myScore - peerAvg
		return when {
			diff >= 3 -> "내 또래(${bandLabel})에 비해 공격성이 높은 편이에요 — 수익 기회만큼 손실 위험도 크게 잡는 스타일이에요."
			diff >= 1 -> "내 또래(${bandLabel})보다 공격성이 약간 높은 편이에요."
			diff > -1 -> "내 또래(${bandLabel})와 비슷한 수준의 투자성향이에요."
			diff > -3 -> "내 또래(${bandLabel})보다 신중한 편이에요."
			else -> "내 또래(${bandLabel})에 비해 훨씬 신중한 투자성향이에요 — 안정성을 중시하는 스타일이에요."
		}
	}

	private fun requireUser(username: String) =
		userJpaRepository.findByUsername(username)
			?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "사용자를 찾을 수 없습니다")
}
