#!/usr/bin/env python3
"""파싱 품질 샘플 검증 (SPEC 4-1).

인덱싱 전에 PDF를 골라 추출 텍스트 앞부분을 눈으로 확인한다. 한글 깨짐,
표 뭉개짐, 세로쓰기 오류를 사람이 직접 보고 제외 여부를 판단하기 위한 도구.

  python3 inspect_parse.py                 # data/raw의 모든 PDF 요약 + 앞 2000자
  python3 inspect_parse.py --chars 500     # 미리보기 길이 조정
  python3 inspect_parse.py --file a.pdf    # 특정 파일만
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from lib.pdf_parse import STATUS_OK, hangul_ratio, parse_pdf
from lib.settings import load_settings


def main() -> int:
    parser = argparse.ArgumentParser(description="PDF 파싱 품질 샘플 검증")
    parser.add_argument("--file", help="특정 PDF만 (data/raw 기준 상대경로 또는 절대경로)")
    parser.add_argument("--chars", type=int, default=2000, help="미리보기 글자 수 (기본 2000)")
    parser.add_argument("--page", type=int, help="특정 페이지만 미리보기")
    args = parser.parse_args()

    settings = load_settings()
    raw_dir = settings.raw_dir
    if not raw_dir.is_dir():
        print("원본 디렉터리가 없습니다: %s" % raw_dir)
        return 1

    if args.file:
        candidate = Path(args.file)
        targets = [candidate if candidate.is_absolute() else raw_dir / args.file]
    else:
        targets = sorted(p for p in raw_dir.rglob("*.pdf") if p.is_file())

    if not targets:
        print("검사할 PDF가 없습니다: %s" % raw_dir)
        return 1

    problem_files = []
    for path in targets:
        print("=" * 78)
        print("파일: %s (%.1f MB)" % (path.name, path.stat().st_size / 1024 / 1024))
        try:
            result = parse_pdf(path, settings.parsing)
        except Exception as exc:
            print("  파싱 실패 — %s: %s" % (type(exc).__name__, exc))
            problem_files.append((path.name, "PARSE_ERROR"))
            continue

        stats = result.stats
        print("  상태: %s" % result.status)
        print("  페이지 %s개 · 원문 %s자 · 페이지당 평균 %s자"
              % (stats.get("page_count"), stats.get("raw_chars"), stats.get("avg_chars_per_page")))
        print("  깨짐 비율(cid/�): %s · 한글 비율: %s"
              % (stats.get("garbled_ratio"), stats.get("hangul_ratio")))
        if result.status == STATUS_OK:
            print("  정제 후 %s자 · 머리글/바닥글 %s종 제거 · 목차 %s쪽 스킵"
                  % (stats.get("clean_chars"), stats.get("removed_header_footer"),
                     stats.get("toc_pages_skipped")))
            if result.removed_lines:
                print("  제거된 반복 줄(최대 5개): %s" % result.removed_lines[:5])
        else:
            problem_files.append((path.name, result.status))

        print("-" * 78)
        if result.pages:
            if args.page:
                pages = [p for p in result.pages if p.number == args.page]
                if not pages:
                    print("  (%d쪽은 스킵됐거나 비어 있습니다)" % args.page)
                    continue
            else:
                pages = result.pages
            preview = "\n".join(p.text for p in pages)[: args.chars]
            print(preview)
            print("-" * 78)
            print("  한글 비율(미리보기 구간): %.3f" % hangul_ratio(preview))
        else:
            print("  (추출된 본문 없음)")
        print()

    print("=" * 78)
    if problem_files:
        print("인덱싱 제외 후보:")
        for name, status in problem_files:
            print("  - %s (%s)" % (name, status))
    else:
        print("모든 파일이 파싱 가능 상태(OK)입니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
