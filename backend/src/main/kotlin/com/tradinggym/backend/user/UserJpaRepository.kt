package com.tradinggym.backend.user

import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface UserJpaRepository : JpaRepository<UserEntity, UUID> {
	fun findByUsername(username: String): UserEntity?
	fun existsByUsername(username: String): Boolean
}
