package com.tradinggym.backend.service.ai

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

// 기본 어댑터 — API 키 없이도 모의고사 퀴즈 화면이 항상 동작하게 한다.
// 문항 자체는 진단 패턴별 고정이지만, whyThisQuestion에 사용자가 실제로 쓴 메모를 넣고
// 근거 자료 연결·저장 경로는 LLM 경로와 완전히 동일하게 지나간다.
@Component
@ConditionalOnProperty(name = ["ai.provider"], havingValue = "stub", matchIfMissing = true)
class StubExamQuizGenerator : ExamQuizGenerator {

	override fun generate(input: ExamQuizInput): GeneratedExamQuiz {
		val bank = BANK[patternKeyOf(input.patternLabel)] ?: BANK.getValue("NO_RATIONALE")
		return GeneratedExamQuiz(
			question = bank.question,
			options = bank.options,
			correctIndex = bank.correctIndex,
			explanation = bank.explanation,
			whyThisQuestion = "${input.turnNo}턴에서 \"${input.memo.take(40)}…\"라고 적으셨어요. " +
				"그 판단의 근거를 다시 살펴보는 문제예요.",
		)
	}

	// 진단 라벨 → 문항 키. 서비스가 라벨만 넘기므로 여기서 역매핑한다.
	private fun patternKeyOf(label: String): String = when {
		label.contains("추격매수") -> "NEWS_CHASING"
		label.contains("군중심리") -> "HERD_FOLLOWING"
		label.contains("공포") -> "PANIC_SELL"
		label.contains("물타기") -> "LOSS_AVERSION"
		label.contains("공시") -> "DISCLOSURE_IGNORED"
		else -> "NO_RATIONALE"
	}

	private data class Item(
		val question: String,
		val options: List<String>,
		val correctIndex: Int,
		val explanation: String,
	)

	private companion object {
		val BANK = mapOf(
			"NEWS_CHASING" to Item(
				"리딩방이나 뉴스에서 \"지금이 마지막 기회\"라는 말을 들었을 때, 가장 먼저 해야 할 일은?",
				listOf(
					"남들보다 늦기 전에 일단 소액이라도 매수한다",
					"기업의 공시와 재무제표를 직접 확인해 그 주장에 근거가 있는지 본다",
					"차트가 우상향인지만 확인하고 판단한다",
					"커뮤니티에서 다른 사람들의 반응을 더 찾아본다",
				),
				1,
				"추천의 강도와 근거의 강도는 다릅니다. 급하게 결정하도록 압박하는 정보일수록 공시·재무 같은 1차 자료로 확인해야 해요.",
			),
			"HERD_FOLLOWING" to Item(
				"단기간에 급등한 테마주에서 \"다들 사고 있다\"는 이유로 매수할 때 가장 큰 위험은?",
				listOf(
					"거래량이 줄어 매도가 어려워진다",
					"테마와 실제 사업·매출의 연결고리가 약해 기대가 꺼지면 급락한다",
					"배당을 받지 못한다",
					"증권사 수수료가 더 비싸진다",
				),
				1,
				"테마 관련 매출이 전체의 일부에 불과한 경우가 많습니다. 기대감만으로 오른 가격은 기대가 사라지면 근거 없이 무너집니다.",
			),
			"PANIC_SELL" to Item(
				"시장 전체가 급락할 때, 보유 종목을 팔지 말지 판단하는 기준으로 가장 적절한 것은?",
				listOf(
					"오늘 하락률이 얼마인지",
					"커뮤니티 분위기가 얼마나 나쁜지",
					"그 기업의 재무 상태와 실적이 실제로 나빠졌는지",
					"주변 사람들이 팔았는지",
				),
				2,
				"시장 전체의 하락과 개별 기업의 가치 훼손은 다른 문제입니다. 재무가 멀쩡한데 분위기 때문에 파는 것이 가장 비싼 선택이 되곤 해요.",
			),
			"LOSS_AVERSION" to Item(
				"손실 중인 종목의 평균 단가를 낮추려고 추가 매수할 때 실제로 일어나는 일은?",
				listOf(
					"손실이 줄어들고 회복이 빨라진다",
					"투자 원금이 커져서 같은 하락률에도 손실 금액이 더 커진다",
					"평단가가 낮아지므로 위험도 함께 낮아진다",
					"세금이 줄어든다",
				),
				1,
				"평단가가 낮아지는 것과 위험이 줄어드는 것은 다릅니다. 하락에 근거가 있다면 추가 매수는 한 종목에 더 크게 베팅하는 셈이에요.",
			),
			"DISCLOSURE_IGNORED" to Item(
				"매수 전에 전자공시(DART)에서 확인해야 할 항목으로 가장 거리가 먼 것은?",
				listOf(
					"최근 매출과 영업이익 추이",
					"전환사채(CB) 등 잠재적 매도 물량",
					"최대주주·임원의 지분 매각 여부",
					"해당 종목의 오늘 실시간 검색어 순위",
				),
				3,
				"공시는 기업의 실제 상태를 담은 1차 자료입니다. 검색어 순위는 분위기일 뿐 기업 가치와 무관해요.",
			),
			"NO_RATIONALE" to Item(
				"투자 판단을 기록으로 남겨야 하는 가장 큰 이유는?",
				listOf(
					"세금 신고에 필요해서",
					"나중에 결과와 대조해 어떤 근거가 맞고 틀렸는지 배울 수 있어서",
					"증권사에 제출해야 해서",
					"수수료를 아낄 수 있어서",
				),
				1,
				"\"느낌\"으로 산 판단은 결과가 좋든 나쁘든 배울 게 남지 않습니다. 근거를 적어두면 그 근거가 맞았는지 검증할 수 있어요.",
			),
		)
	}
}
