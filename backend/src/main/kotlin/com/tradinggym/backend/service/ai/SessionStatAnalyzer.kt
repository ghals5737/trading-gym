package com.tradinggym.backend.service.ai

import com.tradinggym.backend.dto.SessionStatScoreResponse
import com.tradinggym.backend.dto.SessionSummaryResponse

// 어댑터 인터페이스 — ConversationAnalyzer/ChatReplyGenerator와 같은 방식(ai.provider로
// 구현체 하나만 선택). 세션 하나의 turn별 매매+reasonText 원문을 통째로 넘기면, 8개
// SessionStatKey 지표를 전부(순수 숫자로도 계산 가능한 것 포함) AI가 직접 채점해서 돌려줌
// — reasonText 해석이 필요한 지표(충동매매/손실회피/확증편향)도 여기서 같이 처리됨.
interface SessionStatAnalyzer {
	fun analyze(summary: SessionSummaryResponse): List<SessionStatScoreResponse>
}
