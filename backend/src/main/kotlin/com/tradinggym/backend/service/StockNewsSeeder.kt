package com.tradinggym.backend.service

import com.tradinggym.backend.entity.StockNews
import com.tradinggym.backend.repository.StockNewsRepository
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.core.io.ClassPathResource
import org.springframework.stereotype.Component
import java.time.LocalDate

// seed-data/stock_news.csv를 DB에 채움 — 실제 있었던 종목별 뉴스를 손으로 골라 채운
// 고정 데이터(StockPriceSeeder와 같은 이유로 API 대신 이 방식을 택함). 테이블이
// 비어있을 때만 실행, 재부팅해도 중복 안 됨.
@Component
class StockNewsSeeder(private val repository: StockNewsRepository) : ApplicationRunner {

	override fun run(args: ApplicationArguments) {
		if (repository.count() > 0) return

		val lines = ClassPathResource("seed-data/stock_news.csv")
			.inputStream
			.bufferedReader(Charsets.UTF_8)
			.readLines()
			.drop(1) // header

		val news = lines.filter { it.isNotBlank() }.map { line ->
			val cols = line.split(",")
			StockNews(
				stockCode = cols[0],
				tradeDate = LocalDate.parse(cols[1]),
				headline = cols[2],
				summary = cols[3],
				source = cols[4],
			)
		}

		repository.saveAll(news)
	}
}
