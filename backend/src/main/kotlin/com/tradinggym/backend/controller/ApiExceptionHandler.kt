package com.tradinggym.backend.controller

import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.server.ResponseStatusException

// ResponseStatusException은 이론상 Spring MVC의 기본 리졸버가 처리해야 하지만,
// 이 프로젝트의 보안 설정(커스텀 authenticationEntryPoint)과 결합했을 때 처리되지
// 않고 Tomcat 에러 디스패치로 새서 시큐리티 필터 체인을 다시 타며 401로
// 둔갑하는 문제가 있었음 — 여기서 명시적으로 가로채서 원래 의도한 상태 코드로 응답.
// HttpMessageNotReadableException(잘못된 JSON, 존재하지 않는 enum 값 등)도 같은
// 경로로 401로 둔갑하는 걸 온보딩 interpret 엔드포인트 테스트 중 발견 — 동일하게 처리.
@RestControllerAdvice
class ApiExceptionHandler {

	@ExceptionHandler(ResponseStatusException::class)
	fun handleResponseStatus(ex: ResponseStatusException): ResponseEntity<Map<String, String>> =
		ResponseEntity.status(ex.statusCode).body(mapOf("error" to (ex.reason ?: "요청을 처리할 수 없습니다")))

	@ExceptionHandler(HttpMessageNotReadableException::class)
	fun handleMalformedRequest(ex: HttpMessageNotReadableException): ResponseEntity<Map<String, String>> =
		ResponseEntity.badRequest().body(mapOf("error" to "요청 형식이 올바르지 않아요"))
}
