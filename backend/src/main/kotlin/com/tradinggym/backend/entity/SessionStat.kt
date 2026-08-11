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

// report.metrics(3개) + report.habits(4개) + report.gamblingSignal을 전부 이 enum
// 하나로 backing. JUDGMENT_ACCURACY는 이름이 결과(정답) 채점을 암시해서 이후
// PRINCIPLE_ADHERENCE(원칙 준수율 — reason_tag와 실제 행동의 일치 여부)로 바꿀 예정
// — 아직 미반영, db/schema.sql과 함께 나중에 한 번에 리네임하기로 함.
enum class SessionStatKey {
	JUDGMENT_ACCURACY,
	DISCLOSURE_CHECK_RATE,
	RISK_MANAGEMENT_SCORE,
	IMPULSIVE_TRADING,
	LOSS_AVERSION,
	CONFIRMATION_BIAS,
	DIVERSIFICATION,
	GAMBLING_SIGNAL,
}

enum class StatTone { RED, AMBER, GREEN }

@Entity
@Table(
	name = "session_stats",
	uniqueConstraints = [UniqueConstraint(columnNames = ["session_id", "stat_key"])],
)
class SessionStat(
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "session_id", nullable = false)
	var session: SimulationSession,

	@Enumerated(EnumType.STRING)
	@Column(name = "stat_key", nullable = false)
	var statKey: SessionStatKey,

	@Column(name = "score_pct", nullable = false)
	var scorePct: Int,

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	var tone: StatTone,

	@Column(columnDefinition = "text")
	var note: String? = null, // gambling_signal처럼 서술형 카드가 필요한 stat_key만 채움
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	@Column(name = "computed_at", nullable = false)
	var computedAt: Instant = Instant.now()
}
