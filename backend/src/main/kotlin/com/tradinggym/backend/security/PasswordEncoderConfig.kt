package com.tradinggym.backend.security

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.security.crypto.password.PasswordEncoder

/**
 * Split out from SecurityConfig: UserStore needs a PasswordEncoder to seed its
 * demo user, and UserStore is a transitive dependency of SecurityConfig's own
 * constructor (via JwtAuthenticationFilter -> UserDetailsService -> UserStore).
 * Defining the bean as a @Bean method on SecurityConfig itself creates a circular
 * dependency at startup (BeanCurrentlyInCreationException) — this file breaks that cycle.
 */
@Configuration
class PasswordEncoderConfig {

	@Bean
	fun passwordEncoder(): PasswordEncoder = BCryptPasswordEncoder()
}
