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
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes
import java.math.BigDecimal
import java.time.LocalDate
import java.util.UUID

enum class ExamAction { BUY, SELL, HOLD }

// 턴 = 문항. 차트·뉴스·공시를 JSONB로 자체 보유해서 시세 테이블(stock_daily_prices)에
// 의존하지 않는다 — 모의고사는 큐레이션된 고정 문제라 실시간 시세가 필요 없고,
// 장 마감·API 장애와 무관하게 데모가 되는 게 더 중요하다.
@Entity
@Table(
	name = "exam_turns",
	uniqueConstraints = [UniqueConstraint(columnNames = ["paper_id", "turn_no"])],
)
class ExamTurn(
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "paper_id", nullable = false)
	var paper: ExamPaper,

	@Column(name = "turn_no", nullable = false)
	var turnNo: Int,

	@Column(name = "stock_name", nullable = false)
	var stockName: String,

	var sector: String? = null,

	@Column(name = "as_of_date", nullable = false)
	var asOfDate: LocalDate,

	@Column(nullable = false)
	var price: Long,

	// 이 턴 시작 시점의 보유 수량 — 0이면 매도 선택지를 막는다.
	@Column(name = "holding_qty", nullable = false)
	var holdingQty: Int = 0,

	@Column(name = "avg_buy_price")
	var avgBuyPrice: Long? = null,

	// [{"d":"2021-03-02","c":18200}, ...] 판단 시점까지만.
	@JdbcTypeCode(SqlTypes.JSON)
	@Column(name = "chart_points", nullable = false, columnDefinition = "jsonb")
	var chartPoints: String,

	// [{"tag":"리딩방","title":"..."}, ...]
	@JdbcTypeCode(SqlTypes.JSON)
	@Column(nullable = false, columnDefinition = "jsonb")
	var news: String,

	// {"rows":[{"label","value","tone"}],"note":"..."} — 사용자가 열어봐야 보인다.
	@JdbcTypeCode(SqlTypes.JSON)
	@Column(columnDefinition = "jsonb")
	var disclosure: String? = null,

	// ── 아래는 응답 제출 후에만 공개되는 정답 영역 ──
	@JdbcTypeCode(SqlTypes.JSON)
	@Column(name = "outcome_points", nullable = false, columnDefinition = "jsonb")
	var outcomePoints: String,

	@Column(name = "outcome_change_pct", nullable = false)
	var outcomeChangePct: BigDecimal,

	@Column(name = "outcome_summary", nullable = false, columnDefinition = "text")
	var outcomeSummary: String,

	@Enumerated(EnumType.STRING)
	@Column(name = "ideal_action", nullable = false)
	var idealAction: ExamAction,

	@Column(name = "ideal_rationale", nullable = false, columnDefinition = "text")
	var idealRationale: String,

	@Column(name = "learning_point", nullable = false, columnDefinition = "text")
	var learningPoint: String,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null
}
