package com.tradinggym.backend.service

import com.tradinggym.backend.entity.StockDailyPrice
import com.tradinggym.backend.repository.StockDailyPriceRepository
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.core.io.ClassPathResource
import org.springframework.stereotype.Component
import java.math.BigDecimal
import java.time.LocalDate

// seed-data/stock_daily_prices.csv를 DB에 채움 — KRX 5종목(삼성전자·SK하이닉스·SKC·
// 삼천당제약·한화오션) 최근 1년 실데이터(Yahoo Finance 조회). 테이블이 비어있을 때만
// 실행, 재부팅해도 중복 안 됨.
@Component
class StockPriceSeeder(private val repository: StockDailyPriceRepository) : ApplicationRunner {

	override fun run(args: ApplicationArguments) {
		if (repository.count() > 0) return

		val lines = ClassPathResource("seed-data/stock_daily_prices.csv")
			.inputStream
			.bufferedReader(Charsets.UTF_8)
			.readLines()
			.drop(1) // header

		val prices = lines.filter { it.isNotBlank() }.map { line ->
			val cols = line.split(",")
			StockDailyPrice(
				stockCode = cols[0],
				stockName = cols[1],
				tradeDate = LocalDate.parse(cols[2]),
				openPrice = BigDecimal(cols[3]),
				highPrice = BigDecimal(cols[4]),
				lowPrice = BigDecimal(cols[5]),
				closePrice = BigDecimal(cols[6]),
				volume = cols[7].toLong(),
			)
		}

		repository.saveAll(prices)
	}
}
