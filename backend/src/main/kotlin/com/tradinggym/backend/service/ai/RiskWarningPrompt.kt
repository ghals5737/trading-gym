package com.tradinggym.backend.service.ai

import com.tradinggym.backend.dto.RiskWarningRequest

// 다섯 어댑터(RiskWarningGenerator 구현체)가 공유하는 프롬프트 조립 + 대체 메시지.
object RiskWarningPrompt {

	fun build(request: RiskWarningRequest): String {
		val diagnosisLine = request.diagnosisWarning
			?.let { "\n사전조사 진단에서 확인된 위험 성향: $it" }
			.orEmpty()

		return """
			너는 '트레이딩 짐' 모의투자 서비스의 AI 코치야. 사용자가 지금 막 신용매수를
			시도했는데 담보비율이 위험 수준까지 떨어질 상황이라, 매매를 잠깐 멈추고 경고
			메시지를 보여주려고 해.

			시도한 매매: ${request.stockName} ${request.quantity}주, 레버리지 ${request.leverageRatio}배
			이 매매를 진행하면 예상 담보비율: ${request.expectedCollateralRatioPct}%
			반대매매(강제청산) 기준: ${request.liquidationThresholdPct}%
			사용자가 이 매매를 하려는 이유(직접 작성한 원문): "${request.reasonText}"$diagnosisLine

			위 정보를 바탕으로 2~3문장짜리 경고 메시지를 만들어줘 — 왜 위험한지 수치로
			짚어주고, 사용자가 쓴 이유가 지금 이 위험을 정당화할 만한 근거인지도 자연스럽게
			짚어줘(근거가 약하면 그 점을 지적하고, 근거가 있어 보여도 신중하라고 덧붙여줘).
			무조건 하지 말라고 막지 말고, 최종 판단은 사용자 몫이라는 톤으로. 존댓말,
			"~해요"체.

			메시지만 출력해(다른 설명이나 따옴표는 절대 붙이지 마):
		""".trimIndent()
	}

	// LLM 호출 실패 시(또는 stub 프로바이더) 쓰던 원래 정적 경고 문구 그대로 — 이 기능이
	// 생기기 전부터 있던 문구라 AI가 없어도 최소한의 경고는 항상 뜨게 함.
	fun fallbackMessage(request: RiskWarningRequest): String =
		"지금 신용매수 ${request.quantity}주를 진행하면 담보비율이 " +
			"${request.expectedCollateralRatioPct}%까지 떨어져요. " +
			"${request.liquidationThresholdPct}% 아래로 내려가면 — 내 의사와 상관없이 반대매매가 발생할 수 있어요."

	// 모델이 지시를 완벽히 안 따라서 양끝에 따옴표를 붙이는 경우가 있어서 관대하게 벗겨냄.
	// 너무 길면(폭주 응답) 잘라서 모달이 안 깨지게 함.
	fun parse(rawResponse: String, request: RiskWarningRequest): String {
		var text = rawResponse.trim()
		if (text.length >= 2 && text.first() in "\"'" && text.last() in "\"'") {
			text = text.substring(1, text.length - 1).trim()
		}
		return text.take(MAX_LENGTH).ifBlank { fallbackMessage(request) }
	}

	private const val MAX_LENGTH = 500
}
