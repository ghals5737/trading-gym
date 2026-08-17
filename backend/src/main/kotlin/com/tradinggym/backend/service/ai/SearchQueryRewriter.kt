package com.tradinggym.backend.service.ai

// 채팅 메시지를 RAG 검색에 쓸 독립형 검색어로 바꾸는 어댑터 — 다섯 구현체(ai.provider로 선택),
// 나머지 어댑터 가족(ConversationAnalyzer/ChatReplyGenerator/SessionStatAnalyzer)과 같은 패턴.
// "그거 왜 위험한데?"처럼 직전 대화 맥락이 있어야만 뜻이 통하는 멀티턴 메시지를, 대화 history를
// 참고해서 "레버리지 투자 위험성" 같은 독립적인 검색어로 풀어씀.
interface SearchQueryRewriter {
	fun rewrite(history: List<ChatTurn>, newMessage: String): String
}
