package com.tradinggym.backend.security

import jakarta.servlet.http.HttpServletResponse
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter
import org.springframework.web.cors.CorsConfiguration
import org.springframework.web.cors.CorsConfigurationSource
import org.springframework.web.cors.UrlBasedCorsConfigurationSource

@Configuration
class SecurityConfig(
	private val jwtAuthenticationFilter: JwtAuthenticationFilter,
) {

	@Bean
	fun securityFilterChain(http: HttpSecurity): SecurityFilterChain {
		http
			.cors { it.configurationSource(corsConfigurationSource()) }
			.csrf { it.disable() }
			.httpBasic { it.disable() }
			.formLogin { it.disable() }
			.sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
			.exceptionHandling { handling ->
				handling.authenticationEntryPoint { _, response, _ ->
					response.status = HttpServletResponse.SC_UNAUTHORIZED
					response.contentType = "application/json;charset=UTF-8"
					response.writer.write("""{"error":"인증이 필요합니다"}""")
				}
			}
			.authorizeHttpRequests { authorize ->
				authorize
					.requestMatchers("/api/auth/**", "/api/ping", "/actuator/health").permitAll()
					.anyRequest().authenticated()
			}
			.addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter::class.java)

		return http.build()
	}

	// Next.js dev server on :8088 (also reachable over LAN for phone testing,
	// see reference_knowerbot_demo_location memory) calls this API from a
	// different origin. No cookies are used (JWT travels in the Authorization
	// header), so credentials don't need to be allowed.
	private fun corsConfigurationSource(): CorsConfigurationSource {
		val config = CorsConfiguration()
		config.allowedOriginPatterns = listOf("http://localhost:*", "http://127.0.0.1:*", "http://192.168.*.*:*")
		config.allowedMethods = listOf("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
		config.allowedHeaders = listOf("*")
		val source = UrlBasedCorsConfigurationSource()
		source.registerCorsConfiguration("/**", config)
		return source
	}
}
