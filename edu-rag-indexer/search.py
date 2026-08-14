#!/usr/bin/env python3
"""검색 검증 CLI (SPEC 6절).

  python3 search.py "레버리지 투자의 위험성" --top-k 5
  python3 search.py "반대매매가 뭐야" --tags 레버리지 --target U

질의를 임베딩해 코사인 유사도 상위 청크를 문서명·페이지와 함께 보여준다.
"질의하면 어느 자료 몇 페이지가 근거로 나오는지"를 그 자리에서 보여주는 용도.
"""

from __future__ import annotations

import argparse
import sys
import textwrap

from lib import store
from lib.embedding import get_embedder
from lib.settings import load_settings


def main() -> int:
    parser = argparse.ArgumentParser(description="RAG 검색 검증")
    parser.add_argument("query", help="검색 질의")
    parser.add_argument("--top-k", type=int, default=5, help="가져올 청크 수 (기본 5)")
    parser.add_argument("--tags", nargs="*", help="주제 태그 필터 (하나라도 겹치면 통과)")
    parser.add_argument("--target", help="교육대상 필터 (Y/U/A)")
    parser.add_argument("--chars", type=int, default=200, help="본문 미리보기 길이 (기본 200)")
    args = parser.parse_args()

    settings = load_settings()
    conn = store.connect(settings.database_url)

    totals = store.stats(conn)
    if totals["chunks"] == 0:
        print("인덱싱된 청크가 없습니다. 먼저 indexer.py를 실행하세요.")
        conn.close()
        return 1

    embedder = get_embedder(settings.embedding)
    query_vector = embedder.encode([args.query])[0]

    results = store.search(conn, query_vector, args.top_k, args.tags, args.target)
    conn.close()

    filters = []
    if args.tags:
        filters.append("tags=%s" % ",".join(args.tags))
    if args.target:
        filters.append("target=%s" % args.target)

    print("")
    print('질의: "%s"' % args.query)
    print("필터: %s" % (" · ".join(filters) if filters else "없음"))
    print("대상: 문서 %d개 · 청크 %d개 · %s" % (totals["documents"], totals["chunks"], embedder.name))
    print("=" * 78)

    if not results:
        print("결과가 없습니다. 필터를 풀거나 질의를 바꿔보세요.")
        return 0

    for rank, row in enumerate(results, start=1):
        pages = ("%d쪽" % row["page_start"] if row["page_start"] == row["page_end"]
                 else "%d–%d쪽" % (row["page_start"], row["page_end"]))
        print("[%d] 유사도 %.4f" % (rank, row["score"]))
        print("    %s · %s · %s" % (row["title"] or row["filename"], row["org_name"] or "기관미상", pages))
        if row["topic_tags"]:
            print("    태그: %s%s" % (", ".join(row["topic_tags"][:5]),
                                     " (대상 %s)" % row["target"] if row["target"] else ""))
        preview = " ".join(row["content"].split())[: args.chars]
        for line in textwrap.wrap(preview, width=72):
            print("    | %s" % line)
        print("")

    return 0


if __name__ == "__main__":
    sys.exit(main())
