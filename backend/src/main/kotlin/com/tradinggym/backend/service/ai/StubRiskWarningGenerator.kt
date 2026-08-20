package com.tradinggym.backend.service.ai

import com.tradinggym.backend.dto.RiskWarningRequest
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

// 기본 어댑터 — 실제 LLM API 키/CLI 없이도 위험 경고가 항상 뜨도록 함. 이 기능이 생기기
// 전부터 있던 정적 문구를 그대로 fallbackMessage로 재사용.
@Component
@ConditionalOnProperty(name = ["ai.provider"], havingValue = "stub", matchIfMissing = true)
class StubRiskWarningGenerator : RiskWarningGenerator {
	override fun generate(request: RiskWarningRequest): String = RiskWarningPrompt.fallbackMessage(request)
}
