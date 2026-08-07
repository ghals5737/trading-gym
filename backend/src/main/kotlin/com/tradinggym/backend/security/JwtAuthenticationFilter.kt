package com.tradinggym.backend.security

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpHeaders
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.core.userdetails.UserDetailsService
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

private const val BEARER_PREFIX = "Bearer "

@Component
class JwtAuthenticationFilter(
	private val jwtService: JwtService,
	private val userDetailsService: UserDetailsService,
) : OncePerRequestFilter() {

	override fun doFilterInternal(
		request: HttpServletRequest,
		response: HttpServletResponse,
		filterChain: FilterChain,
	) {
		val header = request.getHeader(HttpHeaders.AUTHORIZATION)
		if (header != null && header.startsWith(BEARER_PREFIX)) {
			val token = header.removePrefix(BEARER_PREFIX)
			if (jwtService.isValid(token, TokenType.ACCESS) && SecurityContextHolder.getContext().authentication == null) {
				val userDetails = userDetailsService.loadUserByUsername(jwtService.extractUsername(token))
				val authentication = UsernamePasswordAuthenticationToken(userDetails, null, userDetails.authorities)
				authentication.details = WebAuthenticationDetailsSource().buildDetails(request)
				SecurityContextHolder.getContext().authentication = authentication
			}
		}
		filterChain.doFilter(request, response)
	}
}
