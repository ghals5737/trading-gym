package com.tradinggym.backend.dto

data class SignupRequest(val username: String, val password: String)

data class LoginRequest(val username: String, val password: String)

data class RefreshRequest(val refreshToken: String)

data class TokenResponse(
	val accessToken: String,
	val refreshToken: String,
	val tokenType: String = "Bearer",
)
