package com.tradinggym.backend.repository

import com.tradinggym.backend.entity.StockDisclosure
import org.springframework.data.jpa.repository.JpaRepository
import java.time.LocalDate
import java.util.UUID

interface StockDisclosureRepository : JpaRepository<StockDisclosure, UUID> {
	// 세션의 현재 날짜 기준 "그 시점까지 나온" 공시만 — 미래 공시가 새어 나가면 안 됨.
	fun findTop3ByStockCodeAndDisclosedDateLessThanEqualOrderByDisclosedDateDesc(
		stockCode: String,
		date: LocalDate,
	): List<StockDisclosure>
}
