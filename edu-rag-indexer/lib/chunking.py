"""청킹 — 문단 경계를 우선하고, 문단이 너무 길면 문장 경계로 쪼갠다(SPEC 3-3).

PDF에서 뽑은 텍스트는 빈 줄로 문단이 나뉘는 경우도, 줄바꿈만 잔뜩 있는 경우도 있다.
그래서 "빈 줄 → 문단, 너무 길면 문장, 그래도 길면 강제 절단" 3단으로 내려간다.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Sequence

from .pdf_parse import Page

PARAGRAPH_SPLIT = re.compile(r"\n\s*\n")
# 한국어 종결(다./요./음.) + 서구식 문장부호. 뒤에 공백/줄바꿈이 와야 문장 끝으로 본다.
SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|(?<=[다요음])\.\s+|(?<=[.!?])\n")


@dataclass
class Chunk:
    index: int
    content: str
    page_start: int
    page_end: int


@dataclass
class _Unit:
    text: str
    page: int


def _hard_split(text: str, limit: int) -> List[str]:
    return [text[i:i + limit] for i in range(0, len(text), limit)]


def _split_long(text: str, limit: int) -> List[str]:
    """문단이 limit보다 길면 문장 단위로, 문장도 길면 강제로 자른다."""
    pieces: List[str] = []
    buffer = ""
    for sentence in SENTENCE_SPLIT.split(text):
        sentence = (sentence or "").strip()
        if not sentence:
            continue
        if len(sentence) > limit:
            if buffer:
                pieces.append(buffer)
                buffer = ""
            pieces.extend(_hard_split(sentence, limit))
            continue
        if len(buffer) + len(sentence) + 1 <= limit:
            buffer = (buffer + " " + sentence).strip()
        else:
            pieces.append(buffer)
            buffer = sentence
    if buffer:
        pieces.append(buffer)
    return pieces


def build_units(pages: Sequence[Page], limit: int) -> List[_Unit]:
    units: List[_Unit] = []
    for page in pages:
        for paragraph in PARAGRAPH_SPLIT.split(page.text):
            paragraph = re.sub(r"[ \t]+", " ", (paragraph or "").strip())
            if not paragraph:
                continue
            if len(paragraph) <= limit:
                units.append(_Unit(paragraph, page.number))
            else:
                for piece in _split_long(paragraph, limit):
                    if piece.strip():
                        units.append(_Unit(piece.strip(), page.number))
    return units


def _overlap_seed(units: List[_Unit], overlap: int) -> List[_Unit]:
    """직전 청크 꼬리 overlap 글자를 다음 청크 앞에 붙인다.

    유닛을 통째로 가져오면 마지막 유닛이 길 때 오버랩이 수백 자로 불어나
    청크가 설정값을 훌쩍 넘는다. 그래서 글자 수로 자르되, 가능하면 공백에서 끊는다.
    """
    if overlap <= 0 or not units:
        return []

    tail = ""
    page = units[-1].page
    for unit in reversed(units):
        remaining = overlap - len(tail)
        if remaining <= 0:
            break
        if len(unit.text) <= remaining:
            tail = unit.text + ("\n" + tail if tail else "")
            page = unit.page
        else:
            piece = unit.text[-remaining:]
            space = piece.find(" ")
            if 0 <= space < len(piece) - 20:  # 단어 중간에서 시작하지 않도록
                piece = piece[space + 1:]
            tail = piece + ("\n" + tail if tail else "")
            page = unit.page
            break

    tail = tail.strip()
    return [_Unit(tail, page)] if tail else []


def build_chunks(pages: Sequence[Page], chunk_size: int, overlap: int, min_chunk_size: int) -> List[Chunk]:
    # 오버랩(최대 overlap자)까지 더해도 chunk_size를 넘지 않도록 유닛 상한을 미리 낮춘다.
    unit_limit = max(chunk_size - overlap, min_chunk_size, 100)
    units = build_units(pages, unit_limit)
    if not units:
        return []

    groups: List[List[_Unit]] = []
    current: List[_Unit] = []
    current_len = 0

    for unit in units:
        addition = len(unit.text) + (1 if current else 0)
        if current and current_len + addition > chunk_size:
            groups.append(current)
            current = _overlap_seed(current, overlap)
            current_len = sum(len(u.text) + 1 for u in current)
        current.append(unit)
        current_len += addition
    if current:
        groups.append(current)

    # 너무 짧은 청크는 인접 청크에 합친다(SPEC 3-3).
    merged: List[List[_Unit]] = []
    for group in groups:
        text_len = sum(len(u.text) for u in group)
        if merged and text_len < min_chunk_size:
            merged[-1].extend(group)
        else:
            merged.append(list(group))
    if len(merged) > 1 and sum(len(u.text) for u in merged[0]) < min_chunk_size:
        head = merged.pop(0)
        merged[0] = head + merged[0]

    chunks: List[Chunk] = []
    for index, group in enumerate(merged):
        content = "\n".join(u.text for u in group).strip()
        if not content:
            continue
        chunks.append(
            Chunk(
                index=len(chunks),
                content=content,
                page_start=min(u.page for u in group),
                page_end=max(u.page for u in group),
            )
        )
    return chunks
