package com.tradinggym.backend.repository

import com.tradinggym.backend.entity.UserEntity
import org.springframework.data.jpa.repository.JpaRepository
import java.util.UUID

interface UserJpaRepository : JpaRepository<UserEntity, UUID> {
	fun findByUsername(username: String): UserEntity?
	fun existsByUsername(username: String): Boolean
}
