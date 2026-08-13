package com.tradinggym.backend.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "users")
class UserEntity(
	@Column(nullable = false, unique = true)
	var username: String,

	@Column(name = "password_hash", nullable = false)
	var passwordHash: String,
) {
	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	var id: UUID? = null

	@Column(name = "created_at", nullable = false, updatable = false)
	var createdAt: Instant = Instant.now()

	// 첫 방문 가이드 투어(ProductTour)를 본 적 있는지 — 브라우저(localStorage)가 아니라
	// 계정 단위로 기억해야, 다른 기기·브라우저로 로그인해도 한 번 본 사람에겐 안 뜨고
	// (반대로 같은 브라우저를 여러 계정이 돌려써도) 계정마다 정확히 한 번만 보여줌.
	@Column(name = "has_seen_product_tour", nullable = false)
	var hasSeenProductTour: Boolean = false
}
