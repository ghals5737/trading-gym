#!/usr/bin/env python3
"""edu_pages(오버랩 없는 원문) → LLM 2단계 → edu_articles 적재.

  1단계(구간 감지): 책을 페이지 묶음 단위로 훑으면서, 실질적인 학습 내용이 있는
  구간(시작~끝 페이지)을 LLM이 찾아냄. 표지·목차·판권·색인 같은 건 건너뜀.
  2단계(글쓰기): 감지된 구간마다 원문을 LLM한테 주고 블로그 형식으로 다시 쓰게 함.

  둘 다 codex CLI(서브프로세스, API 과금과 무관)를 씀 — 책 한 권에 LLM 호출이
  수십 번 들어가서 몇 분씩 걸릴 수 있음. 한 번 돌려서 DB에 저장해두는 캐시성 스크립트.

  python3 articlegen.py --document-id 3                   # 문서 전체
  python3 articlegen.py --document-id 3 --limit-pages 60   # 앞부분만 (테스트용)
  python3 articlegen.py --document-id 3 --force            # 기존 글 지우고 재생성
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Dict, List, Optional

from lib import store
from lib.embedding import configured_dimension
from lib.settings import load_settings

SEGMENT_BATCH_PAGES = 25  # 구간 감지 1회 호출당 훑는 페이지 수
CODEX_TIMEOUT_SECONDS = 120


def run_codex(prompt: str, timeout: int = CODEX_TIMEOUT_SECONDS) -> Optional[str]:
    """codex exec를 서브프로세스로 호출 — backend의 CodexCli.kt와 동일한 플래그."""
    with tempfile.NamedTemporaryFile(prefix="articlegen-", suffix=".txt", delete=False) as tmp:
        output_path = Path(tmp.name)
    try:
        result = subprocess.run(
            [
                "codex", "exec",
                "--skip-git-repo-check",
                "--sandbox", "read-only",
                "--output-last-message", str(output_path),
                prompt,
            ],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=timeout,
        )
        if result.returncode != 0:
            print("      codex exec 종료 코드 %d" % result.returncode)
            return None
        text = output_path.read_text(encoding="utf-8").strip()
        return text or None
    except subprocess.TimeoutExpired:
        print("      codex exec 타임아웃(%d초)" % timeout)
        return None
    except Exception as exc:
        print("      codex exec 실행 실패: %s" % exc)
        return None
    finally:
        output_path.unlink(missing_ok=True)


def format_pages_for_prompt(pages: List[Dict]) -> str:
    return "\n\n".join("[페이지 %d]\n%s" % (p["page_number"], p["content"]) for p in pages)


def detect_segments(org_name: str, title: str, batch: List[Dict]) -> List[Dict]:
    """한 페이지 묶음 안에서 학습 주제 구간(들)을 찾음. line-prefix 형식으로 파싱."""
    prompt = """너는 "%s"에서 발간한 「%s」이라는 금융교육 책의 편집자야. 아래는 이 책의 %d쪽부터 %d쪽까지의 원문이야. 각 페이지는 [페이지 N] 표시로 구분돼 있어.

이 구간 안에서, 하나의 교육 주제로 묶을 수 있는 구간들을 찾아서 나눠줘. 표지, 목차, 판권, 발간사, 머리말, 학습목표 나열, 색인, 참고문헌처럼 실질적인 학습 내용이 아닌 페이지는 세그먼트로 만들지 마. 여러 페이지에 걸쳐 하나의 주제를 설명하고 있으면 하나의 세그먼트로 묶어(너무 잘게 쪼개지 마 — 보통 2~6페이지 정도가 적당해).

각 세그먼트마다 정확히 이 형식으로 출력해:
SEGMENT_START: <시작 페이지 번호>
SEGMENT_END: <끝 페이지 번호>
TITLE: <이 구간 주제를 한 줄로>
SUMMARY: <이 구간 내용 한 문장 요약>
---

세그먼트가 여러 개면 위 블록을 반복해. 학습 내용이 하나도 없으면 아무것도 출력하지 마. 다른 설명은 붙이지 마.

원문:
%s""" % (org_name, title, batch[0]["page_number"], batch[-1]["page_number"], format_pages_for_prompt(batch))

    output = run_codex(prompt)
    if not output:
        return []
    return parse_segments(output)


def parse_segments(text: str) -> List[Dict]:
    segments: List[Dict] = []
    current: Dict = {}
    for line in text.splitlines():
        line = line.strip()
        if line == "---":
            if "start" in current and "end" in current and "title" in current:
                segments.append(current)
            current = {}
        elif line.startswith("SEGMENT_START:"):
            current["start"] = _to_int(line.split(":", 1)[1])
        elif line.startswith("SEGMENT_END:"):
            current["end"] = _to_int(line.split(":", 1)[1])
        elif line.startswith("TITLE:"):
            current["title"] = line.split(":", 1)[1].strip()
        elif line.startswith("SUMMARY:"):
            current["summary"] = line.split(":", 1)[1].strip()
    if "start" in current and "end" in current and "title" in current:
        segments.append(current)
    return [s for s in segments if s.get("start") and s.get("end") and s["end"] >= s["start"]]


def _to_int(raw: str) -> Optional[int]:
    digits = "".join(ch for ch in raw if ch.isdigit())
    return int(digits) if digits else None


def write_article(org_name: str, title: str, page_start: int, page_end: int, pages: List[Dict]) -> Optional[Dict]:
    """감지된 한 구간의 원문을 블로그 글로 재작성."""
    prompt = """너는 "트레이딩 짐"이라는 투자교육 앱의 콘텐츠 에디터야. 아래는 %s이 발간한 「%s」 PDF %d~%d쪽 원문이야. 이 원문 내용을 바탕으로, 20대 사회초년생 독자가 읽기 편한 블로그 글 하나로 다시 써줘.

요구사항:
- 도입부: 왜 이 얘기가 지금 나한테 중요한지 1~2문장으로 훅
- 본문: 원문에 있는 구체적인 숫자·예시를 최대한 살려서 쉽게 설명
- PDF 원본의 페이지 번호, 챕터 제목, 각주 번호 같은 편집 흔적은 다 빼고 자연스러운 글로
- 말투는 친근하고 직접적으로("~해요" 톤 유지), 설명충처럼 딱딱하지 않게
- 800~1200자 정도 분량
- 마지막 줄에 "출처: %s 「%s」 %d~%d쪽" 추가

아래 형식으로 정확히 출력해(다른 설명 붙이지 마):
TITLE: <짧고 눈에 띄는 제목>
BODY:
<본문>

원문:
%s""" % (org_name, title, page_start, page_end, org_name, title, page_start, page_end, format_pages_for_prompt(pages))

    output = run_codex(prompt)
    if not output:
        return None
    return parse_article(output)


def parse_article(text: str) -> Optional[Dict]:
    lines = text.splitlines()
    title_line = next((l for l in lines if l.strip().startswith("TITLE:")), None)
    body_idx = next((i for i, l in enumerate(lines) if l.strip().startswith("BODY:")), None)
    if not title_line or body_idx is None:
        return None
    article_title = title_line.split(":", 1)[1].strip()
    body = "\n".join(lines[body_idx + 1:]).strip()
    if not article_title or not body:
        return None
    return {"title": article_title, "body": body}


def main() -> int:
    parser = argparse.ArgumentParser(description="edu_pages를 LLM으로 블로그 글로 재작성해 edu_articles에 저장")
    parser.add_argument("--document-id", type=int, required=True, help="edu_documents.id")
    parser.add_argument("--limit-pages", type=int, help="앞에서 이 페이지 수만큼만 처리 (테스트용)")
    parser.add_argument("--start-page", type=int, help="이 페이지부터 (테스트용, 범위 지정)")
    parser.add_argument("--end-page", type=int, help="이 페이지까지 (테스트용, 범위 지정)")
    parser.add_argument("--force", action="store_true", help="기존에 생성된 글을 지우고 다시 만듦")
    args = parser.parse_args()

    settings = load_settings()
    conn = store.connect(settings.database_url)
    store.ensure_schema(conn, configured_dimension(settings.embedding))

    document = store.get_document_by_id(conn, args.document_id)
    if not document:
        print("문서를 찾을 수 없습니다: id=%d" % args.document_id)
        return 1
    org_name = document["org_name"] or ""
    title = document["title"] or ""

    pages = store.get_pages(conn, args.document_id)
    if args.start_page or args.end_page:
        lo = args.start_page or pages[0]["page_number"]
        hi = args.end_page or pages[-1]["page_number"]
        pages = [p for p in pages if lo <= p["page_number"] <= hi]
    if args.limit_pages:
        pages = pages[: args.limit_pages]
    if not pages:
        print("페이지가 없습니다 — 먼저 indexer.py --pages-only로 채워주세요.")
        return 1

    print("문서: %s 「%s」 (%d쪽)" % (org_name, title, len(pages)))

    if args.force:
        store.delete_articles(conn, args.document_id)
        conn.commit()
        print("기존 글 삭제 완료")

    started = time.time()
    batches = [pages[i:i + SEGMENT_BATCH_PAGES] for i in range(0, len(pages), SEGMENT_BATCH_PAGES)]
    all_segments: List[Dict] = []

    print("\n[1단계] 구간 감지 — %d개 묶음" % len(batches))
    for index, batch in enumerate(batches, start=1):
        print("  [%d/%d] %d~%d쪽 분석 중..." % (index, len(batches), batch[0]["page_number"], batch[-1]["page_number"]))
        segments = detect_segments(org_name, title, batch)
        for seg in segments:
            print("      → %d~%d쪽: %s" % (seg["start"], seg["end"], seg["title"]))
        all_segments.extend(segments)

    if not all_segments:
        print("\n감지된 구간이 없습니다.")
        conn.close()
        return 0

    pages_by_number = {p["page_number"]: p for p in pages}

    print("\n[2단계] 글쓰기 — %d개 구간" % len(all_segments))
    written = 0
    for index, seg in enumerate(all_segments, start=1):
        seg_pages = [pages_by_number[n] for n in range(seg["start"], seg["end"] + 1) if n in pages_by_number]
        if not seg_pages:
            continue
        print("  [%d/%d] %d~%d쪽 \"%s\" 작성 중..." % (index, len(all_segments), seg["start"], seg["end"], seg["title"]))
        article = write_article(org_name, title, seg["start"], seg["end"], seg_pages)
        if not article:
            print("      실패 — 건너뜀")
            continue
        store.insert_article(
            conn, args.document_id, article["title"], article["body"],
            seg["start"], seg["end"], seg.get("summary", ""),
        )
        conn.commit()
        written += 1
        print("      저장 완료 — \"%s\"" % article["title"])

    conn.close()
    print("\n" + "=" * 62)
    print("완료 (%.1f초) — 구간 %d개 중 %d개 저장" % (time.time() - started, len(all_segments), written))
    print("=" * 62)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n중단했습니다.", file=sys.stderr)
        sys.exit(130)
