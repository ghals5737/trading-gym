package com.tradinggym.backend.service

import com.tradinggym.backend.entity.AgeBand
import com.tradinggym.backend.entity.InvestorInfoHabitLevel
import com.tradinggym.backend.entity.InvestorKnowledgeLevel
import com.tradinggym.backend.entity.InvestorProfile
import com.tradinggym.backend.entity.InvestorProfileType
import com.tradinggym.backend.entity.UserEntity
import com.tradinggym.backend.repository.InvestorProfileRepository
import com.tradinggym.backend.repository.UserJpaRepository
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Component

// "내 또래 대비 투자성향" 비교(UserService.getPeerComparison)가 데모에서 빈 화면이 되지
// 않도록, 나이대별 또래 사용자 + 온보딩 진단 결과를 미리 채워두는 시더.
// 점수 분포는 실제 온보딩 채점 범위(리스크 5문항 합산)에 맞춘 그럴듯한 값 — 20대만
// 살짝 공격적으로 몰아둬서(빚투·레버리지 문제의식과 일치) 비교 문구가 자연스럽게 나옴.
// peer 계정은 로그인 대상이 아니라 통계 전용(비밀번호는 무작위성 없는 고정값이지만 데모 한정).
@Component
class PeerProfileSeeder(
	private val userJpaRepository: UserJpaRepository,
	private val investorProfileRepository: InvestorProfileRepository,
	private val passwordEncoder: PasswordEncoder,
) : ApplicationRunner {

	override fun run(args: ApplicationArguments) {
		if (userJpaRepository.existsByUsername("peer-20-1")) return // 이미 시드됨

		val peers = listOf(
			// (username, ageBand, riskTotal) — riskTotal ≤10 안정형 / ≤15 중립형 / 16+ 공격형
			Triple("peer-10-1", AgeBand.TEENS, 9),
			Triple("peer-10-2", AgeBand.TEENS, 13),
			Triple("peer-20-1", AgeBand.TWENTIES, 12),
			Triple("peer-20-2", AgeBand.TWENTIES, 15),
			Triple("peer-20-3", AgeBand.TWENTIES, 17),
			Triple("peer-20-4", AgeBand.TWENTIES, 10),
			Triple("peer-30-1", AgeBand.THIRTIES, 11),
			Triple("peer-30-2", AgeBand.THIRTIES, 14),
			Triple("peer-30-3", AgeBand.THIRTIES, 9),
			Triple("peer-40-1", AgeBand.FORTIES, 8),
			Triple("peer-40-2", AgeBand.FORTIES, 12),
			Triple("peer-50-1", AgeBand.FIFTIES_PLUS, 7),
			Triple("peer-50-2", AgeBand.FIFTIES_PLUS, 10),
		)

		val passwordHash = passwordEncoder.encode("peer-seed-only")
		for ((username, ageBand, riskTotal) in peers) {
			val user = userJpaRepository.save(
				UserEntity(username = username, passwordHash = passwordHash).apply { this.ageBand = ageBand },
			)
			// 문항별 점수는 합계만 의미 있게 대략 배분(리스크 5문항). 비교에 쓰는 건 riskTotalScore 하나.
			val per = riskTotal / 5
			val remainder = riskTotal - per * 4
			investorProfileRepository.save(
				InvestorProfile(
					user = user,
					investmentPurposeScore = per,
					experienceLevelScore = 2,
					lossReactionScore = per,
					riskPreferenceScore = per,
					investmentHorizonScore = per,
					knowledgeCheckScore = 2,
					leverageAttitudeScore = remainder,
					liquidationUnderstandingScore = 2,
					infoSourceScore = 2,
					tipVerificationScore = 2,
					riskTotalScore = riskTotal,
					knowledgeTotalScore = 6,
					infoHabitTotalScore = 4,
					profileType = when {
						riskTotal <= 10 -> InvestorProfileType.STABLE
						riskTotal <= 15 -> InvestorProfileType.NEUTRAL
						else -> InvestorProfileType.AGGRESSIVE
					},
					knowledgeLevel = InvestorKnowledgeLevel.BEGINNER,
					infoHabitLevel = InvestorInfoHabitLevel.MIXED,
					explanationText = "또래 비교 통계용 시드 프로필이에요.",
				),
			)
		}
	}
}
