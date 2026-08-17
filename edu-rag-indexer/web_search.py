#!/usr/bin/env python3
"""검색을 웹 브라우저에서 눈으로 확인하기 위한 로컬 서버 (search.py를 감싼 얇은 레이어).

  .venv/bin/python web_search.py
  → http://localhost:8123 에서 검색창에 질의 입력

임베딩 모델은 서버 시작할 때 한 번만 로드해서, 검색할 때마다 다시 안 불러오게 함
(모델 로딩이 초 단위로 걸려서 요청마다 하면 너무 느림).
"""

from __future__ import annotations

import html
import json
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import psycopg

from lib import store
from lib.embedding import get_embedder
from lib.settings import load_settings

PORT = 8123

# store.search()가 실제로 실행하는 쿼리 그대로 — 화면에 보여주기용으로 여기 복사해둠.
# (tags/target 필터를 안 쓰면 WHERE 절이 빠짐)
SEARCH_SQL_TEMPLATE = """SELECT 1 - (c.embedding <=> %(query_vector)s::vector) AS score,
       d.title, d.org_name, d.target, d.filename, d.source_url,
       c.page_start, c.page_end, c.topic_tags, c.content, c.chunk_index
FROM edu_chunks c
JOIN edu_documents d ON d.id = c.document_id
ORDER BY c.embedding <=> %(query_vector)s::vector
LIMIT %(top_k)s"""

PAGE_TEMPLATE = """<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>edu-rag-indexer 검색</title>
<style>
  :root {{ --bg: #f7f4ee; --ink: #23231d; --soft: #6e695e; --muted: #9a9488;
    --green: #1b7a5a; --green-chip: #e4f0e9; --line: #efeae0; --white: #ffffff;
    --code-bg: #f0ede4; }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; background: var(--bg); color: var(--ink);
    font-family: "Pretendard", -apple-system, "Apple SD Gothic Neo", "Segoe UI", sans-serif; }}
  main {{ max-width: 760px; margin: 0 auto; padding: 48px 24px 100px; }}
  h1 {{ font-size: 22px; margin: 0 0 6px; }}
  .sub {{ font-size: 13px; color: var(--muted); margin: 0 0 28px; }}
  form {{ display: flex; gap: 8px; margin-bottom: 24px; }}
  input[type=text] {{ flex: 1; height: 46px; border: 1px solid var(--line); border-radius: 12px;
    padding: 0 16px; font-size: 15px; background: var(--white); color: var(--ink); }}
  button {{ height: 46px; padding: 0 22px; border: 0; border-radius: 12px; background: var(--green);
    color: white; font-size: 14px; font-weight: 700; cursor: pointer; }}
  .meta {{ font-size: 12px; color: var(--muted); margin-bottom: 10px; }}
  code, pre {{ font-family: "SF Mono", Menlo, monospace; }}
  pre {{ background: var(--code-bg); border-radius: 10px; padding: 14px 16px; font-size: 12px;
    line-height: 1.6; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }}
  .sql-block summary {{ cursor: pointer; font-size: 13px; font-weight: 700; color: var(--soft); margin: 0 0 24px; }}
  .result {{ background: var(--white); border: 1px solid var(--line); border-radius: 14px;
    padding: 16px 18px; margin-bottom: 12px; }}
  .result .score {{ font-size: 12px; font-weight: 800; color: var(--green); }}
  .result .src {{ font-size: 12px; color: var(--muted); margin: 2px 0 8px; }}
  .result .tags {{ font-size: 11px; color: var(--soft); margin-bottom: 8px; }}
  .result p {{ margin: 0; font-size: 13px; line-height: 1.6; color: var(--ink); }}
  .empty {{ font-size: 13px; color: var(--muted); }}
</style>
</head>
<body>
<main>
  <h1>edu-rag-indexer 검색</h1>
  <p class="sub">자연어 질의 → BAAI/bge-m3 임베딩 → pgvector 코사인 유사도 검색 (edu_chunks {chunk_count}개)</p>
  <form method="get" action="/">
    <input type="text" name="q" value="{query_escaped}" placeholder="예: 신용거래 반대매매가 뭐야" autofocus />
    <button type="submit">검색</button>
  </form>
  <details class="sql-block" {open_attr}>
    <summary>실제 실행되는 SQL 쿼리 보기</summary>
    <pre>{sql_escaped}</pre>
  </details>
  {results_html}
</main>
</body>
</html>"""


def render_results(query: str, results: list, elapsed_ms: float) -> str:
    if not query:
        return ""
    if not results:
        return '<p class="empty">결과가 없습니다.</p>'
    parts = [f'<p class="meta">"{html.escape(query)}" 검색 · {len(results)}건 · {elapsed_ms:.0f}ms (임베딩+쿼리 합산)</p>']
    for r in results:
        pages = f"{r['page_start']}쪽" if r["page_start"] == r["page_end"] else f"{r['page_start']}–{r['page_end']}쪽"
        tags = ", ".join(r["topic_tags"][:5]) if r["topic_tags"] else ""
        parts.append(f"""
        <div class="result">
          <div class="score">유사도 {r['score']:.4f}</div>
          <div class="src">{html.escape(r['title'] or r['filename'])} · {html.escape(r['org_name'] or '기관미상')} · {pages}</div>
          {f'<div class="tags">태그: {html.escape(tags)}</div>' if tags else ''}
          <p>{html.escape(' '.join(r['content'].split()))}</p>
        </div>""")
    return "\n".join(parts)


class Handler(BaseHTTPRequestHandler):
    embedder = None
    conn = None
    chunk_count = 0
    database_url = None
    # ThreadingHTTPServer는 요청마다 스레드를 만드는데 psycopg 커넥션은 동시 사용이 안 된다
    # ("another command is already in progress"로 깨짐 — 실제로 겪음). 검색 QPS가 낮으니
    # 커넥션 풀 대신 락 하나로 직렬화하고, 죽은 커넥션(RDS 유휴 끊김 등)은 재접속한다.
    db_lock = threading.Lock()

    @classmethod
    def db_search(cls, query_vector, top_k, tags=None, target=None):
        with cls.db_lock:
            for attempt in (1, 2):
                try:
                    return store.search(cls.conn, query_vector, top_k=top_k, tags=tags, target=target)
                except psycopg.OperationalError as exc:
                    if attempt == 2:
                        raise
                    print("  ! DB 커넥션 재접속 (%s)" % str(exc).splitlines()[0])
                    try:
                        cls.conn.close()
                    except Exception:
                        pass
                    cls.conn = store.connect(cls.database_url)
                    cls.conn.autocommit = True

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/search":
            self.handle_api_search(parsed)
            return
        self.handle_page(parsed)

    def handle_api_search(self, parsed):
        params = urllib.parse.parse_qs(parsed.query)
        query = (params.get("q", [""])[0]).strip()
        top_k = int((params.get("top_k", ["5"])[0]))
        tags = params.get("tags")  # ?tags=레버리지&tags=대출 형태로 여러 번 줄 수 있음
        target = (params.get("target", [None])[0])

        if not query:
            self.respond_json({"error": "q 파라미터가 필요합니다"}, status=400)
            return

        start = time.time()
        query_vector = self.embedder.encode([query])[0]
        results = self.db_search(query_vector, top_k=top_k, tags=tags, target=target)
        elapsed_ms = (time.time() - start) * 1000

        payload = {
            "query": query,
            "elapsed_ms": round(elapsed_ms, 1),
            "results": [
                {
                    "score": round(r["score"], 4),
                    "title": r["title"] or r["filename"],
                    "org_name": r["org_name"],
                    "page_start": r["page_start"],
                    "page_end": r["page_end"],
                    "topic_tags": r["topic_tags"],
                    "content": r["content"],
                }
                for r in results
            ],
        }
        self.respond_json(payload)

    def respond_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_page(self, parsed):
        params = urllib.parse.parse_qs(parsed.query)
        query = (params.get("q", [""])[0]).strip()

        results, elapsed_ms = [], 0.0
        if query:
            start = time.time()
            query_vector = self.embedder.encode([query])[0]
            results = self.db_search(query_vector, top_k=5)
            elapsed_ms = (time.time() - start) * 1000

        body = PAGE_TEMPLATE.format(
            chunk_count=self.chunk_count,
            query_escaped=html.escape(query),
            open_attr="open" if query else "",
            sql_escaped=html.escape(SEARCH_SQL_TEMPLATE),
            results_html=render_results(query, results, elapsed_ms),
        )
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def log_message(self, fmt, *args):
        print("  " + (fmt % args))


def main():
    print("설정 로드 중...")
    settings = load_settings()
    conn = store.connect(settings.database_url)
    conn.autocommit = True  # 읽기 전용 서버 — 트랜잭션을 열어두면 유휴 끊김 시 복구가 안 됨
    totals = store.stats(conn)
    print(f"DB 연결됨 — 문서 {totals['documents']}개, 청크 {totals['chunks']}개")

    print("임베딩 모델 로딩 중 (처음 한 번, 캐시돼 있으면 몇 초)...")
    embedder = get_embedder(settings.embedding)
    print(f"모델 준비됨: {embedder.name}")

    Handler.embedder = embedder
    Handler.conn = conn
    Handler.chunk_count = totals["chunks"]
    Handler.database_url = settings.database_url

    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"\n검색 서버 실행 중: http://localhost:{PORT}\n(Ctrl+C로 종료)")
    server.serve_forever()


if __name__ == "__main__":
    main()
