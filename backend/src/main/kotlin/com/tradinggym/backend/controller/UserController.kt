package com.tradinggym.backend.controller

import com.tradinggym.backend.dto.AgeBandResponse
import com.tradinggym.backend.dto.AggregateStatResponse
import com.tradinggym.backend.dto.PeerComparisonResponse
import com.tradinggym.backend.dto.ProductTourStatusResponse
import com.tradinggym.backend.dto.StatOverviewResponse
import com.tradinggym.backend.dto.UpdateAgeBandRequest
import com.tradinggym.backend.service.AggregateStatService
import com.tradinggym.backend.service.UserService
import org.springframework.security.core.Authentication
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
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

	@GetMapping("/age-band")
	fun getAgeBand(authentication: Authentication): AgeBandResponse =
		userService.getAgeBand(authentication.name)

	@PutMapping("/age-band")
	fun updateAgeBand(authentication: Authentication, @RequestBody request: UpdateAgeBandRequest): AgeBandResponse =
		userService.updateAgeBand(authentication.name, request)

	// 나이대 미입력 or 온보딩 미진단이면 204 — 프론트는 또래 비교 섹션을 그냥 숨기면 됨.
	@GetMapping("/peer-comparison")
	fun getPeerComparison(authentication: Authentication): ResponseEntity<PeerComparisonResponse> {
		val comparison = userService.getPeerComparison(authentication.name)
			?: return ResponseEntity.noContent().build()
		return ResponseEntity.ok(comparison)
	}

	@GetMapping("/aggregate-stats")
	fun getMyAggregateStats(authentication: Authentication): List<AggregateStatResponse> =
		aggregateStatService.getMyAggregateStats(authentication.name)

	// 3개 대분류(정확성/침착성/공격성) 개요 + 한 줄 요약 — 데이터가 없으면 204.
	@GetMapping("/stat-overview")
	fun getMyStatOverview(authentication: Authentication): ResponseEntity<StatOverviewResponse> {
		val overview = aggregateStatService.getMyStatOverview(authentication.name)
			?: return ResponseEntity.noContent().build()
		return ResponseEntity.ok(overview)
	}
}
