package com.tradinggym.backend.progression

import com.tradinggym.backend.entity.SimulationSession
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
import java.time.Instant
import java.util.UUID

enum class XpSource { SIMULATION, PT, SCENARIO_QUIZ, EDUCATION_QUIZ }

@Entity
@Table(name = "xp_events")
class XpEvent(
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "user_id", nullable = false)
	var user: UserEntity,

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	var source: XpSource,

	@Column(nullable = false)
	var amount: Int,

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "session_id")
	var session: SimulationSession? = null,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	@Column(name = "created_at", nullable = false, updatable = false)
	var createdAt: Instant = Instant.now()
}
