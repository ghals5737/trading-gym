package com.tradinggym.backend.service.ai

import com.tradinggym.backend.dto.SessionStatScoreResponse
import com.tradinggym.backend.dto.SessionSummaryResponse
import com.tradinggym.backend.dto.TurnSummaryResponse
import com.tradinggym.backend.entity.SessionStatKey
import com.tradinggym.backend.entity.TradeSide

// 다섯 어댑터(SessionStatAnalyzer 구현체)가 공유하는 프롬프트 조립 + 응답 파싱 + 대체 채점.
object SessionStatAnalysisPrompt {

	fun build(summary: SessionSummaryResponse): String {
		val turnLines = summary.turns.joinToString("\n\n") { it.toPromptBlock() }
		val statLines = SessionStatKey.entries.joinToString("\n") { "${it.name}: <0~100 점수> | <한 문장 이유>" }

		return """
			너는 '트레이딩 짐'이라는 모의투자 교육 서비스의 AI 코치야. 사용자가 방금 끝낸 모의투자
			세션 하나를 턴 순서대로 아래에 줄게(관망한 턴도 포함, 각 매매마다 사용자가 직접 쓴
			이유 텍스트도 같이 있어). 이걸 다 읽고 8개 지표를 각각 0~100점으로 채점해줘.

			세션 요약: 시작자금 ${summary.startingCash}원, 최종자산 ${summary.finalPortfolioValue}원
			(수익률 ${summary.returnPct}%), 총 ${summary.turnCount}턴, 매매 ${summary.totalTradeCount}건
			(매수 ${summary.buyCount}/매도 ${summary.sellCount}), 관망 턴 ${summary.holdTurnCount}회,
			반대매매 ${summary.forcedLiquidationCount}회, 신용거래 ${summary.creditTradeCount}건,
			거래한 종목 수 ${summary.uniqueStockCount}개, 매수 중 공시확인 ${summary.disclosureCheckedBuyCount}건.
			미수금(신용매수 대출): ${if (summary.debtOverdue) "상환 기한(발생 후 10턴)을 넘김 — 규칙 위반" else "기한 초과 없음"},
			세션 종료 시점 미상환 잔액 ${summary.unpaidDebtAtEnd}원${if (summary.unpaidDebtAtEnd.signum() > 0) " (빚을 안 갚고 세션을 끝냄)" else ""}.
			미수금 기한 초과나 미상환 잔액이 있으면 RISK_MANAGEMENT_SCORE와 GAMBLING_SIGNAL을
			뚜렷하게 감점하고 그 이유에 명시해.

			턴별 기록:
			$turnLines

			아래 8개 지표를 각각 판단해서 채점해줘 — 전부 "값이 높을수록 바람직한 투자 습관"
			방향으로 통일해서 채점해(예: 위험 신호가 적으면 높은 점수). reasonText도 꼭 같이
			읽고 판단에 반영해:
			판단 정확도(JUDGMENT_ACCURACY), 공시 확인율(DISCLOSURE_CHECK_RATE),
			리스크 관리(RISK_MANAGEMENT_SCORE), 충동매매 억제(IMPULSIVE_TRADING),
			손실회피 성향 억제(LOSS_AVERSION), 확증편향 억제(CONFIRMATION_BIAS),
			분산투자(DIVERSIFICATION), 도박성 매매 신호 억제(GAMBLING_SIGNAL)

			아래 형식 그대로만, 8줄만 출력해(다른 말 절대 덧붙이지 마):
			$statLines
		""".trimIndent()
	}

	private fun TurnSummaryResponse.toPromptBlock(): String {
		val tradeLines = if (trades.isEmpty()) {
			"  (매매 없음)"
		} else {
			trades.joinToString("\n") { t ->
				val stock = t.stockName ?: "-"
				val detail = when (t.side) {
					TradeSide.HOLD -> "관망"
					else -> "${t.side} ${stock} ${t.quantity}주 @ ${t.price}원" +
						(if (t.isCredit) "(신용 ${t.leverageRatio}배)" else "") +
						(if (t.tradeType.name == "FORCED_LIQUIDATION") " [반대매매로 강제청산]" else "") +
						" · 공시확인 ${if (t.viewedDisclosure) "함" else "안함"}"
				}
				"  - $detail · 이유: \"${t.reasonText}\""
			}
		}
		return "[턴 ${turnNumber}] ${turnDate} (${action})\n$tradeLines"
	}

	// "KEY: 72 | 이유" 줄을 각 지표마다 관대하게 찾음. 8개 다 못 찾으면 파싱 실패로 보고
	// null(호출부가 fallbackResult로 대체).
	fun parse(rawResponse: String): List<SessionStatScoreResponse>? {
		val results = mutableListOf<SessionStatScoreResponse>()
		for (key in SessionStatKey.entries) {
			val match = Regex("${key.name}\\s*[:=]?\\s*(\\d{1,3})\\s*\\|\\s*(.+)").find(rawResponse) ?: continue
			val score = match.groupValues[1].toInt().coerceIn(0, 100)
			val note = match.groupValues[2].trim().ifBlank { "-" }
			results += SessionStatScoreResponse(statKey = key, scorePct = score, note = note)
		}
		if (results.size != SessionStatKey.entries.size) return null
		return results
	}

	// LLM 호출이 실패하거나 파싱이 안 될 때 — 숫자로 바로 계산 가능한 지표(공시확인율,
	// 분산투자, 반대매매 여부)는 여기서도 정확히 계산하고, reasonText 해석이 필요한 나머지는
	// 중립값(50)으로 채움("지금은 AI 분석을 못했어요" 성격의 대체값).
	fun fallbackResult(summary: SessionSummaryResponse): List<SessionStatScoreResponse> {
		val disclosureRate = if (summary.buyCount == 0) 50 else
			(summary.disclosureCheckedBuyCount * 100 / summary.buyCount)
		val diversification = (summary.uniqueStockCount * 25).coerceAtMost(100)
		val debtPenalty = (if (summary.debtOverdue) 30 else 0) + (if (summary.unpaidDebtAtEnd.signum() > 0) 20 else 0)
		val riskManagement = (100 - summary.forcedLiquidationCount * 40 - debtPenalty).coerceIn(0, 100)
		val gamblingSignal = (100 - summary.forcedLiquidationCount * 30 - summary.creditTradeCount * 5 - debtPenalty).coerceIn(0, 100)

		return listOf(
			SessionStatScoreResponse(SessionStatKey.JUDGMENT_ACCURACY, 50, "지금은 AI 분석을 만들지 못했어요"),
			SessionStatScoreResponse(SessionStatKey.DISCLOSURE_CHECK_RATE, disclosureRate, "매수 ${summary.buyCount}건 중 ${summary.disclosureCheckedBuyCount}건 공시 확인"),
			SessionStatScoreResponse(SessionStatKey.RISK_MANAGEMENT_SCORE, riskManagement, "반대매매 ${summary.forcedLiquidationCount}회" + (if (summary.debtOverdue) " · 미수금 상환 기한 초과" else "")),
			SessionStatScoreResponse(SessionStatKey.IMPULSIVE_TRADING, 50, "지금은 AI 분석을 만들지 못했어요"),
			SessionStatScoreResponse(SessionStatKey.LOSS_AVERSION, 50, "지금은 AI 분석을 만들지 못했어요"),
			SessionStatScoreResponse(SessionStatKey.CONFIRMATION_BIAS, 50, "지금은 AI 분석을 만들지 못했어요"),
			SessionStatScoreResponse(SessionStatKey.DIVERSIFICATION, diversification, "${summary.uniqueStockCount}개 종목 거래"),
			SessionStatScoreResponse(SessionStatKey.GAMBLING_SIGNAL, gamblingSignal, "반대매매 ${summary.forcedLiquidationCount}회 · 신용거래 ${summary.creditTradeCount}건"),
		)
	}
}
