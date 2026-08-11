package com.tradinggym.backend.education

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

// db/schema.sql엔 embedding vector(1536) 컬럼이 있지만 여기선 아직 안 붙임 — pgvector
// 드라이버(com.pgvector:pgvector)엔 순정 Hibernate 6 타입 매핑이 없어서 커스텀
// JdbcType/UserType이 필요하고, 지금은 임베딩을 실제로 만드는 파이프라인 자체가
// 없어서 검증 없이 넣는 것보다 미룸. RAG 파이프라인 붙일 때 같이 추가할 것.
@Entity
@Table(
	name = "education_chunks",
	uniqueConstraints = [UniqueConstraint(columnNames = ["article_id", "chunk_index"])],
)
class EducationChunk(
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "article_id", nullable = false)
	var article: EducationArticle,

	@Column(name = "chunk_index", nullable = false)
	var chunkIndex: Int,

	@Column(columnDefinition = "text", nullable = false)
	var content: String,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	@Column(name = "created_at", nullable = false, updatable = false)
	var createdAt: Instant = Instant.now()
}
