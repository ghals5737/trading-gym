package com.tradinggym.backend.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.FetchType
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import jakarta.persistence.UniqueConstraint
import java.time.Instant
import java.util.UUID

// session_stats(8개 세부 지표)를 3개 성향 카테고리로 묶은 평균 점수 — 세부 지표와 마찬가지로
// completeSession 시점에 SessionSummaryService가 한 번 계산해서 영구 저장함(매핑은
// SessionStatCategoryMapper 참고). note 없음 — 평균값이라 문장 근거를 새로 만들 필요가
// 없고, 근거가 필요하면 세부 지표(session_stats) 쪽 note를 보면 됨.
@Entity
@Table(
	name = "session_stat_categories",
	uniqueConstraints = [UniqueConstraint(columnNames = ["session_id", "category_key"])],
)
class SessionStatCategoryScore(
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "session_id", nullable = false)
	var session: SimulationSession,

	@Enumerated(EnumType.STRING)
	@Column(name = "category_key", nullable = false)
	var categoryKey: SessionStatCategory,

	@Column(name = "score_pct", nullable = false)
	var scorePct: Int,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	@Column(name = "computed_at", nullable = false)
	var computedAt: Instant = Instant.now()
}

// 정확성(근거·편향), 침착성(감정 통제), 공격성(위험 크기) — 8개 세부 지표를 묶는 상위
// 성향 3축. GAMBLING_SIGNAL만 침착성/공격성 양쪽에 걸침(SessionStatCategoryMapper 참고).
enum class SessionStatCategory {
	ACCURACY,
	COMPOSURE,
	AGGRESSIVENESS,
}
