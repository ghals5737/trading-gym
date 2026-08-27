package com.tradinggym.backend.controller

import com.tradinggym.backend.dto.LibraryDocumentDetailResponse
import com.tradinggym.backend.dto.LibraryDocumentResponse
import com.tradinggym.backend.dto.LibraryRecommendationsResponse
import com.tradinggym.backend.service.LibraryService
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/library")
class LibraryController(private val libraryService: LibraryService) {

	// 내 약점 스탯 기반 추천 — 완료한 세션이 없거나 RAG 검색이 비면 204(추천 섹션 숨김).
	@GetMapping("/recommendations")
	fun getRecommendations(authentication: Authentication): ResponseEntity<LibraryRecommendationsResponse> {
		val recommendations = libraryService.getRecommendations(authentication.name)
			?: return ResponseEntity.noContent().build()
		return ResponseEntity.ok(recommendations)
	}

	@GetMapping("/documents")
	fun listDocuments(): List<LibraryDocumentResponse> = libraryService.listDocuments()

	@GetMapping("/documents/{id}")
	fun getDocument(
		@PathVariable id: Int,
		@RequestParam(defaultValue = "0") offset: Int,
		@RequestParam(defaultValue = "10") limit: Int,
	): LibraryDocumentDetailResponse = libraryService.getDocumentDetail(id, offset, limit)
}
