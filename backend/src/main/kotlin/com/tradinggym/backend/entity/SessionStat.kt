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

// 예전엔 매매 이력에서 룰 기반으로 자동 채점했지만(reasonTag 제거로 3개 지표 근거가
// 사라져서 없앴었음) — 지금은 completeSession 시점에 SessionSummaryService가
// SessionStatAnalyzer(AI, reasonText까지 읽고 판단)로 채점한 결과를 여기에 영구 저장함.
// 세션마다 한 번씩 쌓여서, 유저 단위로 시간순으로 모으면 "성장 추이"를 볼 수 있음
// (온보딩 사전조사 진단은 investor_profiles에 별도로 저장돼 있어 여기와 안 섞임).
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

	@Column(nullable = false, columnDefinition = "text")
	var note: String,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	@Column(name = "computed_at", nullable = false)
	var computedAt: Instant = Instant.now()
}

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
