package com.tradinggym.backend.progression

import com.tradinggym.backend.user.UserEntity
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.OneToOne
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

// db/schema.sql은 user_id를 PK로 쓰는 공유 기본키 패턴인데, @MapsId로 구현하면
// Spring Data JPA가 이 id 모양을 IdClass 복합키로 오인해서 부팅 시 예외를 던짐
// (JpaMetamodelEntityInformation이 연관관계 기반 @Id를 못 다룸). SessionStat/
// UserArticleProgress와 같은 원칙으로 합성 UUID PK + unique(user_id)로 단순화.
@Entity
@Table(name = "ai_characters")
class AiCharacter(
	@OneToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "user_id", nullable = false, unique = true)
	var user: UserEntity,

	@Column(nullable = false)
	var name: String = "KnowerBot",

	@Column(nullable = false)
	var level: Int = 1,

	@Column(nullable = false)
	var xp: Int = 0, // xp_events 합계의 캐시. 갱신은 앱 로직에서.

	@Column(name = "xp_to_next", nullable = false)
	var xpToNext: Int = 1000,

	@Column(nullable = false)
	var tier: String = "새싹 1단계",
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	@Column(name = "updated_at", nullable = false)
	var updatedAt: Instant = Instant.now()
}
