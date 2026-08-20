package com.tradinggym.backend.repository

import com.tradinggym.backend.dto.LibraryArticleDetailResponse
import com.tradinggym.backend.dto.LibraryArticleSummaryResponse
import com.tradinggym.backend.dto.LibraryDocumentResponse
import com.tradinggym.backend.dto.LibraryPageResponse
import com.tradinggym.backend.entity.SessionStatKey
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet

// edu_documents/edu_pages/edu_articles는 edu-rag-indexer(파이썬)가 만들고 관리하는 테이블 —
// Hibernate가 스키마를 건드리면 안 되니 @Entity로 안 만들고 JdbcTemplate으로 읽기 전용 조회만 함.
// edu_pages는 edu_chunks(검색용, 오버랩 있음)와 별개로 오버랩 없는 원본 페이지 텍스트를 담고,
// edu_articles는 그 페이지들을 LLM이 주제별로 묶어 블로그 형식으로 재작성한 결과 —
// 자료실 화면은 이제 edu_articles를 기본으로 보여줌(원문은 필요하면 edu_pages로 확인 가능).
@Repository
class EducationLibraryRepository(private val jdbcTemplate: JdbcTemplate) {

	fun listDocuments(): List<LibraryDocumentResponse> = jdbcTemplate.query(
		"""
		SELECT d.id, d.title, d.org_name, d.target, d.year, d.source_url,
		       count(DISTINCT p.id) AS page_count, min(p.page_number) AS min_page, max(p.page_number) AS max_page,
		       count(DISTINCT a.id) AS article_count
		FROM edu_documents d
		LEFT JOIN edu_pages p ON p.document_id = d.id
		LEFT JOIN edu_articles a ON a.document_id = d.id
		GROUP BY d.id, d.title, d.org_name, d.target, d.year, d.source_url
		ORDER BY d.id
		""".trimIndent(),
	) { rs, _ -> mapDocument(rs) }

	fun findDocument(id: Int): LibraryDocumentResponse? = jdbcTemplate.query(
		"""
		SELECT d.id, d.title, d.org_name, d.target, d.year, d.source_url,
		       count(DISTINCT p.id) AS page_count, min(p.page_number) AS min_page, max(p.page_number) AS max_page,
		       count(DISTINCT a.id) AS article_count
		FROM edu_documents d
		LEFT JOIN edu_pages p ON p.document_id = d.id
		LEFT JOIN edu_articles a ON a.document_id = d.id
		WHERE d.id = ?
		GROUP BY d.id, d.title, d.org_name, d.target, d.year, d.source_url
		""".trimIndent(),
		{ rs, _ -> mapDocument(rs) },
		id,
	).firstOrNull()

	fun countPages(documentId: Int): Int =
		jdbcTemplate.queryForObject("SELECT count(*) FROM edu_pages WHERE document_id = ?", Int::class.java, documentId) ?: 0

	fun listPages(documentId: Int, offset: Int, limit: Int): List<LibraryPageResponse> = jdbcTemplate.query(
		"""
		SELECT page_number, content
		FROM edu_pages
		WHERE document_id = ?
		ORDER BY page_number
		LIMIT ? OFFSET ?
		""".trimIndent(),
		{ rs, _ ->
			LibraryPageResponse(
				pageNumber = rs.getInt("page_number"),
				content = rs.getString("content"),
			)
		},
		documentId, limit, offset,
	)

	fun listArticles(documentId: Int, statKey: SessionStatKey?, offset: Int, limit: Int): List<LibraryArticleSummaryResponse> {
		val params = mutableListOf<Any>(documentId)
		val statFilter = if (statKey != null) {
			params.add(statKey.name)
			"AND target_stat_key = ?"
		} else {
			""
		}
		params.add(limit)
		params.add(offset)
		return jdbcTemplate.query(
			"""
			SELECT id, title, page_start, page_end, topic_summary, target_stat_key
			FROM edu_articles
			WHERE document_id = ? $statFilter
			ORDER BY page_start
			LIMIT ? OFFSET ?
			""".trimIndent(),
			{ rs, _ -> mapArticleSummary(rs) },
			*params.toTypedArray(),
		)
	}

	fun countArticles(documentId: Int, statKey: SessionStatKey?): Int =
		if (statKey != null) {
			jdbcTemplate.queryForObject(
				"SELECT count(*) FROM edu_articles WHERE document_id = ? AND target_stat_key = ?",
				Int::class.java, documentId, statKey.name,
			) ?: 0
		} else {
			jdbcTemplate.queryForObject(
				"SELECT count(*) FROM edu_articles WHERE document_id = ?",
				Int::class.java, documentId,
			) ?: 0
		}

	// 필터 칩 옆에 "판단 정확도 (58)"처럼 지표별 개수를 보여주려고 씀.
	fun countArticlesByStatKey(documentId: Int): Map<SessionStatKey, Int> = jdbcTemplate.query(
		"""
		SELECT target_stat_key, count(*) AS cnt
		FROM edu_articles
		WHERE document_id = ? AND target_stat_key IS NOT NULL
		GROUP BY target_stat_key
		""".trimIndent(),
		{ rs, _ -> SessionStatKey.valueOf(rs.getString("target_stat_key")) to rs.getInt("cnt") },
		documentId,
	).toMap()

	fun findArticle(articleId: Int): LibraryArticleDetailResponse? = jdbcTemplate.query(
		"""
		SELECT a.id, a.document_id, d.title AS document_title, d.org_name,
		       a.title, a.body, a.page_start, a.page_end, a.target_stat_key
		FROM edu_articles a
		JOIN edu_documents d ON d.id = a.document_id
		WHERE a.id = ?
		""".trimIndent(),
		{ rs, _ ->
			LibraryArticleDetailResponse(
				id = rs.getInt("id"),
				documentId = rs.getInt("document_id"),
				documentTitle = rs.getString("document_title"),
				orgName = rs.getString("org_name"),
				title = rs.getString("title"),
				body = rs.getString("body"),
				pageStart = rs.getInt("page_start"),
				pageEnd = rs.getInt("page_end"),
				targetStatKey = rs.getString("target_stat_key")?.let { SessionStatKey.valueOf(it) },
			)
		},
		articleId,
	).firstOrNull()

	private fun mapArticleSummary(rs: ResultSet) = LibraryArticleSummaryResponse(
		id = rs.getInt("id"),
		title = rs.getString("title"),
		pageStart = rs.getInt("page_start"),
		pageEnd = rs.getInt("page_end"),
		topicSummary = rs.getString("topic_summary"),
		targetStatKey = rs.getString("target_stat_key")?.let { SessionStatKey.valueOf(it) },
	)

	private fun mapDocument(rs: ResultSet) = LibraryDocumentResponse(
		id = rs.getInt("id"),
		title = rs.getString("title") ?: "제목 없음",
		orgName = rs.getString("org_name"),
		target = rs.getString("target"),
		year = rs.getString("year"),
		sourceUrl = rs.getString("source_url"),
		pageCount = rs.getInt("page_count"),
		minPage = rs.getObject("min_page") as Int?,
		maxPage = rs.getObject("max_page") as Int?,
		articleCount = rs.getInt("article_count"),
	)
}
