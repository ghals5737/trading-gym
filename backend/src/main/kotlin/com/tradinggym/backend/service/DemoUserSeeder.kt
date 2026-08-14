package com.tradinggym.backend.service

import com.tradinggym.backend.entity.UserEntity
import com.tradinggym.backend.repository.UserJpaRepository
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Component

/** Dev convenience: guarantees a demo/demo login exists so the auth flow is testable without a signup step first. */
@Component
class DemoUserSeeder(
	private val userJpaRepository: UserJpaRepository,
	private val passwordEncoder: PasswordEncoder,
) : ApplicationRunner {

	override fun run(args: ApplicationArguments) {
		if (!userJpaRepository.existsByUsername("demo")) {
			userJpaRepository.save(UserEntity(username = "demo", passwordHash = passwordEncoder.encode("demo")))
		}
	}
}
