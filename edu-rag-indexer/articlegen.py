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
  python3 articlegen.py --document-id 3 --resume-segments  # 2단계가 중간에 죽었을 때, 체크포인트에서 이어서 재개
  python3 articlegen.py --document-id 3 --backfill-stat-keys  # target_stat_key 없는 기존 글만 분류해서 채움

  1단계가 끝나면 감지된 구간을 .articlegen-checkpoints/segments-doc<id>.json에 자동 저장함 —
  2단계(글쓰기, LLM 호출 훨씬 많음) 도중 DB 커넥션이 끊기는 등으로 죽어도 1단계 결과는 안 날아감.

  글마다 target_stat_key(8개 투자 습관 지표 중 하나, /pt 맞춤 퀴즈와 같은 어휘)를 같이 붙여서
  저장함 — 자료실에서 그 지표로 필터링할 수 있게.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Dict, List, Optional

import psycopg

from lib import store
from lib.embedding import configured_dimension
from lib.settings import load_settings

SEGMENT_BATCH_PAGES = 25  # 구간 감지 1회 호출당 훑는 페이지 수
CLASSIFY_BATCH_SIZE = 20  # --backfill-stat-keys 1회 호출당 분류하는 글 수
CODEX_TIMEOUT_SECONDS = 120
CHECKPOINT_DIR = Path(__file__).resolve().parent / ".articlegen-checkpoints"

# Kotlin QuizGenerationService.STAT_LABEL/STAT_SEARCH_QUERY와 동일한 어휘 — /pt 맞춤 퀴즈가
# 쓰는 8개 약점 지표와 자료실 글을 같은 코드로 연결해서 필터링 가능하게 함.
STAT_KEY_GUIDE = """- JUDGMENT_ACCURACY: 판단 정확도 (투자 판단을 정확하게 하는 방법)
- DISCLOSURE_CHECK_RATE: 공시 확인율 (매수 전 공시를 확인해야 하는 이유)
- RISK_MANAGEMENT_SCORE: 리스크 관리 (레버리지 신용거래 리스크 관리)
- IMPULSIVE_TRADING: 충동매매 억제 (충동매매 뇌동매매 위험성)
- LOSS_AVERSION: 손실 회피 대응 (손실 회피 손절 기준)
- CONFIRMATION_BIAS: 확증편향 억제 (확증편향 투자 판단)
- DIVERSIFICATION: 분산투자 (분산투자를 해야 하는 이유)
- GAMBLING_SIGNAL: 도박성 신호 낮음 (손실 후 베팅을 키우는 도박성 매매)"""


def checkpoint_path(document_id: int) -> Path:
    return CHECKPOINT_DIR / ("segments-doc%d.json" % document_id)


def save_checkpoint(document_id: int, segments: List[Dict]) -> Path:
    CHECKPOINT_DIR.mkdir(exist_ok=True)
    path = checkpoint_path(document_id)
    path.write_text(json.dumps(segments, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def load_checkpoint(path: Path) -> List[Dict]:
    return json.loads(path.read_text(encoding="utf-8"))


def run_codex(prompt: str, timeout: int = CODEX_TIMEOUT_SECONDS) -> Optional[str]:
    """codex exec를 서브프로세스로 호출 — backend의 CodexCli.kt와 동일한 플래그.

    NODE_OPTIONS는 일부러 지움 — cmux가 --require로 걸어둔 임시 파일(cmux 세션이 끝나면
    없어짐)을 codex(Node 프로세스)가 그대로 물려받으면 그 파일이 사라진 뒤엔
    "Cannot find module ...restore-node-options.cjs"로 즉시 죽어버림(codex 로직과 무관한
    환경 문제). codex는 이 옵션이 필요 없어서 그냥 안 물려줌."""
    with tempfile.NamedTemporaryFile(prefix="articlegen-", suffix=".txt", delete=False) as tmp:
        output_path = Path(tmp.name)
    env = {k: v for k, v in os.environ.items() if k != "NODE_OPTIONS"}
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
            env=env,
        )
        if result.returncode != 0:
            print("      codex exec 종료 코드 %d: %s" % (result.returncode, result.stdout.decode(errors="replace")[-500:]))
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

각 세그먼트는 아래 8개 투자 습관 지표 중 가장 관련 있는 것 하나와 연결해(정확히 안 맞아도 제일 가까운 걸 골라):
%s

각 세그먼트마다 정확히 이 형식으로 출력해:
SEGMENT_START: <시작 페이지 번호>
SEGMENT_END: <끝 페이지 번호>
TITLE: <이 구간 주제를 한 줄로>
SUMMARY: <이 구간 내용 한 문장 요약>
STAT_KEY: <위 8개 코드 중 하나, 코드만>
---

세그먼트가 여러 개면 위 블록을 반복해. 학습 내용이 하나도 없으면 아무것도 출력하지 마. 다른 설명은 붙이지 마.

원문:
%s""" % (org_name, title, batch[0]["page_number"], batch[-1]["page_number"], STAT_KEY_GUIDE, format_pages_for_prompt(batch))

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
        elif line.startswith("STAT_KEY:"):
            key = line.split(":", 1)[1].strip().upper()
            current["stat_key"] = key if key in store.STAT_KEYS else None
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


class ConnHolder:
    """DB 커넥션이 (원격 idle timeout 등으로) 끊기면 재연결해서 계속 쓸 수 있게 감싸는 래퍼.
    실제로 551쪽짜리 책을 돌리다가 2단계 시작 직후 커넥션이 끊겨서 1단계에서 찾은 구간
    133개가 통째로 날아간 적이 있어서(체크포인트도 그때 같이 도입) 추가함."""

    def __init__(self, database_url: str, dimension: int):
        self.database_url = database_url
        self.dimension = dimension
        self.conn = store.connect(database_url)
        store.ensure_schema(self.conn, dimension)

    def reconnect(self) -> None:
        try:
            self.conn.close()
        except Exception:
            pass
        self.conn = store.connect(self.database_url)
        store.ensure_schema(self.conn, self.dimension)


def save_article_with_retry(
    holder: ConnHolder, document_id: int, title: str, body: str,
    page_start: int, page_end: int, summary: str, stat_key: Optional[str],
) -> bool:
    for attempt in range(2):
        try:
            holder.conn.rollback()  # 이전 트랜잭션이 에러로 중단된 채 남아있을 수 있음
            store.insert_article(holder.conn, document_id, title, body, page_start, page_end, summary, stat_key)
            holder.conn.commit()
            return True
        except psycopg.OperationalError as exc:
            print("      DB 연결 끊김 — 재연결 후 재시도(%d/2): %s" % (attempt + 1, exc))
            holder.reconnect()
    return False


def classify_articles(articles_batch: List[Dict]) -> Dict[int, str]:
    """제목+요약만 보고 target_stat_key가 비어있는 기존 글들을 분류(백필용)."""
    items_text = "\n\n".join(
        "[%d] 제목: %s\n요약: %s" % (a["id"], a["title"], a["topic_summary"] or "")
        for a in articles_batch
    )
    prompt = """너는 금융교육 글을 8개 투자 습관 지표 중 하나로 분류하는 편집자야.

%s

아래 글들을 각각 위 8개 중 가장 관련 있는 것 하나로 분류해줘. 정확히 안 맞아도 제일 가까운 걸 골라.

글 목록:
%s

각 글마다 정확히 이 형식으로 답해:
ARTICLE: <번호>
STAT_KEY: <코드만>
---

다른 설명은 붙이지 마.""" % (STAT_KEY_GUIDE, items_text)

    output = run_codex(prompt)
    if not output:
        return {}
    return parse_classification(output)


def parse_classification(text: str) -> Dict[int, str]:
    result: Dict[int, str] = {}
    current_id: Optional[int] = None
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("ARTICLE:"):
            current_id = _to_int(line.split(":", 1)[1])
        elif line.startswith("STAT_KEY:") and current_id is not None:
            key = line.split(":", 1)[1].strip().upper()
            if key in store.STAT_KEYS:
                result[current_id] = key
            current_id = None
    return result


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
    parser.add_argument(
        "--resume-segments", nargs="?", const="__default__",
        help="1단계를 건너뛰고 체크포인트 JSON에서 구간 목록을 읽어 2단계부터 재개. "
             "경로를 안 주면 기본 체크포인트(.articlegen-checkpoints/segments-doc<id>.json)를 씀",
    )
    parser.add_argument(
        "--backfill-stat-keys", action="store_true",
        help="새 글을 만들지 않고, target_stat_key가 비어있는 기존 글만 분류해서 채움 "
             "(target_stat_key 컬럼을 나중에 추가했을 때 이미 만든 글들 백필용)",
    )
    args = parser.parse_args()

    settings = load_settings()
    holder = ConnHolder(settings.database_url, configured_dimension(settings.embedding))

    document = store.get_document_by_id(holder.conn, args.document_id)
    if not document:
        print("문서를 찾을 수 없습니다: id=%d" % args.document_id)
        return 1
    org_name = document["org_name"] or ""
    title = document["title"] or ""

    if args.backfill_stat_keys:
        missing = store.get_articles_missing_stat_key(holder.conn, args.document_id)
        if not missing:
            print("target_stat_key가 비어있는 글이 없습니다.")
            holder.conn.close()
            return 0
        print("target_stat_key 백필 — %d개 글" % len(missing))
        batches = [missing[i:i + CLASSIFY_BATCH_SIZE] for i in range(0, len(missing), CLASSIFY_BATCH_SIZE)]
        updated = 0
        for index, batch in enumerate(batches, start=1):
            print("  [%d/%d] %d개 분류 중..." % (index, len(batches), len(batch)))
            mapping = classify_articles(batch)
            for article in batch:
                key = mapping.get(article["id"])
                if not key:
                    print("      실패 — id=%d 건너뜀" % article["id"])
                    continue
                try:
                    holder.conn.rollback()
                    store.set_article_stat_key(holder.conn, article["id"], key)
                    holder.conn.commit()
                    updated += 1
                except psycopg.OperationalError:
                    holder.reconnect()
        print("완료 — %d/%d개 태깅함" % (updated, len(missing)))
        holder.conn.close()
        return 0

    pages = store.get_pages(holder.conn, args.document_id)
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
        holder.conn.execute("SELECT 1")  # 죽은 커넥션이면 여기서 바로 드러남
        store.delete_articles(holder.conn, args.document_id)
        holder.conn.commit()
        print("기존 글 삭제 완료")

    started = time.time()

    if args.resume_segments:
        resume_path = (
            checkpoint_path(args.document_id)
            if args.resume_segments == "__default__"
            else Path(args.resume_segments)
        )
        if not resume_path.exists():
            print("체크포인트 파일이 없습니다: %s" % resume_path)
            return 1
        all_segments = load_checkpoint(resume_path)
        print("\n[1단계] 건너뜀 — 체크포인트에서 구간 %d개 불러옴 (%s)" % (len(all_segments), resume_path))
    else:
        batches = [pages[i:i + SEGMENT_BATCH_PAGES] for i in range(0, len(pages), SEGMENT_BATCH_PAGES)]
        all_segments = []

        print("\n[1단계] 구간 감지 — %d개 묶음" % len(batches))
        for index, batch in enumerate(batches, start=1):
            print("  [%d/%d] %d~%d쪽 분석 중..." % (index, len(batches), batch[0]["page_number"], batch[-1]["page_number"]))
            segments = detect_segments(org_name, title, batch)
            for seg in segments:
                print("      → %d~%d쪽: %s" % (seg["start"], seg["end"], seg["title"]))
            all_segments.extend(segments)

        if not all_segments:
            print("\n감지된 구간이 없습니다.")
            return 0

        saved_path = save_checkpoint(args.document_id, all_segments)
        print("\n구간 %d개를 체크포인트에 저장함 — %s (2단계가 중간에 죽어도 --resume-segments로 재개 가능)"
              % (len(all_segments), saved_path))

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
        saved = save_article_with_retry(
            holder, args.document_id, article["title"], article["body"],
            seg["start"], seg["end"], seg.get("summary", ""), seg.get("stat_key"),
        )
        if not saved:
            print("      저장 실패(재연결 후에도 실패) — 건너뜀")
            continue
        written += 1
        print("      저장 완료 — \"%s\"" % article["title"])

    holder.conn.close()
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
