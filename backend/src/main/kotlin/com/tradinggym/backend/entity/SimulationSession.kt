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
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

enum class SimulationSessionStatus { ACTIVE, COMPLETED }

// 턴 하나가 며칠씩 흐르는지 — advanceTurn이 currentTurnDate를 얼마나 건너뛸지 결정함.
enum class TurnUnit { DAY, WEEK, MONTH }

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

	// 세션 시작 화면에서 사용자가 직접 고른 종료 예정일 — advanceTurn이 이 날짜를 넘기려고
	// 하면(턴 단위만큼 건너뛴 다음 날이 이 날짜보다 뒤면) 에러 대신 세션을 종료시킴.
	@Column(name = "target_end_date", nullable = false)
	var targetEndDate: LocalDate,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	// 시뮬레이션 시작 거래일 — currentTurnDate는 턴이 넘어가면 바뀌어서, "기간이 얼마나
	// 남았는지" 진행률을 그리려면 시작점을 따로 들고 있어야 함. 예전 세션(컬럼 추가 전)은
	// null일 수 있어 nullable — 응답 변환에서 currentTurnDate로 대체함.
	@Column(name = "start_turn_date")
	var startTurnDate: LocalDate? = null

	@Column(name = "started_at", nullable = false, updatable = false)
	var startedAt: Instant = Instant.now()

	@Column(name = "ended_at")
	var endedAt: Instant? = null

	// 세션 생성 시점이 1턴째 — advanceTurn 성공할 때마다 1씩 늘어남. MAX_TURNS(10) 도달하면
	// advanceTurn이 거부하고 시뮬레이션 종료를 유도함.
	@Column(name = "turn_count", nullable = false)
	var turnCount: Int = 1

	// 신용매수로 빌린 돈의 총합(포지션별이 아니라 계좌 전체 합산 — 단순화).
	// 담보비율 = (현금 + 보유종목 평가액) / borrowedAmount.
	// 상환은 매도 대금 자동 상환(recordTrade의 SELL) 또는 반대매매로 됨.
	@Column(name = "borrowed_amount", nullable = false)
	var borrowedAmount: BigDecimal = BigDecimal.ZERO

	// 미수금(빌린 돈)이 0 → 양수로 처음 넘어간 턴 번호. 전액 상환되면 다시 null.
	// DEBT_REPAY_TURN_LIMIT(10턴) 안에 못 갚으면 debtOverdue가 켜짐 — 상환 기한 경고의 기준점.
	@Column(name = "debt_opened_turn_number")
	var debtOpenedTurnNumber: Int? = null

	// 미수금을 기한(10턴) 안에 못 갚은 적이 있는 세션 표시 — 한 번 켜지면 세션 끝까지 유지.
	// AI 스탯 채점(SessionStatAnalyzer)에 "부정적 반영" 근거로 넘어감.
	@Column(name = "debt_overdue", nullable = false)
	var debtOverdue: Boolean = false
}
