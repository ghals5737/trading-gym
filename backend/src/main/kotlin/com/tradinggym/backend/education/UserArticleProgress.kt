package com.tradinggym.backend.education

import com.tradinggym.backend.user.UserEntity
import jakarta.persistence.Column
import jakarta.persistence.Entity
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

// db/schema.sql은 (user_id, article_id) 복합 PK인데, 여기선 SessionStat과 같은 원칙으로
// 합성 UUID PK + unique 제약으로 단순화함 (EmbeddedId/MapsId보다 다루기 쉬움).
@Entity
@Table(
	name = "user_article_progress",
	uniqueConstraints = [UniqueConstraint(columnNames = ["user_id", "article_id"])],
)
class UserArticleProgress(
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "user_id", nullable = false)
	var user: UserEntity,

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "article_id", nullable = false)
	var article: EducationArticle,

	@Column(name = "completed_at")
	var completedAt: Instant? = null,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null
}
