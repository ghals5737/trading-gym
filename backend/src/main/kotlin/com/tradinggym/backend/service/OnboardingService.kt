package com.tradinggym.backend.service

import com.tradinggym.backend.dto.InvestorProfileResponse
import com.tradinggym.backend.dto.OnboardingOptionResponse
import com.tradinggym.backend.dto.OnboardingQuestionResponse
import com.tradinggym.backend.dto.SaveAnswerRequest
import com.tradinggym.backend.dto.SavedAnswerResponse
import com.tradinggym.backend.dto.SubmitOnboardingResponse
import com.tradinggym.backend.entity.InvestorInfoHabitLevel
import com.tradinggym.backend.entity.InvestorKnowledgeLevel
import com.tradinggym.backend.entity.InvestorProfile
import com.tradinggym.backend.entity.InvestorProfileType
import com.tradinggym.backend.entity.OnboardingAxis
import com.tradinggym.backend.entity.OnboardingConversationTurn
import com.tradinggym.backend.entity.OnboardingQuestionId
import com.tradinggym.backend.repository.InvestorProfileRepository
import com.tradinggym.backend.repository.OnboardingConversationTurnRepository
import com.tradinggym.backend.service.ai.ConversationAnalyzer
import com.tradinggym.backend.service.ai.ConversationTurnInput
import com.tradinggym.backend.user.UserJpaRepository
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

@Service
class OnboardingService(
	private val userJpaRepository: UserJpaRepository,
	private val investorProfileRepository: InvestorProfileRepository,
	private val onboardingConversationTurnRepository: OnboardingConversationTurnRepository,
	private val conversationAnalyzer: ConversationAnalyzer,
) {

	fun getQuestions(): List<OnboardingQuestionResponse> = QUESTIONS

	// 채팅 도중 나가고 다시 들어와도 이어서 할 수 있게, 지금까지 답한 원문을 돌려줌.
	fun getProgress(username: String): List<SavedAnswerResponse> {
		val user = requireUser(username)
		return onboardingConversationTurnRepository.findByUserId(requireNotNull(user.id)).map {
			SavedAnswerResponse(questionId = it.questionId, rawAnswerText = it.rawAnswerText)
		}
	}

	// 문항 하나의 자유 텍스트 답을 그대로 저장(upsert) — 채점은 여기서 안 함. AI 호출 없이
	// DB 쓰기만 하니 빠르고, 채팅이 매 턴 끊기지 않고 자연스럽게 이어짐.
	@Transactional
	fun saveAnswer(username: String, request: SaveAnswerRequest): SavedAnswerResponse {
		if (request.rawText.isBlank()) {
			throw ResponseStatusException(HttpStatus.BAD_REQUEST, "답변을 입력해주세요")
		}
		// 너무 긴 입력은 최종 분석 프롬프트에 그대로 다 들어가서 토큰을 많이 먹음 — 애초에 막음.
		if (request.rawText.length > MAX_ANSWER_LENGTH) {
			throw ResponseStatusException(HttpStatus.BAD_REQUEST, "답변이 너무 길어요. ${MAX_ANSWER_LENGTH}자 이내로 조금 더 간단하게 말씀해주세요")
		}
		val user = requireUser(username)
		val question = QUESTIONS.find { it.id == request.questionId }
			?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "알 수 없는 문항이에요")

		val userId = requireNotNull(user.id)
		val turn = onboardingConversationTurnRepository.findByUserIdAndQuestionId(userId, question.id)
			?: OnboardingConversationTurn(user = user, questionId = question.id, rawAnswerText = request.rawText)
		turn.rawAnswerText = request.rawText
		onboardingConversationTurnRepository.save(turn)

		return SavedAnswerResponse(questionId = question.id, rawAnswerText = request.rawText)
	}

	// 6문항이 다 모이면 대화 전체를 AI에 한 번에 넘겨서 채점+설명을 같이 받고, 그 채점을
	// 룰(sumByAxis + classify*)로 최종 판정함 — AI는 "해석"만, 최종 판정은 여전히 설명 가능한 룰 기반.
	// 재진단이면 investor_profiles 기존 행을 갱신(히스토리 안 남김). 원문 대화(conversation_turns)는
	// 안 지움 — 나중에 이 사람 유형을 다시 뽑아내고 싶을 때 원본이 있어야 해서.
	@Transactional
	fun submitOnboarding(username: String): SubmitOnboardingResponse {
		val user = requireUser(username)
		val userId = requireNotNull(user.id)
		val turnsByQuestion = onboardingConversationTurnRepository.findByUserId(userId).associateBy { it.questionId }

		val questionIds = OnboardingQuestionId.entries.toSet()
		if (turnsByQuestion.keys != questionIds) {
			throw ResponseStatusException(HttpStatus.BAD_REQUEST, "아직 모든 문항에 답하지 않았어요")
		}

		val turnInputs = QUESTIONS.map { question ->
			ConversationTurnInput(question = question, rawAnswerText = turnsByQuestion.getValue(question.id).rawAnswerText)
		}
		val analysis = conversationAnalyzer.analyze(turnInputs)

		// 답변이 그 문항이랑 아예 무관해 보이면 최종 판정을 안 만들고, 그 문항 답만 지워서
		// (getProgress에서 안 보이게 돼) 프론트가 기존 이어하기 로직으로 자연스럽게 재질문하게 함.
		if (analysis.unclearQuestionIds.isNotEmpty()) {
			analysis.unclearQuestionIds.forEach { questionId ->
				turnsByQuestion[questionId]?.let { onboardingConversationTurnRepository.delete(it) }
			}
			return SubmitOnboardingResponse(profile = null, questionsToRetry = analysis.unclearQuestionIds.toList())
		}

		val scoresByQuestion = analysis.scoresByQuestion
		val riskScore = sumByAxis(scoresByQuestion, OnboardingAxis.RISK)
		val knowledgeScore = sumByAxis(scoresByQuestion, OnboardingAxis.KNOWLEDGE)
		val infoHabitScore = sumByAxis(scoresByQuestion, OnboardingAxis.INFO_HABIT)
		val profileType = classifyRisk(riskScore)
		val knowledgeLevel = classifyKnowledge(knowledgeScore)
		val infoHabitLevel = classifyInfoHabit(infoHabitScore)

		val profile = investorProfileRepository.findByUserId(userId) ?: InvestorProfile(
			user = user,
			investmentPurposeScore = 0,
			experienceLevelScore = 0,
			lossReactionScore = 0,
			riskPreferenceScore = 0,
			investmentHorizonScore = 0,
			knowledgeCheckScore = 0,
			leverageAttitudeScore = 0,
			liquidationUnderstandingScore = 0,
			infoSourceScore = 0,
			tipVerificationScore = 0,
			riskTotalScore = 0,
			knowledgeTotalScore = 0,
			infoHabitTotalScore = 0,
			profileType = profileType,
			knowledgeLevel = knowledgeLevel,
			infoHabitLevel = infoHabitLevel,
			explanationText = analysis.explanationText,
		)
		profile.investmentPurposeScore = scoresByQuestion.getValue(OnboardingQuestionId.INVESTMENT_PURPOSE)
		profile.experienceLevelScore = scoresByQuestion.getValue(OnboardingQuestionId.EXPERIENCE_LEVEL)
		profile.lossReactionScore = scoresByQuestion.getValue(OnboardingQuestionId.LOSS_REACTION)
		profile.riskPreferenceScore = scoresByQuestion.getValue(OnboardingQuestionId.RISK_PREFERENCE)
		profile.investmentHorizonScore = scoresByQuestion.getValue(OnboardingQuestionId.INVESTMENT_HORIZON)
		profile.knowledgeCheckScore = scoresByQuestion.getValue(OnboardingQuestionId.KNOWLEDGE_CHECK)
		profile.leverageAttitudeScore = scoresByQuestion.getValue(OnboardingQuestionId.LEVERAGE_ATTITUDE)
		profile.liquidationUnderstandingScore = scoresByQuestion.getValue(OnboardingQuestionId.LIQUIDATION_UNDERSTANDING)
		profile.infoSourceScore = scoresByQuestion.getValue(OnboardingQuestionId.INFO_SOURCE)
		profile.tipVerificationScore = scoresByQuestion.getValue(OnboardingQuestionId.TIP_VERIFICATION)
		profile.riskTotalScore = riskScore
		profile.knowledgeTotalScore = knowledgeScore
		profile.infoHabitTotalScore = infoHabitScore
		profile.profileType = profileType
		profile.knowledgeLevel = knowledgeLevel
		profile.infoHabitLevel = infoHabitLevel
		profile.explanationText = analysis.explanationText

		val saved = investorProfileRepository.save(profile).toResponse()
		return SubmitOnboardingResponse(profile = saved, questionsToRetry = null)
	}

	fun getMyProfile(username: String): InvestorProfileResponse? =
		investorProfileRepository.findByUserId(requireNotNull(requireUser(username).id))?.toResponse()

	private fun requireUser(username: String) =
		userJpaRepository.findByUsername(username)
			?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "사용자를 찾을 수 없습니다")

	private fun sumByAxis(scoresByQuestion: Map<OnboardingQuestionId, Int>, axis: OnboardingAxis): Int =
		OnboardingQuestionId.entries.filter { it.axis == axis }.sumOf { scoresByQuestion.getValue(it) }

	// 리스크 문항 5개(투자목적/손실반응/수익리스크선호/투자기간/신용거래태도) × 1~4점 = 5~20점
	private fun classifyRisk(riskScore: Int): InvestorProfileType = when {
		riskScore <= 10 -> InvestorProfileType.STABLE
		riskScore <= 15 -> InvestorProfileType.NEUTRAL
		else -> InvestorProfileType.AGGRESSIVE
	}

	// 지식 문항 3개(투자경험/개념이해도/반대매매이해도) × 1~4점 = 3~12점
	private fun classifyKnowledge(knowledgeScore: Int): InvestorKnowledgeLevel = when {
		knowledgeScore <= 5 -> InvestorKnowledgeLevel.BEGINNER
		knowledgeScore <= 9 -> InvestorKnowledgeLevel.INTERMEDIATE
		else -> InvestorKnowledgeLevel.ADVANCED
	}

	// 정보습관 문항 2개(정보출처/추천검증습관) × 1~4점 = 2~8점 — 점수가 높을수록
	// SNS·리딩방 같은 미검증 정보에 더 의존한다는 뜻(트레이딩 짐이 원래 겨냥하는 위험 신호).
	private fun classifyInfoHabit(infoHabitScore: Int): InvestorInfoHabitLevel = when {
		infoHabitScore <= 3 -> InvestorInfoHabitLevel.INDEPENDENT
		infoHabitScore <= 6 -> InvestorInfoHabitLevel.MIXED
		else -> InvestorInfoHabitLevel.DEPENDENT
	}

	companion object {
		private const val MAX_ANSWER_LENGTH = 300

		private val QUESTIONS = listOf(
			OnboardingQuestionResponse(
				id = OnboardingQuestionId.INVESTMENT_PURPOSE,
				text = "투자를 시작하려는 가장 큰 목적은 무엇인가요?",
				options = listOf(
					OnboardingOptionResponse(1, "원금 보전이 최우선이에요"),
					OnboardingOptionResponse(2, "예금보다 조금 더 벌고 싶어요"),
					OnboardingOptionResponse(3, "목돈을 빠르게 불리고 싶어요"),
					OnboardingOptionResponse(4, "고수익을 노리고 적극적으로 투자하고 싶어요"),
				),
			),
			OnboardingQuestionResponse(
				id = OnboardingQuestionId.EXPERIENCE_LEVEL,
				text = "투자 경험이 얼마나 되나요?",
				options = listOf(
					OnboardingOptionResponse(1, "전혀 없어요"),
					OnboardingOptionResponse(2, "1년 미만이에요"),
					OnboardingOptionResponse(3, "1~3년 정도예요"),
					OnboardingOptionResponse(4, "3년 이상, 여러 사이클을 겪어봤어요"),
				),
			),
			OnboardingQuestionResponse(
				id = OnboardingQuestionId.LOSS_REACTION,
				text = "보유 종목이 -10% 났을 때 어떻게 하는 편인가요?",
				options = listOf(
					OnboardingOptionResponse(1, "바로 손절해서 손실을 확정지어요"),
					OnboardingOptionResponse(2, "일단 지켜보면서 상황을 판단해요"),
					OnboardingOptionResponse(3, "오히려 물타기(추가매수) 기회로 봐요"),
					OnboardingOptionResponse(4, "손실은 감수하고 더 공격적으로 대응해요"),
				),
			),
			OnboardingQuestionResponse(
				id = OnboardingQuestionId.RISK_PREFERENCE,
				text = "수익과 리스크, 어느 쪽에 더 끌리나요?",
				options = listOf(
					OnboardingOptionResponse(1, "낮아도 안정적인 수익이 좋아요"),
					OnboardingOptionResponse(2, "약간의 리스크는 감수할 수 있어요"),
					OnboardingOptionResponse(3, "변동성이 커도 고수익을 원해요"),
					OnboardingOptionResponse(4, "리스크가 클수록 오히려 끌려요"),
				),
			),
			OnboardingQuestionResponse(
				id = OnboardingQuestionId.INVESTMENT_HORIZON,
				text = "투자할 돈을 얼마나 오래 묶어둘 수 있나요?",
				options = listOf(
					OnboardingOptionResponse(1, "1년 이내에 쓸 돈이에요"),
					OnboardingOptionResponse(2, "1~3년 정도는 묶어둘 수 있어요"),
					OnboardingOptionResponse(3, "3~5년까지는 여유 있어요"),
					OnboardingOptionResponse(4, "5년 이상 장기로 볼 수 있어요"),
				),
			),
			// 자기신고식 경험(EXPERIENCE_LEVEL)과 달리, 실제로 아는 개념 수준을 직접 확인하는 문항.
			OnboardingQuestionResponse(
				id = OnboardingQuestionId.KNOWLEDGE_CHECK,
				text = "투자 관련해서 지금 어느 정도까지 알고 계세요? 아는 만큼 편하게 말씀해주세요",
				options = listOf(
					OnboardingOptionResponse(1, "주식이 뭔지 정도만 알아요"),
					OnboardingOptionResponse(2, "매수·매도, 시장가·지정가 정도는 구분할 수 있어요"),
					OnboardingOptionResponse(3, "손절, 레버리지, 분산투자 같은 개념도 알아요"),
					OnboardingOptionResponse(4, "반대매매, PER·PBR 같은 지표까지 이해하고 있어요"),
				),
			),
			// 리스크 성향 축 — 이 서비스의 핵심 기능(신용거래 시뮬레이션)과 직결되는 태도를 직접 물어봄.
			OnboardingQuestionResponse(
				id = OnboardingQuestionId.LEVERAGE_ATTITUDE,
				text = "빚을 내서(신용거래로) 투자하는 것에 대해 어떻게 생각하세요?",
				options = listOf(
					OnboardingOptionResponse(1, "위험해서 절대 안 쓸 것 같아요"),
					OnboardingOptionResponse(2, "꼭 필요하면 아주 조금은 고려해볼 수 있어요"),
					OnboardingOptionResponse(3, "수익을 늘리려면 어느 정도는 써야 한다고 생각해요"),
					OnboardingOptionResponse(4, "기회만 되면 적극적으로 활용하고 싶어요"),
				),
			),
			// 지식 축 — 자기신고(EXPERIENCE_LEVEL)·일반개념(KNOWLEDGE_CHECK)과 달리, 이 서비스의
			// 핵심 시나리오(담보비율 미달 → 반대매매)를 실제로 이해하는지 직접 확인.
			OnboardingQuestionResponse(
				id = OnboardingQuestionId.LIQUIDATION_UNDERSTANDING,
				text = "신용거래로 주식을 샀는데 주가가 많이 떨어지면 어떤 일이 생기는지 아세요?",
				options = listOf(
					OnboardingOptionResponse(1, "잘 모르겠어요"),
					OnboardingOptionResponse(2, "손실이 커진다는 정도는 알아요"),
					OnboardingOptionResponse(3, "증거금이 부족해지면 문제가 생긴다는 것까진 알아요"),
					OnboardingOptionResponse(4, "담보비율이 기준 밑으로 떨어지면 반대매매로 강제로 팔린다는 것까지 알아요"),
				),
			),
			// 정보습관 축 — "SNS·리딩방 정보에 의존해 뛰어드는 사회초년생"이라는 이 서비스의
			// 출발점이 된 문제의식을 직접 겨냥한 문항 2개.
			OnboardingQuestionResponse(
				id = OnboardingQuestionId.INFO_SOURCE,
				text = "투자 정보나 종목 추천을 주로 어디서 얻으세요?",
				options = listOf(
					OnboardingOptionResponse(1, "직접 공시나 재무제표를 찾아봐요"),
					OnboardingOptionResponse(2, "뉴스나 증권사 리포트를 봐요"),
					OnboardingOptionResponse(3, "유튜브나 온라인 커뮤니티를 참고해요"),
					OnboardingOptionResponse(4, "SNS나 리딩방(투자 추천방) 정보를 많이 봐요"),
				),
			),
			OnboardingQuestionResponse(
				id = OnboardingQuestionId.TIP_VERIFICATION,
				text = "누가 \"이 종목 곧 오른다\"고 하면 보통 어떻게 하세요?",
				options = listOf(
					OnboardingOptionResponse(1, "직접 재무·기업 정보부터 찾아봐요"),
					OnboardingOptionResponse(2, "다른 자료로 한 번 더 확인해봐요"),
					OnboardingOptionResponse(3, "일리 있어 보이면 소액이라도 따라 사요"),
					OnboardingOptionResponse(4, "믿을만한 사람이면 바로 따라 사요"),
				),
			),
		)
	}
}

private fun InvestorProfile.toResponse() = InvestorProfileResponse(
	id = requireNotNull(id),
	profileType = profileType,
	riskTotalScore = riskTotalScore,
	knowledgeLevel = knowledgeLevel,
	knowledgeTotalScore = knowledgeTotalScore,
	infoHabitLevel = infoHabitLevel,
	infoHabitTotalScore = infoHabitTotalScore,
	explanationText = explanationText,
	createdAt = createdAt,
)
