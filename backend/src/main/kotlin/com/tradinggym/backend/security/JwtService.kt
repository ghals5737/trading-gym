package com.tradinggym.backend.security

import io.jsonwebtoken.JwtException
import io.jsonwebtoken.Jwts
import io.jsonwebtoken.security.Keys
import org.springframework.stereotype.Component
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.Date

enum class TokenType { ACCESS, REFRESH }

private const val TYPE_CLAIM = "type"

@Component
class JwtService(jwtProperties: JwtProperties) {

	private val key = Keys.hmacShaKeyFor(jwtProperties.secret.toByteArray(StandardCharsets.UTF_8))
	private val accessTokenValiditySeconds = jwtProperties.accessTokenValiditySeconds
	private val refreshTokenValiditySeconds = jwtProperties.refreshTokenValiditySeconds

	fun generateAccessToken(username: String): String =
		generateToken(username, TokenType.ACCESS, accessTokenValiditySeconds)

	fun generateRefreshToken(username: String): String =
		generateToken(username, TokenType.REFRESH, refreshTokenValiditySeconds)

	fun extractUsername(token: String): String = parse(token).payload.subject

	fun isValid(token: String, expectedType: TokenType): Boolean = try {
		parse(token).payload[TYPE_CLAIM] == expectedType.name
	} catch (ex: JwtException) {
		false
	} catch (ex: IllegalArgumentException) {
		false
	}

	private fun generateToken(username: String, type: TokenType, validitySeconds: Long): String {
		val now = Instant.now()
		return Jwts.builder()
			.subject(username)
			.claim(TYPE_CLAIM, type.name)
			.issuedAt(Date.from(now))
			.expiration(Date.from(now.plusSeconds(validitySeconds)))
			.signWith(key)
			.compact()
	}

	private fun parse(token: String) = Jwts.parser().verifyWith(key).build().parseSignedClaims(token)
}
