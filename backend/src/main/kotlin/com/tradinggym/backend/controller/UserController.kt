package com.tradinggym.backend.controller

import com.tradinggym.backend.dto.AggregateStatCategoryResponse
import com.tradinggym.backend.dto.AggregateStatResponse
import com.tradinggym.backend.dto.ProductTourStatusResponse
import com.tradinggym.backend.service.AggregateStatService
import com.tradinggym.backend.service.UserService
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/users/me")
class UserController(
	private val userService: UserService,
	private val aggregateStatService: AggregateStatService,
) {

	@GetMapping("/product-tour")
	fun getProductTourStatus(authentication: Authentication): ProductTourStatusResponse =
		userService.getProductTourStatus(authentication.name)

	@PostMapping("/product-tour/seen")
	fun markProductTourSeen(authentication: Authentication): ProductTourStatusResponse =
		userService.markProductTourSeen(authentication.name)

	@GetMapping("/aggregate-stats")
	fun getMyAggregateStats(authentication: Authentication): List<AggregateStatResponse> =
		aggregateStatService.getMyAggregateStats(authentication.name)

	@GetMapping("/aggregate-stat-categories")
	fun getMyAggregateStatCategories(authentication: Authentication): List<AggregateStatCategoryResponse> =
		aggregateStatService.getMyAggregateStatCategories(authentication.name)
}
