"""PDF 파싱 — 페이지별 텍스트 추출 + 머리글/바닥글 제거 + 품질 판정.

품질 판정을 파서 안에 둔 이유: "억지로 넣지 말 것"(SPEC 4-1)이 요구사항이라
인덱서가 넣을지 말지를 이 결과만 보고 결정할 수 있어야 해서다.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Set

import fitz  # pymupdf

STATUS_OK = "OK"
STATUS_NEEDS_OCR = "NEEDS_OCR"  # 텍스트 레이어 없음(스캔본) — OCR은 범위 외
STATUS_GARBLED = "GARBLED"  # 폰트 매핑이 깨져 한글이 안 나옴
STATUS_EMPTY = "EMPTY"

# 폰트에 글리프 매핑이 없을 때 pymupdf가 뱉는 형태 + 유니코드 대체문자
GARBLED_PATTERN = re.compile(r"\(cid:\d+\)|�")
# 목차 특유의 리더("1장 서론 ......... 12") 또는 끝이 페이지번호인 줄.
# 리더 문자는 책마다 제각각이라(가운뎃점·중점·말줄임표) 문자군으로 묶어 잡는다.
TOC_LINE_PATTERN = re.compile(
    r"[.·・･．…‥⋯⋅∙•]{4,}\s*\d{1,4}\s*$"  # 리더 + 페이지번호
    r"|^\s*\S.{0,60}?\s{2,}\d{1,4}\s*$"  # "제목    12" 처럼 공백으로 벌어진 형태
)
DIGITS = re.compile(r"\d+")


@dataclass
class Page:
    number: int  # 1-based
    text: str


@dataclass
class ParseResult:
    path: Path
    pages: List[Page]
    status: str
    stats: Dict[str, object] = field(default_factory=dict)
    removed_lines: List[str] = field(default_factory=list)
    toc_pages: List[int] = field(default_factory=list)

    @property
    def total_chars(self) -> int:
        return sum(len(p.text) for p in self.pages)

    @property
    def indexable(self) -> bool:
        return self.status == STATUS_OK


def extract_raw_pages(path: Path) -> List[str]:
    with fitz.open(path) as document:
        return [page.get_text("text") for page in document]


def _normalize_line(line: str) -> str:
    """페이지 번호만 다른 머리글/바닥글을 같은 것으로 묶기 위해 숫자를 뭉갠다."""
    return DIGITS.sub("#", re.sub(r"\s+", " ", line.strip()))


def find_repeated_lines(raw_pages: List[str], scan_lines: int, min_ratio: float) -> Set[str]:
    """모든 페이지의 앞/뒤 몇 줄을 모아, 일정 비율 이상 반복되는 줄을 골라낸다."""
    if len(raw_pages) < 4:  # 표본이 적으면 우연히 겹친 걸 머리글로 오인한다
        return set()

    counts: Dict[str, int] = {}
    for text in raw_pages:
        lines = [ln for ln in text.splitlines() if ln.strip()]
        if not lines:
            continue
        candidates = lines[:scan_lines] + lines[-scan_lines:]
        for line in set(_normalize_line(ln) for ln in candidates):
            if 0 < len(line) <= 100:
                counts[line] = counts.get(line, 0) + 1

    threshold = max(3, int(len(raw_pages) * min_ratio))
    return {line for line, count in counts.items() if count >= threshold}


def strip_repeated_lines(text: str, repeated: Set[str], scan_lines: int) -> str:
    """앞/뒤 영역에서만 지운다 — 본문 중간에 같은 문구가 나오면 남겨야 하니까."""
    lines = text.splitlines()
    if not lines:
        return text

    keep = []
    last = len(lines) - 1
    for index, line in enumerate(lines):
        near_edge = index < scan_lines * 2 or index > last - scan_lines * 2
        if near_edge and line.strip() and _normalize_line(line) in repeated:
            continue
        keep.append(line)
    return "\n".join(keep)


def looks_like_toc(text: str) -> bool:
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if len(lines) < 5:
        return False
    hits = sum(1 for ln in lines if TOC_LINE_PATTERN.search(ln))
    return hits >= max(4, len(lines) * 0.4)


def garbled_ratio(text: str) -> float:
    if not text:
        return 0.0
    broken = sum(len(m.group(0)) for m in GARBLED_PATTERN.finditer(text))
    return broken / len(text)


def hangul_ratio(text: str) -> float:
    if not text:
        return 0.0
    hangul = sum(1 for ch in text if "가" <= ch <= "힣")
    return hangul / len(text)


def parse_pdf(path: Path, parsing_config: Dict[str, object]) -> ParseResult:
    scan_min = int(parsing_config.get("scan_min_chars_per_page", 50))
    scan_lines = int(parsing_config.get("header_footer_scan_lines", 2))
    min_ratio = float(parsing_config.get("header_footer_min_ratio", 0.5))
    skip_toc = bool(parsing_config.get("skip_toc", True))
    garbled_max = float(parsing_config.get("garbled_max_ratio", 0.02))

    raw_pages = extract_raw_pages(path)
    page_count = len(raw_pages)
    if page_count == 0:
        return ParseResult(path=path, pages=[], status=STATUS_EMPTY, stats={"page_count": 0})

    raw_chars = sum(len(t) for t in raw_pages)
    avg_chars = raw_chars / page_count
    ratio_broken = garbled_ratio("".join(raw_pages[:50]))

    stats = {
        "page_count": page_count,
        "raw_chars": raw_chars,
        "avg_chars_per_page": round(avg_chars, 1),
        "garbled_ratio": round(ratio_broken, 4),
        "hangul_ratio": round(hangul_ratio("".join(raw_pages[:20])), 3),
    }

    # 스캔본 판정이 먼저 — 깨진 게 아니라 애초에 텍스트가 없는 것이라 원인이 다르다.
    if avg_chars < scan_min:
        return ParseResult(path=path, pages=[], status=STATUS_NEEDS_OCR, stats=stats)
    if ratio_broken > garbled_max:
        return ParseResult(path=path, pages=[], status=STATUS_GARBLED, stats=stats)

    repeated = find_repeated_lines(raw_pages, scan_lines, min_ratio)
    pages: List[Page] = []
    toc_pages: List[int] = []

    for index, text in enumerate(raw_pages, start=1):
        cleaned = strip_repeated_lines(text, repeated, scan_lines)
        if skip_toc and looks_like_toc(cleaned):
            toc_pages.append(index)
            continue
        cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
        if cleaned:
            pages.append(Page(number=index, text=cleaned))

    stats["clean_chars"] = sum(len(p.text) for p in pages)
    stats["removed_header_footer"] = len(repeated)
    stats["toc_pages_skipped"] = len(toc_pages)

    status = STATUS_OK if pages else STATUS_EMPTY
    return ParseResult(
        path=path,
        pages=pages,
        status=status,
        stats=stats,
        removed_lines=sorted(repeated),
        toc_pages=toc_pages,
    )
