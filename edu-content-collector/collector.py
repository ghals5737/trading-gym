#!/usr/bin/env python3
"""금감원 e-금융교육센터 Open API 교육 콘텐츠 수집기.

메타데이터를 카탈로그(JSONL)로 만들고, 라이선스 A/B + 첨부파일이 있는 콘텐츠의
원본 파일을 내려받는다. 파싱·청킹·임베딩은 이 프로그램의 범위가 아니다(SPEC 7절).

의존성 없이 표준 라이브러리만 쓴다 — requests가 없는 환경에서도 그대로 돌아가야
해서(이 저장소 기준 시스템 파이썬 3.9)이고, 하는 일이 GET 두 종류뿐이라 굳이
외부 패키지를 붙일 이유가 없다.
"""

from __future__ import annotations

import argparse
import itertools
import json
import logging
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import config

BASE_DIR = Path(__file__).resolve().parent
KST = timezone(timedelta(hours=9))
LOG = logging.getLogger("collector")

# SPEC 4절의 status 값.
STATUS_DOWNLOADED = "DOWNLOADED"
STATUS_NO_FILE = "NO_FILE"
STATUS_LICENSE_EXCLUDED = "LICENSE_EXCLUDED"
STATUS_DOWNLOAD_FAILED = "DOWNLOAD_FAILED"
STATUS_SKIPPED_EXISTS = "SKIPPED_EXISTS"
# SPEC에는 없는 값. --dry-run이나 --limit로 "받을 수 있는데 아직 안 받은" 상태를
# DOWNLOADED로 적으면 카탈로그가 거짓말을 하게 돼서 따로 뒀다.
STATUS_PENDING = "PENDING_DOWNLOAD"

SUCCESS_RESULT_CODES = {"1", "00", "0"}
# resultCode가 실패인데 메시지가 인증 문제로 보이면 즉시 중단한다(SPEC 6-3).
AUTH_ERROR_PATTERN = re.compile(r"인증|권한|키가|키를|authkey|auth\s*key|api\s*key|unauthor", re.I)

CONTENT_TYPE_EXTENSIONS = {
    "application/pdf": "pdf",
    "application/x-pdf": "pdf",
    "application/zip": "zip",
    "application/x-zip-compressed": "zip",
    "application/haansofthwp": "hwp",
    "application/x-hwp": "hwp",
    "application/vnd.hancom.hwp": "hwp",
    "application/vnd.hancom.hwpx": "hwpx",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "text/plain": "txt",
}

UNSAFE_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
MAX_FILENAME_BYTES = 200  # APFS/ext4의 255바이트 제한 여유분. 한글은 글자당 3바이트라 글자 수만으론 부족.


# --------------------------------------------------------------------------
# 유틸
# --------------------------------------------------------------------------


def setup_logging(log_path: Path) -> None:
    """진행 상황은 stdout, 상세 기록은 파일(SPEC 5절)."""
    LOG.setLevel(logging.DEBUG)
    LOG.handlers.clear()

    stream = logging.StreamHandler(sys.stdout)
    stream.setLevel(logging.INFO)
    stream.setFormatter(logging.Formatter("%(message)s"))
    LOG.addHandler(stream)

    file_handler = logging.FileHandler(log_path, encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    LOG.addHandler(file_handler)


def now_kst() -> str:
    return datetime.now(KST).isoformat(timespec="seconds")


def truncate_by_bytes(text: str, max_bytes: int) -> str:
    """UTF-8 바이트 기준으로 자른다(한글 파일명이 파일시스템 상한을 넘지 않게)."""
    encoded = text.encode("utf-8")
    if len(encoded) <= max_bytes:
        return text
    return encoded[:max_bytes].decode("utf-8", errors="ignore")


def slugify(text: str, max_chars: int) -> str:
    """제목을 파일명으로 안전하게(SPEC 6-5). 한글은 그대로 두고 위험 문자만 제거."""
    cleaned = UNSAFE_FILENAME_CHARS.sub("", text or "")
    cleaned = re.sub(r"\s+", "_", cleaned).strip("._ ")
    if not cleaned:
        return "untitled"
    cleaned = cleaned[: max(max_chars, 1)]
    cleaned = truncate_by_bytes(cleaned, MAX_FILENAME_BYTES).strip("._ ")
    return cleaned or "untitled"


def pick(row: Dict[str, Any], *names: str) -> str:
    """응답 필드를 관대하게 읽는다 — 키 대소문자가 문서와 다를 수 있어서(SPEC 6-2)."""
    for name in names:
        if name in row and row[name] is not None:
            return str(row[name]).strip()
    lowered = {str(k).lower(): v for k, v in row.items()}
    for name in names:
        value = lowered.get(name.lower())
        if value is not None:
            return str(value).strip()
    return ""


# --------------------------------------------------------------------------
# API 호출
# --------------------------------------------------------------------------


class AuthError(RuntimeError):
    """인증키 문제 — 조합을 건너뛰지 않고 전체 실행을 중단한다."""


class HtmlResponseError(RuntimeError):
    """API가 JSON 대신 HTML을 돌려준 경우.

    2026-08-13 실제 엔드포인트 확인 결과, 인증키가 틀리면 4xx가 아니라
    HTTP 200 + 금감원 공통 에러 페이지(text/html)가 온다. 재시도해도 그대로라
    여기서 즉시 끊고 위로 올린다.
    """


def http_get(url: str, timeout: int):
    request = urllib.request.Request(
        url,
        headers={"User-Agent": config.USER_AGENT, "Accept": "*/*"},
    )
    return urllib.request.urlopen(request, timeout=timeout)


def fetch_json(params: Dict[str, str]) -> Optional[Dict[str, Any]]:
    """API를 호출해 JSON을 파싱한다. 3회까지 지수 백오프 재시도(SPEC 3-2)."""
    url = config.API_BASE_URL + "?" + urllib.parse.urlencode(params)
    safe_url = url.replace(params.get("authKey", "\x00"), "***")

    last_error: Optional[str] = None
    for attempt in range(1, config.MAX_RETRIES + 1):
        try:
            with http_get(url, config.TIMEOUT_SECONDS) as response:
                charset = response.headers.get_content_charset() or "utf-8"
                content_type = (response.headers.get("Content-Type") or "").lower()
                raw = response.read()
            text = raw.decode(charset, errors="replace").strip().lstrip("﻿")
            if "text/html" in content_type or looks_like_html(raw):
                raise HtmlResponseError(text[:200].replace("\n", " ").strip())
            return json.loads(text)
        except HtmlResponseError:
            raise
        except json.JSONDecodeError as exc:
            last_error = "JSON 파싱 실패: %s / 응답 앞부분: %.200s" % (exc, text)
        except urllib.error.HTTPError as exc:
            last_error = "HTTP %s %s" % (exc.code, exc.reason)
        except Exception as exc:  # 네트워크/타임아웃 등
            last_error = "%s: %s" % (type(exc).__name__, exc)

        LOG.debug("호출 실패(%d/%d) %s — %s", attempt, config.MAX_RETRIES, safe_url, last_error)
        if attempt < config.MAX_RETRIES:
            time.sleep(config.RETRY_BACKOFF_BASE ** (attempt - 1))

    LOG.warning("  ! 호출 실패(재시도 %d회 소진) — %s", config.MAX_RETRIES, last_error)
    return None


def unwrap_envelope(payload: Dict[str, Any]) -> Dict[str, Any]:
    """최상위 래퍼를 벗긴다. 문서 예제가 'reponse'(오타)라 둘 다 받는다(SPEC 6-2)."""
    if not isinstance(payload, dict):
        return {}
    for key in ("reponse", "response", "Response"):
        inner = payload.get(key)
        if isinstance(inner, dict):
            return inner
    return payload


def extract_rows(body: Dict[str, Any]) -> List[Dict[str, Any]]:
    """result를 리스트로 정규화 — 단건일 때 객체로 오는 경우 방어(SPEC 6-2)."""
    result = body.get("result")
    if result is None:
        for key in ("results", "list", "items"):
            if key in body:
                result = body[key]
                break
    if result is None:
        return []
    if isinstance(result, dict):
        return [result]
    if isinstance(result, list):
        return [row for row in result if isinstance(row, dict)]
    return []


def check_result_code(body: Dict[str, Any], payload: Dict[str, Any]) -> Tuple[bool, str, str]:
    """(성공여부, 코드, 메시지). 코드가 아예 없으면 성공으로 본다(필드명이 다를 수 있음)."""
    code = pick(body, "resultCode") or pick(payload, "resultCode")
    message = pick(body, "resultMsg", "resultMessage") or pick(payload, "resultMsg", "resultMessage")
    if not code:
        return True, "", message
    return code in SUCCESS_RESULT_CODES, code, message


# --------------------------------------------------------------------------
# 수집
# --------------------------------------------------------------------------


def collect_rows(auth_key: str, org: Optional[str]) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, int], List[str]]:
    """제작유형 × 교육대상 × 주제 조합을 돌며 응답을 모으고 contentsSlno로 중복 제거."""
    combos = list(itertools.product(config.MAKE_TYPES, config.TARGETS, config.TOPICS))
    LOG.info("조회 조합 %d개 (제작유형 %d × 교육대상 %d × 주제 %d)%s",
             len(combos), len(config.MAKE_TYPES), len(config.TARGETS), len(config.TOPICS),
             " · 기관=%s" % org if org else "")

    merged: Dict[str, Dict[str, Any]] = {}
    counters = {"calls": 0, "ok": 0, "failed": 0, "skipped": 0, "rows": 0}
    truncated: List[str] = []

    for index, (make_type, target, topic) in enumerate(combos, start=1):
        params = {
            "apiType": "json",
            "authKey": auth_key,
            "makeTypeCode": make_type,
            "eduTrgtCntnt": target,
            "eduCntnt": topic,
        }
        if org:
            params["fncEngnCode"] = org

        label = "유형=%s 대상=%s 주제=%s" % (
            config.MAKE_TYPE_NAMES.get(make_type, make_type),
            config.TARGET_NAMES.get(target, target),
            config.TOPIC_NAMES.get(topic, topic),
        )

        counters["calls"] += 1
        try:
            payload = fetch_json(params)
        except HtmlResponseError as exc:
            # 한 건도 성공하지 못한 상태에서 HTML이 오면 키/엔드포인트 문제다 — 90개 조합을
            # 헛돌리지 않고 바로 끊는다. 이미 성공한 호출이 있었다면 일시적 오류로 보고 계속.
            if counters["ok"] == 0:
                raise AuthError("API가 JSON 대신 HTML 에러 페이지를 반환했습니다 — %s" % exc)
            counters["failed"] += 1
            LOG.info("[%d/%d] %s → HTML 응답(건너뜀)", index, len(combos), label)
            time.sleep(config.REQUEST_DELAY_SECONDS)
            continue
        if payload is None:
            counters["failed"] += 1
            LOG.info("[%d/%d] %s → 호출 실패", index, len(combos), label)
            time.sleep(config.REQUEST_DELAY_SECONDS)
            continue

        body = unwrap_envelope(payload)
        ok, code, message = check_result_code(body, payload)
        if not ok:
            if AUTH_ERROR_PATTERN.search(message or ""):
                raise AuthError("resultCode=%s resultMsg=%s" % (code, message))
            counters["skipped"] += 1
            LOG.info("[%d/%d] %s → 건너뜀 (resultCode=%s %s)", index, len(combos), label, code, message)
            LOG.debug("건너뛴 조합 상세: params=%s", {k: v for k, v in params.items() if k != "authKey"})
            time.sleep(config.REQUEST_DELAY_SECONDS)
            continue

        rows = extract_rows(body)
        counters["ok"] += 1
        counters["rows"] += len(rows)

        # 페이지네이션 파라미터가 문서에 없어서, 잘림 여부를 건수 비교로만 알 수 있다(SPEC 6-1).
        declared = pick(body, "resultCnt", "totalCnt") or pick(payload, "resultCnt", "totalCnt")
        if declared.isdigit() and int(declared) > len(rows):
            truncated.append("%s (resultCnt=%s, 수신=%d)" % (label, declared, len(rows)))
            LOG.warning("  ! 응답이 잘린 것으로 보임 — %s: resultCnt=%s인데 %d건만 왔음", label, declared, len(rows))

        new_count = 0
        for row in rows:
            content_id = pick(row, "contentsSlno", "contentsSino", "contentsNo", "id")
            if not content_id:
                LOG.debug("contentsSlno가 없는 행 무시: %s", row)
                continue
            if content_id not in merged:
                merged[content_id] = {"row": row, "combo": (make_type, target, topic)}
                new_count += 1

        LOG.info("[%d/%d] %s → %d건 (신규 %d)", index, len(combos), label, len(rows), new_count)
        time.sleep(config.REQUEST_DELAY_SECONDS)

    return merged, counters, truncated


def build_record(content_id: str, row: Dict[str, Any], combo: Tuple[str, str, str]) -> Dict[str, Any]:
    """카탈로그 한 줄(SPEC 4절). 응답 값이 비면 조회에 쓴 조합값으로 채운다."""
    make_type_code = pick(row, "makeTypeCode") or combo[0]
    target_code = pick(row, "eduTrgtCntnt") or combo[1]
    topic_code = pick(row, "eduCntnt") or combo[2]
    org_code = pick(row, "fncEngnCode")
    license_code = pick(row, "cpyrhtPermCode").upper()

    return {
        "id": content_id,
        "title": pick(row, "title", "contentsNm"),
        "org_code": org_code,
        "org_name": config.ORG_NAMES.get(org_code, "기관%s" % org_code if org_code else "미상"),
        "make_type": config.MAKE_TYPE_NAMES.get(make_type_code, make_type_code),
        "target": target_code,
        "topic_code": topic_code,
        "topic_name": config.TOPIC_NAMES.get(topic_code, ""),
        "year": pick(row, "producingYr", "producingYear"),
        "summary": pick(row, "smrtnCntnt", "cntnt"),
        "license": license_code,
        "license_etc": pick(row, "cpyrhtPermCodeEtc"),
        "file_url": pick(row, "fileDownUrl"),
        "external_url": pick(row, "xtrnlContentsUrl"),
        "local_path": "",
        "status": "",
        "collected_at": now_kst(),
    }


def classify(record: Dict[str, Any]) -> str:
    """다운로드 전 1차 판정(SPEC 3-4). 라이선스를 먼저 보고, 그 다음 첨부파일 유무."""
    if record["license"] not in config.DOWNLOADABLE_LICENSES:
        return STATUS_LICENSE_EXCLUDED
    if not record["file_url"]:
        return STATUS_NO_FILE
    return STATUS_PENDING


# --------------------------------------------------------------------------
# 다운로드
# --------------------------------------------------------------------------


def filename_from_disposition(value: str) -> Optional[str]:
    if not value:
        return None
    match = re.search(r"filename\*\s*=\s*([^;]+)", value, re.I)
    if match:
        raw = match.group(1).strip().strip('"')
        if "''" in raw:
            encoding, _, name = raw.partition("''")
            try:
                return urllib.parse.unquote(name, encoding=encoding or "utf-8")
            except (LookupError, UnicodeDecodeError):
                return urllib.parse.unquote(name)
        return urllib.parse.unquote(raw)
    match = re.search(r'filename\s*=\s*"([^"]*)"', value, re.I) or re.search(r"filename\s*=\s*([^;]+)", value, re.I)
    if match:
        return match.group(1).strip()
    return None


def resolve_extension(headers, url: str) -> str:
    """Content-Disposition → Content-Type → URL 순으로 확장자를 정한다(SPEC 3-5)."""
    disposition_name = filename_from_disposition(headers.get("Content-Disposition") or "")
    if disposition_name:
        suffix = Path(disposition_name).suffix.lstrip(".").lower()
        if suffix and len(suffix) <= 5 and suffix.isalnum():
            return suffix

    content_type = (headers.get("Content-Type") or "").split(";")[0].strip().lower()
    if content_type in CONTENT_TYPE_EXTENSIONS:
        return CONTENT_TYPE_EXTENSIONS[content_type]

    url_suffix = Path(urllib.parse.urlparse(url).path).suffix.lstrip(".").lower()
    if url_suffix and len(url_suffix) <= 5 and url_suffix.isalnum():
        return url_suffix

    return "bin"


def looks_like_html(chunk: bytes) -> bool:
    head = chunk[:512].lstrip().lower()
    return head.startswith(b"<!doctype html") or head.startswith(b"<html") or head.startswith(b"<?xml") and b"<html" in head


def find_existing(org_dir: Path, content_id: str) -> Optional[Path]:
    """멱등성 — 재실행 시 이미 받은 파일은 요청조차 하지 않는다(SPEC 3-5)."""
    if not org_dir.is_dir():
        return None
    for path in sorted(org_dir.glob("%s_*" % content_id)):
        if path.is_file() and path.suffix != ".part":
            return path
    return None


def download(record: Dict[str, Any], raw_dir: Path) -> Tuple[str, str]:
    """(status, local_path). 실패해도 예외를 밖으로 던지지 않는다(SPEC 3-5, 전체 중단 금지)."""
    content_id = record["id"]
    org_dir = raw_dir / slugify(record["org_name"], 40)

    existing = find_existing(org_dir, content_id)
    if existing:
        LOG.debug("이미 존재 — %s", existing)
        return STATUS_SKIPPED_EXISTS, existing.relative_to(BASE_DIR).as_posix()

    url = record["file_url"]
    try:
        with http_get(url, config.TIMEOUT_SECONDS) as response:
            content_type = (response.headers.get("Content-Type") or "").lower()
            if "text/html" in content_type:
                LOG.warning("  ! %s 다운로드 실패 — HTML 응답(Content-Type=%s)", content_id, content_type.strip())
                return STATUS_DOWNLOAD_FAILED, ""

            first_chunk = response.read(8192)
            if not first_chunk:
                LOG.warning("  ! %s 다운로드 실패 — 빈 응답", content_id)
                return STATUS_DOWNLOAD_FAILED, ""
            if looks_like_html(first_chunk):
                LOG.warning("  ! %s 다운로드 실패 — 본문이 HTML(에러 페이지로 보임)", content_id)
                return STATUS_DOWNLOAD_FAILED, ""

            extension = resolve_extension(response.headers, url)
            budget = config.MAX_FILENAME_LENGTH - len(content_id) - len(extension) - 2  # "_" 와 "."
            filename = "%s_%s.%s" % (content_id, slugify(record["title"], budget), extension)

            org_dir.mkdir(parents=True, exist_ok=True)
            destination = org_dir / filename
            temp_path = destination.with_name(destination.name + ".part")
            with open(temp_path, "wb") as handle:
                handle.write(first_chunk)
                shutil.copyfileobj(response, handle)

        temp_path.replace(destination)
        LOG.debug("저장 완료 — %s (%d bytes)", destination, destination.stat().st_size)
        return STATUS_DOWNLOADED, destination.relative_to(BASE_DIR).as_posix()

    except Exception as exc:
        LOG.warning("  ! %s 다운로드 실패 — %s: %s", content_id, type(exc).__name__, exc)
        return STATUS_DOWNLOAD_FAILED, ""


# --------------------------------------------------------------------------
# 실행
# --------------------------------------------------------------------------


def write_catalog(records: List[Dict[str, Any]], path: Path) -> None:
    with open(path, "w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def print_summary(records: List[Dict[str, Any]], counters: Dict[str, int], truncated: List[str], dry_run: bool) -> None:
    by_status: Dict[str, int] = {}
    for record in records:
        by_status[record["status"]] = by_status.get(record["status"], 0) + 1

    LOG.info("")
    LOG.info("=" * 58)
    LOG.info("실행 요약%s", " (--dry-run: 다운로드 안 함)" if dry_run else "")
    LOG.info("-" * 58)
    LOG.info("  API 호출        : %d회 (성공 %d · 실패 %d · 건너뜀 %d)",
             counters["calls"], counters["ok"], counters["failed"], counters["skipped"])
    LOG.info("  조회 건수       : %d건 (중복 제거 후 %d건)", counters["rows"], len(records))
    LOG.info("  라이선스 통과   : %d건", sum(1 for r in records if r["status"] != STATUS_LICENSE_EXCLUDED))
    LOG.info("-" * 58)
    for status in (STATUS_DOWNLOADED, STATUS_SKIPPED_EXISTS, STATUS_DOWNLOAD_FAILED,
                   STATUS_PENDING, STATUS_NO_FILE, STATUS_LICENSE_EXCLUDED):
        if by_status.get(status):
            LOG.info("  %-17s: %d건", status, by_status[status])
    if truncated:
        LOG.info("-" * 58)
        LOG.info("  ! 응답이 잘렸을 수 있는 조합 %d개 — --org로 좁혀서 재수집 권장:", len(truncated))
        for item in truncated[:10]:
            LOG.info("      %s", item)
    LOG.info("=" * 58)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="금감원 e-금융교육센터 교육 콘텐츠 수집기 (메타데이터 카탈로그 + 원본 파일)",
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="API 조회·필터링·카탈로그 생성까지만 하고 파일은 받지 않는다")
    parser.add_argument("--org", metavar="코드",
                        help="특정 운영기관만 조회 (예: 13=투자자교육협의회)")
    parser.add_argument("--limit", type=int, metavar="N",
                        help="다운로드 상한 (테스트용)")
    args = parser.parse_args()

    output_dir = BASE_DIR / config.OUTPUT_DIR
    raw_dir = output_dir / config.RAW_SUBDIR
    output_dir.mkdir(parents=True, exist_ok=True)
    setup_logging(output_dir / config.LOG_FILENAME)

    auth_key = os.environ.get(config.API_KEY_ENV, "").strip()
    if not auth_key:
        LOG.error("환경변수 %s가 비어 있습니다. 발급받은 32자리 인증키를 넣고 다시 실행해주세요:", config.API_KEY_ENV)
        LOG.error('    export %s="발급받은키"', config.API_KEY_ENV)
        LOG.error("  키 신청: https://www.fss.or.kr/edu/api/openApiKey/forInsert.do")
        return 2

    LOG.info("수집 시작 — %s", now_kst())
    LOG.debug("엔드포인트: %s", config.API_BASE_URL)

    try:
        merged, counters, truncated = collect_rows(auth_key, args.org)
    except AuthError as exc:
        LOG.error("")
        LOG.error("인증키 오류로 중단합니다 — %s", exc)
        LOG.error("  %s 값이 올바른지, 키가 만료되지 않았는지 확인해주세요.", config.API_KEY_ENV)
        LOG.error("  (이 API는 키가 틀려도 HTTP 200에 HTML 에러 페이지를 돌려줍니다 — 실제 확인함)")
        return 2

    if counters["ok"] == 0:
        LOG.error("성공한 API 호출이 하나도 없습니다. 네트워크 또는 엔드포인트를 확인해주세요.")
        return 1

    records = [build_record(content_id, item["row"], item["combo"]) for content_id, item in merged.items()]
    records.sort(key=lambda r: (r["topic_code"], r["id"]))
    for record in records:
        record["status"] = classify(record)

    downloadable = [r for r in records if r["status"] == STATUS_PENDING]
    if args.dry_run:
        LOG.info("")
        LOG.info("--dry-run — 다운로드 대상 %d건은 받지 않고 카탈로그에 %s로 기록합니다.",
                 len(downloadable), STATUS_PENDING)
    elif downloadable:
        LOG.info("")
        LOG.info("파일 다운로드 %d건 시작%s", len(downloadable),
                 " (--limit %d)" % args.limit if args.limit else "")
        attempted = 0
        for index, record in enumerate(downloadable, start=1):
            if args.limit is not None and attempted >= args.limit:
                LOG.info("  --limit %d 도달 — 남은 %d건은 %s로 남깁니다.",
                         args.limit, len(downloadable) - index + 1, STATUS_PENDING)
                break
            status, local_path = download(record, raw_dir)
            record["status"] = status
            record["local_path"] = local_path
            if status != STATUS_SKIPPED_EXISTS:
                attempted += 1
            LOG.info("  [%d/%d] %s %s — %s", index, len(downloadable), record["id"],
                     record["title"][:40], status)

    catalog_path = output_dir / config.CATALOG_FILENAME
    write_catalog(records, catalog_path)
    LOG.info("")
    LOG.info("카탈로그 저장 — %s (%d줄)", catalog_path.relative_to(BASE_DIR).as_posix(), len(records))

    print_summary(records, counters, truncated, args.dry_run)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n중단했습니다.", file=sys.stderr)
        sys.exit(130)
