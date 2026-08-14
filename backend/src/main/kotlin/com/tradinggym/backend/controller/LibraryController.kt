package com.tradinggym.backend.controller

import com.tradinggym.backend.dto.LibraryDocumentDetailResponse
import com.tradinggym.backend.dto.LibraryDocumentResponse
import com.tradinggym.backend.service.LibraryService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/library")
class LibraryController(private val libraryService: LibraryService) {

	@GetMapping("/documents")
	fun listDocuments(): List<LibraryDocumentResponse> = libraryService.listDocuments()

	@GetMapping("/documents/{id}")
	fun getDocument(
		@PathVariable id: Int,
		@RequestParam(defaultValue = "0") offset: Int,
		@RequestParam(defaultValue = "10") limit: Int,
	): LibraryDocumentDetailResponse = libraryService.getDocumentDetail(id, offset, limit)
}
