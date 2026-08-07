package com.tradinggym.backend.auth

import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class AuthExceptionHandler {

	@ExceptionHandler(BadCredentialsException::class)
	fun handleBadCredentials(ex: BadCredentialsException): ResponseEntity<Map<String, String>> =
		ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(mapOf("error" to (ex.message ?: "인증에 실패했습니다")))

	@ExceptionHandler(IllegalStateException::class)
	fun handleConflict(ex: IllegalStateException): ResponseEntity<Map<String, String>> =
		ResponseEntity.status(HttpStatus.CONFLICT).body(mapOf("error" to (ex.message ?: "요청을 처리할 수 없습니다")))
}
