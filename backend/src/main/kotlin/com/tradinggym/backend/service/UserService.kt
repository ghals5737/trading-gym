package com.tradinggym.backend.service

import com.tradinggym.backend.dto.ProductTourStatusResponse
import com.tradinggym.backend.repository.UserJpaRepository
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException

@Service
class UserService(private val userJpaRepository: UserJpaRepository) {

	fun getProductTourStatus(username: String): ProductTourStatusResponse =
		ProductTourStatusResponse(seen = requireUser(username).hasSeenProductTour)

	@Transactional
	fun markProductTourSeen(username: String): ProductTourStatusResponse {
		val user = requireUser(username)
		user.hasSeenProductTour = true
		userJpaRepository.save(user)
		return ProductTourStatusResponse(seen = true)
	}

	private fun requireUser(username: String) =
		userJpaRepository.findByUsername(username)
			?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "사용자를 찾을 수 없습니다")
}
