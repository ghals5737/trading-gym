package com.tradinggym.backend.service.ai

import com.tradinggym.backend.dto.RiskWarningRequest

// 어댑터 인터페이스 — ChatReplyGenerator와 같은 방식(ai.provider로 구현체 하나만 선택)이지만
// 역할이 다름: 자유 대화 답변이 아니라 반대매매 위험 경고 메시지 생성.
interface RiskWarningGenerator {
	fun generate(request: RiskWarningRequest): String
}
