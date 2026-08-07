package com.tradinggym.backend.security

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties(prefix = "jwt")
data class JwtProperties(
	val secret: String,
	val accessTokenValiditySeconds: Long = 900,
	val refreshTokenValiditySeconds: Long = 1_209_600,
)
