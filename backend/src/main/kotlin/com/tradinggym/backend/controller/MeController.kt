package com.tradinggym.backend.controller

import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api")
class MeController {

	@GetMapping("/me")
	fun me(authentication: Authentication): Map<String, String> = mapOf("username" to authentication.name)
}
