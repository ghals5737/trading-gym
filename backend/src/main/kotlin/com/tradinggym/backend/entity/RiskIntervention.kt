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
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

enum class RiskInterventionType {
	EXCESSIVE_LEVERAGE, // 과도한 레버리지
	CONCENTRATION,      // 몰빵매수
	CHASE_BUY,          // 추격매수
	STOP_LOSS_DELAY,    // 손절 지연
}

enum class RiskInterventionResponse { HEEDED, IGNORED }

// "위험개입무시율" 스탯의 원천 데이터.
@Entity
@Table(name = "risk_interventions")
class RiskIntervention(
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "session_id", nullable = false)
	var session: SimulationSession,

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "trade_id")
	var trade: Trade? = null, // 개입 후 실제로 낸 매매(있다면)

	@Enumerated(EnumType.STRING)
	@Column(name = "risk_type", nullable = false)
	var riskType: RiskInterventionType,

	@Column(columnDefinition = "text", nullable = false)
	var message: String, // 그 순간 보여준 경고 문구(LLM 생성분 그대로 보관)

	@Enumerated(EnumType.STRING)
	@Column(name = "user_response", nullable = false)
	var userResponse: RiskInterventionResponse,

	@Column(name = "simulated_trade_date", nullable = false)
	var simulatedTradeDate: LocalDate,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	@Column(name = "created_at", nullable = false, updatable = false)
	var createdAt: Instant = Instant.now()
}
