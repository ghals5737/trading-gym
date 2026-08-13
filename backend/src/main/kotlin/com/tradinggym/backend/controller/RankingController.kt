package com.tradinggym.backend.controller

import com.tradinggym.backend.dto.RankingEntryResponse
import com.tradinggym.backend.service.RankingService
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/rankings")
class RankingController(private val rankingService: RankingService) {

	@GetMapping("/return-rate")
	fun getReturnRateRanking(authentication: Authentication): List<RankingEntryResponse> =
		rankingService.getReturnRateRanking(authentication.name)
}
