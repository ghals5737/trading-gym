package com.tradinggym.backend.service

import com.tradinggym.backend.repository.UserJpaRepository
import org.springframework.security.core.userdetails.User
import org.springframework.security.core.userdetails.UserDetails
import org.springframework.security.core.userdetails.UserDetailsService
import org.springframework.security.core.userdetails.UsernameNotFoundException
import org.springframework.stereotype.Service

@Service
class CustomUserDetailsService(private val userJpaRepository: UserJpaRepository) : UserDetailsService {

	override fun loadUserByUsername(username: String): UserDetails {
		val user = userJpaRepository.findByUsername(username)
			?: throw UsernameNotFoundException("사용자를 찾을 수 없습니다: $username")
		return User.withUsername(user.username)
			.password(user.passwordHash)
			.roles("USER")
			.build()
	}
}
