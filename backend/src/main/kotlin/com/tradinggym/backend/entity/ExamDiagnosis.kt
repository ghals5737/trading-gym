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
import java.time.Instant
import java.util.UUID

enum class ExamDiagnosisSeverity { HIGH, MEDIUM, LOW }

// 응답 메모에서 추출한 행동 습관. LLM이 아니라 규칙으로 판정하기 때문에
// "왜 그렇게 진단했는지"를 항상 설명할 수 있다(evidence에 근거 메모를 그대로 남긴다).
@Entity
@Table(
	name = "exam_diagnoses",
	uniqueConstraints = [UniqueConstraint(columnNames = ["attempt_id", "pattern_key"])],
)
class ExamDiagnosis(
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "attempt_id", nullable = false)
	var attempt: ExamAttempt,

	@Column(name = "pattern_key", nullable = false)
	var patternKey: String,

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	var severity: ExamDiagnosisSeverity,

	@Column(name = "hit_count", nullable = false)
	var hitCount: Int,

	// [{"turnNo":1,"memo":"...","matched":["리딩방"],...}] — 화면과 퀴즈 프롬프트에 그대로 쓴다.
	@JdbcTypeCode(SqlTypes.JSON)
	@Column(nullable = false, columnDefinition = "jsonb")
	var evidence: String,

	// 이 패턴으로 edu_chunks를 검색할 자연어 질의.
	@Column(name = "rag_query", nullable = false, columnDefinition = "text")
	var ragQuery: String,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	@Column(name = "detected_at", nullable = false)
	var detectedAt: Instant = Instant.now()
}
