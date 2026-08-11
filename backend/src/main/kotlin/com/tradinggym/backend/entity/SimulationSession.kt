package com.tradinggym.backend.entity

import com.tradinggym.backend.user.UserEntity
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
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

enum class SimulationSessionStatus { ACTIVE, COMPLETED }

// db/schema.sql의 참고용 정의와 값(enum 이름, numeric 정밀도)이 완전히 같지는 않음 —
// 실제 스키마 소유자는 이 엔티티 + ddl-auto=update (users 테이블과 동일한 원칙).
@Entity
@Table(name = "simulation_sessions")
class SimulationSession(
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "user_id", nullable = false)
	var user: UserEntity,

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	var status: SimulationSessionStatus = SimulationSessionStatus.ACTIVE,

	@Column(name = "starting_cash", nullable = false)
	var startingCash: BigDecimal,

	@Column(name = "current_cash", nullable = false)
	var currentCash: BigDecimal,

	@Column(name = "current_turn_date", nullable = false)
	var currentTurnDate: LocalDate,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	@Column(name = "started_at", nullable = false, updatable = false)
	var startedAt: Instant = Instant.now()

	@Column(name = "ended_at")
	var endedAt: Instant? = null

	// 신용매수로 빌린 돈의 총합(포지션별이 아니라 계좌 전체 합산 — 단순화).
	// 담보비율 = (현금 + 보유종목 평가액) / borrowedAmount. 상환은 반대매매로만 됨(수동 상환 기능 없음).
	@Column(name = "borrowed_amount", nullable = false)
	var borrowedAmount: BigDecimal = BigDecimal.ZERO
}
