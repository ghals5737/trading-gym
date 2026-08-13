package com.tradinggym.backend.controller

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api")
class PingController {

	@GetMapping("/ping")
	fun ping(): Map<String, String> = mapOf("status" to "ok")
}
