package com.tradinggym.backend.service

import com.tradinggym.backend.entity.StockDisclosure
import com.tradinggym.backend.repository.StockDisclosureRepository
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.core.io.ClassPathResource
import org.springframework.stereotype.Component
import java.time.LocalDate

// seed-data/stock_disclosures.csv를 DB에 채움 — 실제 있었던 종목별 DART 공시를 손으로
// 골라 초보자용으로 요약한 고정 데이터(StockNewsSeeder와 같은 방식·같은 이유).
// CSV는 콤마 구분이라 본문에 콤마를 쓰면 안 됨(뉴스 CSV와 동일한 제약).
// 테이블이 비어있을 때만 실행, 재부팅해도 중복 안 됨.
@Component
class StockDisclosureSeeder(private val repository: StockDisclosureRepository) : ApplicationRunner {

	override fun run(args: ApplicationArguments) {
		if (repository.count() > 0) return

		val lines = ClassPathResource("seed-data/stock_disclosures.csv")
			.inputStream
			.bufferedReader(Charsets.UTF_8)
			.readLines()
			.drop(1) // header

		val disclosures = lines.filter { it.isNotBlank() }.map { line ->
			val cols = line.split(",")
			StockDisclosure(
				stockCode = cols[0],
				disclosedDate = LocalDate.parse(cols[1]),
				title = cols[2],
				summary = cols[3],
			)
		}

		repository.saveAll(disclosures)
	}
}
