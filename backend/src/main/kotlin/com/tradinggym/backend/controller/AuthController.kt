package com.tradinggym.backend.controller

import com.tradinggym.backend.dto.LoginRequest
import com.tradinggym.backend.dto.RefreshRequest
import com.tradinggym.backend.dto.SignupRequest
import com.tradinggym.backend.dto.TokenResponse
import com.tradinggym.backend.entity.UserEntity
import com.tradinggym.backend.repository.UserJpaRepository
import com.tradinggym.backend.security.JwtService
import com.tradinggym.backend.security.RefreshTokenStore
import com.tradinggym.backend.security.TokenType
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/auth")
class AuthController(
	private val userJpaRepository: UserJpaRepository,
	private val passwordEncoder: PasswordEncoder,
	private val jwtService: JwtService,
	private val refreshTokenStore: RefreshTokenStore,
) {

	@PostMapping("/signup")
	fun signup(@RequestBody request: SignupRequest): ResponseEntity<Void> {
		check(!userJpaRepository.existsByUsername(request.username)) { "이미 존재하는 아이디입니다: ${request.username}" }
		userJpaRepository.save(UserEntity(username = request.username, passwordHash = passwordEncoder.encode(request.password)))
		return ResponseEntity.status(HttpStatus.CREATED).build()
	}

	@PostMapping("/login")
	fun login(@RequestBody request: LoginRequest): TokenResponse {
		val user = userJpaRepository.findByUsername(request.username)
			?.takeIf { passwordEncoder.matches(request.password, it.passwordHash) }
			?: throw BadCredentialsException("아이디 또는 비밀번호가 올바르지 않습니다")
		return issueTokens(user.username)
	}

	@PostMapping("/refresh")
	fun refresh(@RequestBody request: RefreshRequest): TokenResponse {
		if (!jwtService.isValid(request.refreshToken, TokenType.REFRESH)) {
			throw BadCredentialsException("리프레시 토큰이 유효하지 않습니다")
		}
		// consume() is single-use: a stolen-but-already-used or logged-out refresh
		// token fails here even if its signature/expiry still check out.
		val username = refreshTokenStore.consume(request.refreshToken)
			?: throw BadCredentialsException("리프레시 토큰이 유효하지 않습니다")
		return issueTokens(username)
	}

	@PostMapping("/logout")
	fun logout(@RequestBody request: RefreshRequest): ResponseEntity<Void> {
		refreshTokenStore.consume(request.refreshToken)
		return ResponseEntity.noContent().build()
	}

	private fun issueTokens(username: String): TokenResponse {
		val accessToken = jwtService.generateAccessToken(username)
		val refreshToken = jwtService.generateRefreshToken(username)
		refreshTokenStore.store(refreshToken, username)
		return TokenResponse(accessToken, refreshToken)
	}
}
