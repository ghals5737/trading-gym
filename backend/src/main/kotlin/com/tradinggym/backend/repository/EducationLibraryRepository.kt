package com.tradinggym.backend.repository

import com.tradinggym.backend.dto.LibraryDocumentResponse
import com.tradinggym.backend.dto.LibraryPageResponse
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet

// edu_documents/edu_pages는 edu-rag-indexer(파이썬)가 만들고 관리하는 테이블 — Hibernate가
// 스키마를 건드리면 안 되니 @Entity로 안 만들고 JdbcTemplate으로 읽기 전용 조회만 함.
// edu_pages는 edu_chunks(검색용, 오버랩 있음)와 별개로 오버랩 없는 원본 페이지 텍스트를
// 담은 읽기 전용 테이블 — 자료실 본문 보기는 이걸 씀.
@Repository
class EducationLibraryRepository(private val jdbcTemplate: JdbcTemplate) {

	fun listDocuments(): List<LibraryDocumentResponse> = jdbcTemplate.query(
		"""
		SELECT d.id, d.title, d.org_name, d.target, d.year, d.source_url,
		       count(p.id) AS page_count, min(p.page_number) AS min_page, max(p.page_number) AS max_page
		FROM edu_documents d
		LEFT JOIN edu_pages p ON p.document_id = d.id
		GROUP BY d.id, d.title, d.org_name, d.target, d.year, d.source_url
		ORDER BY d.id
		""".trimIndent(),
	) { rs, _ -> mapDocument(rs) }

	fun findDocument(id: Int): LibraryDocumentResponse? = jdbcTemplate.query(
		"""
		SELECT d.id, d.title, d.org_name, d.target, d.year, d.source_url,
		       count(p.id) AS page_count, min(p.page_number) AS min_page, max(p.page_number) AS max_page
		FROM edu_documents d
		LEFT JOIN edu_pages p ON p.document_id = d.id
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
	)
}
