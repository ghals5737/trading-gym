package com.tradinggym.backend.service.ai

import com.tradinggym.backend.service.EducationSearchResult

// QuizGenerationService가 "이 유저는 이 지표가 약해요" + RAG로 찾은 근거 자료를 넘기면,
// 그걸 바탕으로 4지선다 퀴즈 한 문제를 만들어주는 어댑터. 나머지 AI 어댑터 가족과 같은 패턴
// (ai.provider로 구현체 하나만 선택).
data class QuizGenerationInput(
	val targetStatLabel: String,
	val sourceExcerpts: List<EducationSearchResult>,
)

data class GeneratedQuiz(
	val question: String,
	val options: List<String>, // 정확히 4개
	val correctIndex: Int, // 0-based, options 안에서의 정답 위치
	val explanation: String,
)

interface QuizGenerator {
	// 실패하면(파싱 실패·API 에러 등) null — 서비스가 대체 문제로 폴백하지 않고 그냥 에러 응답함
	// (스탯 채점과 달리, 틀린 퀴즈를 그럴듯하게 보여주는 것보다 "다시 시도해주세요"가 나아서).
	fun generate(input: QuizGenerationInput): GeneratedQuiz?
}
