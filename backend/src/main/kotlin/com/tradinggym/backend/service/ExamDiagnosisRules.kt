package com.tradinggym.backend.service

import com.tradinggym.backend.entity.ExamAction
import com.tradinggym.backend.entity.ExamDiagnosisSeverity

// 모의고사 응답 메모 → 행동 습관 진단 규칙.
//
// mock-exam/quizgen.py의 PATTERNS와 knowerbot-demo/lib/exam-diagnose.ts를 그대로 옮긴 것이다.
// 세 곳에 같은 규칙이 있는 게 이상적이진 않지만, 파이썬은 프로토타입/배치용, TS는 백엔드 없이
// 데모하기 위한 것, 여기가 실제 서비스 경로다. 규칙을 바꾸면 세 곳을 같이 고쳐야 한다.
//
// LLM이 아니라 규칙으로 판정하는 이유: "왜 그렇게 진단했는지"를 항상 설명할 수 있어야 하고
// (심사 방어), 같은 입력에 같은 결과가 나와야 재도전 전후 비교가 의미를 갖기 때문.
object ExamDiagnosisRules {

	data class Pattern(
		val key: String,
		val label: String,
		val keywords: List<String>,
		val actions: Set<ExamAction>,
		val ragQuery: String,
	)

	data class Evidence(
		val turnNo: Int,
		val stockName: String,
		val action: ExamAction,
		val matched: List<String>,
		val memo: String,
		val wasWrong: Boolean,
		val outcomeChangePct: Double,
	)

	data class Diagnosis(
		val patternKey: String,
		val label: String,
		val severity: ExamDiagnosisSeverity,
		val hitCount: Int,
		val evidence: List<Evidence>,
		val ragQuery: String,
	)

	// 진단 입력 — 엔티티에 직접 의존하지 않게 평평한 형태로 받는다(테스트하기 쉬움).
	data class Row(
		val turnNo: Int,
		val stockName: String,
		val action: ExamAction,
		val reasonMemo: String,
		val viewedDisclosure: Boolean,
		val isAligned: Boolean,
		val outcomeChangePct: Double,
	)

	private val PATTERNS = listOf(
		Pattern(
			"NEWS_CHASING", "뉴스·리딩방 보고 추격매수",
			listOf("리딩방", "추천", "마지막 기회", "지금 아니면", "실검", "수혜주", "테마"),
			setOf(ExamAction.BUY),
			"투자 정보를 검증하지 않고 추천만 믿고 매수하는 위험",
		),
		Pattern(
			"HERD_FOLLOWING", "남들 따라 사기(군중심리)",
			listOf("다들", "남들", "분위기", "뒤처", "인증", "1위", "너도나도"),
			setOf(ExamAction.BUY),
			"군중심리에 휩쓸린 투자와 과열된 테마주의 위험",
		),
		Pattern(
			"PANIC_SELL", "공포에 매도",
			listOf("무서", "불안", "더 떨어질", "겁", "폭락", "던지"),
			setOf(ExamAction.SELL),
			"시장이 급락할 때 공포에 파는 투자자의 심리와 대응",
		),
		Pattern(
			"LOSS_AVERSION", "손실 확정 회피·물타기",
			listOf("평단", "물타기", "추가매수", "버티", "손실이 확정", "본전"),
			setOf(ExamAction.BUY, ExamAction.HOLD),
			"손실이 났을 때 손절매 기준을 세우고 물타기를 피하는 방법",
		),
		Pattern(
			"NO_RATIONALE", "근거 없는 판단",
			listOf("느낌", "감으로", "그냥", "왠지", "찍", "몰라"),
			setOf(ExamAction.BUY, ExamAction.SELL, ExamAction.HOLD),
			"투자 판단의 기준을 세우고 계획적으로 투자하는 방법",
		),
	)

	private const val DISCLOSURE_KEY = "DISCLOSURE_IGNORED"
	private const val DISCLOSURE_LABEL = "공시 확인 없이 판단"
	private const val DISCLOSURE_QUERY = "재무제표와 공시를 확인하고 투자를 결정하는 방법"

	fun diagnose(rows: List<Row>): List<Diagnosis> {
		val found = mutableListOf<Diagnosis>()

		for (pattern in PATTERNS) {
			val evidence = rows
				.filter { it.action in pattern.actions }
				.mapNotNull { row ->
					val matched = pattern.keywords.filter { row.reasonMemo.contains(it) }
					if (matched.isEmpty()) null
					else Evidence(row.turnNo, row.stockName, row.action, matched,
						row.reasonMemo, !row.isAligned, row.outcomeChangePct)
				}
			if (evidence.isEmpty()) continue
			val wrong = evidence.count { it.wasWrong }
			found += Diagnosis(
				pattern.key, pattern.label,
				severityOf(wrong), evidence.size, evidence, pattern.ragQuery,
			)
		}

		// 공시 미확인은 메모가 아니라 행동으로 판정 — 매수의 절반 이상에서 안 봤으면 잡는다.
		val buys = rows.filter { it.action == ExamAction.BUY }
		val unchecked = buys.filter { !it.viewedDisclosure }
		if (buys.isNotEmpty() && unchecked.size.toDouble() / buys.size >= 0.5) {
			found += Diagnosis(
				DISCLOSURE_KEY, DISCLOSURE_LABEL,
				if (unchecked.size >= 3) ExamDiagnosisSeverity.HIGH else ExamDiagnosisSeverity.MEDIUM,
				unchecked.size,
				unchecked.map {
					Evidence(it.turnNo, it.stockName, it.action, listOf("공시 미확인"),
						it.reasonMemo, !it.isAligned, it.outcomeChangePct)
				},
				DISCLOSURE_QUERY,
			)
		}

		// 심각한 것 → 많이 걸린 것 순. 이 순서가 곧 퀴즈 출제 우선순위다.
		return found.sortedWith(compareBy({ it.severity.ordinal }, { -it.hitCount }))
	}

	private fun severityOf(wrongCount: Int) = when {
		wrongCount >= 2 -> ExamDiagnosisSeverity.HIGH
		wrongCount == 1 -> ExamDiagnosisSeverity.MEDIUM
		else -> ExamDiagnosisSeverity.LOW
	}

	// 문제마다 다른 턴을 인용하도록, 이미 쓴 턴은 피해서 대표 근거를 고른다.
	fun pickEvidence(diagnosis: Diagnosis, usedTurns: Set<Int>): Evidence {
		val fresh = diagnosis.evidence.filter { it.turnNo !in usedTurns }
		val candidates = fresh.ifEmpty { diagnosis.evidence }
		return candidates.maxByOrNull { (if (it.wasWrong) 1_000_000.0 else 0.0) + kotlin.math.abs(it.outcomeChangePct) }!!
	}
}
