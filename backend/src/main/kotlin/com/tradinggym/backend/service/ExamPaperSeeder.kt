package com.tradinggym.backend.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.tradinggym.backend.entity.ExamAction
import com.tradinggym.backend.entity.ExamPaper
import com.tradinggym.backend.entity.ExamTurn
import com.tradinggym.backend.repository.ExamPaperRepository
import com.tradinggym.backend.repository.ExamTurnRepository
import org.slf4j.LoggerFactory
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.core.io.ClassPathResource
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.time.LocalDate

// 모의고사 문제지를 리소스 JSON에서 적재한다. 문제지는 큐레이션된 콘텐츠라
// 코드에 박아넣기보다 데이터로 두는 게 맞고, 문항을 추가할 때 Kotlin을 안 고쳐도 된다.
// (같은 JSON을 mock-exam/export_mock.py가 프론트 목업으로도 뽑는다 — 원본은 로컬 DB.)
@Component
class ExamPaperSeeder(
	private val paperRepository: ExamPaperRepository,
	private val turnRepository: ExamTurnRepository,
	private val objectMapper: ObjectMapper,
) : ApplicationRunner {

	private val log = LoggerFactory.getLogger(javaClass)

	@Transactional
	override fun run(args: ApplicationArguments) {
		val resource = ClassPathResource("seed-data/exam-mock-basic-01.json")
		if (!resource.exists()) {
			log.warn("모의고사 시드 파일이 없어 건너뜁니다")
			return
		}
		val root = resource.inputStream.use { objectMapper.readTree(it) }
		val paperNode = root.path("paper")
		val code = paperNode.path("code").asText()

		// 이미 있으면 아무것도 하지 않는다 — 응시 기록이 붙어 있을 수 있어 재적재는 위험하다.
		if (paperRepository.findByCode(code) != null) return

		val paper = paperRepository.save(
			ExamPaper(
				code = code,
				title = paperNode.path("title").asText(),
				description = paperNode.path("description").asText(null),
				difficulty = paperNode.path("difficulty").asText("NORMAL"),
				totalTurns = paperNode.path("totalTurns").asInt(),
				startingCash = paperNode.path("startingCash").asLong(),
			),
		)

		root.path("turns").forEach { t ->
			val outcome = t.path("outcome")
			turnRepository.save(
				ExamTurn(
					paper = paper,
					turnNo = t.path("turnNo").asInt(),
					stockName = t.path("stockName").asText(),
					sector = t.path("sector").asText(null),
					asOfDate = LocalDate.parse(t.path("asOfDate").asText()),
					price = t.path("price").asLong(),
					holdingQty = t.path("holdingQty").asInt(0),
					avgBuyPrice = t.path("avgBuyPrice").takeIf { n -> !n.isNull }?.asLong(),
					chartPoints = t.path("chartPoints").toString(),
					news = t.path("news").toString(),
					disclosure = t.path("disclosure").takeIf { n -> !n.isNull }?.toString(),
					outcomePoints = outcome.path("points").toString(),
					outcomeChangePct = BigDecimal.valueOf(outcome.path("changePct").asDouble()),
					outcomeSummary = outcome.path("summary").asText(),
					idealAction = ExamAction.valueOf(outcome.path("idealAction").asText()),
					idealRationale = outcome.path("idealRationale").asText(),
					learningPoint = outcome.path("learningPoint").asText(),
				),
			)
		}
		log.info("모의고사 문제지 적재: $code (턴 ${root.path("turns").size()}개)")
	}

	private fun JsonNode.asText(default: String?): String? =
		if (isNull || isMissingNode) default else asText()
}
