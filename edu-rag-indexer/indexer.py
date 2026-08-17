#!/usr/bin/env python3
"""PDF → 청크 → 임베딩 → pgvector 적재 (SPEC 3절).

  python3 indexer.py                  # 전체
  python3 indexer.py --limit 1        # 테스트용으로 1개만
  python3 indexer.py --file a.pdf     # 단일 파일
  python3 indexer.py --force          # 해시가 같아도 다시 인덱싱(청킹 설정을 바꿨을 때)
  python3 indexer.py --pages-only --force   # edu_pages(읽기용)만 채움 — 임베딩 재계산 없이 빠름
"""

from __future__ import annotations

import argparse
import hashlib
import sys
import time
from pathlib import Path
from typing import Dict, List

from lib import store
from lib.chunking import build_chunks
from lib.embedding import configured_dimension, get_embedder
from lib.pdf_parse import STATUS_OK, parse_pdf
from lib.settings import load_settings
from lib.sources import SourceMeta, load_sources


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def scan_pdfs(raw_dir: Path) -> Dict[str, Path]:
    """raw 디렉터리를 재귀 탐색해 {상대경로: 절대경로}."""
    return {
        path.relative_to(raw_dir).as_posix(): path
        for path in sorted(raw_dir.rglob("*.pdf"))
        if path.is_file()
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="금융교육 PDF RAG 인덱서")
    parser.add_argument("--file", help="특정 PDF만 (data/raw 기준 상대경로)")
    parser.add_argument("--limit", type=int, help="처리할 파일 수 상한 (테스트용)")
    parser.add_argument("--force", action="store_true", help="해시가 같아도 다시 인덱싱")
    parser.add_argument(
        "--pages-only", action="store_true",
        help="edu_pages(읽기용)만 채우고 청크·임베딩은 건드리지 않음 — edu_pages 최초 백필용",
    )
    args = parser.parse_args()

    settings = load_settings()
    started = time.time()

    if not settings.raw_dir.is_dir():
        print("원본 디렉터리가 없습니다: %s" % settings.raw_dir)
        return 1

    try:
        sources = load_sources(settings)
    except (FileNotFoundError, ValueError) as exc:
        print(exc)
        return 1

    pdfs = scan_pdfs(settings.raw_dir)
    print("원본 %d개 · 메타데이터 %d건 (%s)" % (len(pdfs), len(sources), settings.sources_csv))

    # --- 매칭 검증 (SPEC 3-1) ---
    unmatched_pdfs = sorted(set(pdfs) - set(sources))
    missing_files = sorted(set(sources) - set(pdfs))
    for name in unmatched_pdfs:
        print("  ! sources.csv에 없어 제외: %s" % name)
    for name in missing_files:
        print("  ! CSV에 있으나 파일이 없음: %s" % name)

    targets = [name for name in sorted(pdfs) if name in sources]
    if args.file:
        wanted = Path(args.file).name
        targets = [n for n in targets if n == args.file or Path(n).name == wanted]
        if not targets:
            print("대상을 찾지 못했습니다: %s" % args.file)
            return 1
    if args.limit is not None:
        targets = targets[: args.limit]

    if not targets:
        print("인덱싱할 파일이 없습니다.")
        return 1

    dimension = configured_dimension(settings.embedding)
    conn = store.connect(settings.database_url)
    try:
        store.ensure_schema(conn, dimension)
    except RuntimeError as exc:
        print(exc)
        conn.close()
        return 1

    chunk_config = settings.chunking
    embedder = None  # 스킵만 하고 끝나는 경우 모델을 안 올리려고 지연 생성

    counters = {"indexed": 0, "skipped": 0, "failed": 0, "chunks": 0, "pages": 0}
    excluded: List[str] = []

    print("")
    for index, name in enumerate(targets, start=1):
        path = pdfs[name]
        meta: SourceMeta = sources[name]
        print("[%d/%d] %s" % (index, len(targets), name))

        try:
            digest = file_hash(path)
            existing = store.get_document(conn, name)
            if existing and existing["file_hash"] == digest and not args.force:
                counters["skipped"] += 1
                print("      변경 없음 — 스킵 (--force로 강제 재인덱싱)")
                continue

            result = parse_pdf(path, settings.parsing)
            if result.status != STATUS_OK:
                counters["failed"] += 1
                excluded.append("%s (%s)" % (name, result.status))
                print("      제외 — %s (페이지당 평균 %s자, 깨짐 %s)"
                      % (result.status, result.stats.get("avg_chars_per_page"),
                         result.stats.get("garbled_ratio")))
                continue

            document_id = store.upsert_document(conn, meta, digest)

            if args.pages_only:
                inserted_pages = store.insert_pages(conn, document_id, result.pages)
                conn.commit()
                counters["indexed"] += 1
                counters["pages"] += inserted_pages
                print("      페이지만 적재 완료 — %d쪽 (청크·임베딩은 그대로 둠)" % inserted_pages)
                continue

            chunks = build_chunks(
                result.pages,
                int(chunk_config["chunk_size"]),
                int(chunk_config["overlap"]),
                int(chunk_config["min_chunk_size"]),
            )
            if not chunks:
                counters["failed"] += 1
                excluded.append("%s (NO_CHUNKS)" % name)
                print("      제외 — 청크가 만들어지지 않음")
                continue

            print("      %s쪽 · 정제 %s자 · 청크 %d개 (목차 %s쪽 스킵)"
                  % (result.stats.get("page_count"), result.stats.get("clean_chars"),
                     len(chunks), result.stats.get("toc_pages_skipped")))

            if embedder is None:
                print("      임베딩 모델 로딩 중... (첫 실행이면 모델 다운로드가 있습니다)")
                embedder = get_embedder(settings.embedding)
                print("      백엔드: %s (%d차원)" % (embedder.name, embedder.dimension))

            embed_started = time.time()
            vectors = embedder.encode([c.content for c in chunks])
            inserted = store.insert_chunks(conn, document_id, chunks, meta.topic_tags, vectors)
            inserted_pages = store.insert_pages(conn, document_id, result.pages)
            conn.commit()

            counters["indexed"] += 1
            counters["chunks"] += inserted
            counters["pages"] += inserted_pages
            print("      적재 완료 — 청크 %d개 · %d쪽 (%.1f초)"
                  % (inserted, inserted_pages, time.time() - embed_started))

        except KeyboardInterrupt:
            conn.rollback()
            raise
        except Exception as exc:
            conn.rollback()
            counters["failed"] += 1
            excluded.append("%s (%s)" % (name, type(exc).__name__))
            print("      실패 — %s: %s" % (type(exc).__name__, exc))

    totals = store.stats(conn)
    conn.close()

    print("")
    print("=" * 62)
    print("인덱싱 요약  (%.1f초)" % (time.time() - started))
    print("-" * 62)
    print("  대상 파일     : %d개" % len(targets))
    print("  인덱싱        : %d개 (청크 %d개 · 페이지 %d개)" % (counters["indexed"], counters["chunks"], counters["pages"]))
    print("  변경없어 스킵 : %d개" % counters["skipped"])
    print("  실패·제외     : %d개" % counters["failed"])
    if unmatched_pdfs:
        print("  메타데이터 없어 제외: %d개" % len(unmatched_pdfs))
    if excluded:
        print("-" * 62)
        print("  제외 목록:")
        for item in excluded:
            print("    - %s" % item)
    print("-" * 62)
    print("  DB 누적       : 문서 %d개 · 청크 %d개 · 페이지 %d개" % (totals["documents"], totals["chunks"], totals["pages"]))
    print("=" * 62)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n중단했습니다.", file=sys.stderr)
        sys.exit(130)
