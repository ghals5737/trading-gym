#!/usr/bin/env python3
"""로컬 가짜 API 서버로 collector.py의 동작을 검증한다.

실제 인증키 없이도 파싱·필터·다운로드·멱등성 경로를 확인하려고 만든 개발용 도구다.
임시 디렉터리에 collector.py/config.py를 복사해 돌리므로 저장소의 data/는 건드리지 않는다.

실행: python3 selftest.py
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

PDF_BYTES = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer\n%%EOF\n"
HTML_ERROR = b"<!DOCTYPE html><html><body>\xec\x84\x9c\xeb\xb9\x84\xec\x8a\xa4 \xec\xa0\x90\xea\xb2\x80</body></html>"

# 주제코드별 응답 픽스처. 문서 예제의 오타 래퍼('reponse'), 단건 dict 응답,
# resultCode 실패, 중복 콘텐츠까지 한 번에 태운다.
FIXTURES = {
    # 정상 목록 — 라이선스 A(받음) + C(제외)
    "2002": {
        "reponse": {
            "resultCode": "1",
            "resultMsg": "정상",
            "resultCnt": "2",
            "result": [
                {
                    "contentsSlno": "101",
                    "title": '투자의 기초: "첫 걸음" / 안내서',
                    "fncEngnCode": "13",
                    "makeTypeCode": "2",
                    "eduTrgtCntnt": "Y",
                    "eduCntnt": "2002",
                    "producingYr": "2023",
                    "smrtnCntnt": "투자 입문자를 위한 안내서",
                    "cpyrhtPermCode": "A",
                    "cpyrhtPermCodeEtc": "",
                    "fileDownUrl": "{base}/file/ok",
                    "xtrnlContentsUrl": "",
                },
                {
                    "contentsSlno": "102",
                    "title": "상업적 이용 불가 자료",
                    "fncEngnCode": "1",
                    "makeTypeCode": "2",
                    "eduTrgtCntnt": "Y",
                    "eduCntnt": "2002",
                    "producingYr": "2022",
                    "cntnt": "라이선스 C",
                    "cpyrhtPermCode": "C",
                    "fileDownUrl": "{base}/file/ok",
                },
            ],
        }
    },
    # 단건이라 result가 배열이 아닌 객체로 오는 경우 + 첨부파일 없음
    "2003": {
        "reponse": {
            "resultCode": "1",
            "resultCnt": "1",
            "result": {
                "contentsSlno": "103",
                "title": "외부 링크만 있는 콘텐츠",
                "fncEngnCode": "33",
                "makeTypeCode": "7",
                "eduTrgtCntnt": "U",
                "eduCntnt": "2003",
                "producingYr": "2024",
                "smrtnCntnt": "웹진",
                "cpyrhtPermCode": "B",
                "fileDownUrl": "",
                "xtrnlContentsUrl": "https://example.org/webzine",
            },
        }
    },
    # resultCode 실패(데이터 없음) — 인증 문제가 아니므로 건너뛰기만 해야 한다
    "3001": {"reponse": {"resultCode": "99", "resultMsg": "조회된 데이터가 없습니다.", "result": []}},
    # 다운로드가 HTML 에러 페이지로 오는 경우 + 101 중복(중복 제거 확인)
    "4001": {
        "reponse": {
            "resultCode": "1",
            "resultCnt": "2",
            "result": [
                {
                    "contentsSlno": "104",
                    "title": "링크는 있는데 에러 페이지가 오는 자료",
                    "fncEngnCode": "15",
                    "makeTypeCode": "6",
                    "eduTrgtCntnt": "Y",
                    "eduCntnt": "4001",
                    "producingYr": "2021",
                    "smrtnCntnt": "카드뉴스",
                    "cpyrhtPermCode": "A",
                    "fileDownUrl": "{base}/file/broken",
                },
                {
                    "contentsSlno": "101",
                    "title": "중복 콘텐츠(무시돼야 함)",
                    "fncEngnCode": "13",
                    "makeTypeCode": "2",
                    "eduTrgtCntnt": "Y",
                    "eduCntnt": "4001",
                    "cpyrhtPermCode": "A",
                    "fileDownUrl": "{base}/file/ok",
                },
            ],
        }
    },
}

TEST_CONFIG = '''"""selftest 전용 설정 — 조합을 4개로 줄이고 지연을 없앴다."""
import os

API_BASE_URL = os.environ.get("FSS_EDU_API_BASE", "http://127.0.0.1/api")
API_KEY_ENV = "FSS_EDU_API_KEY"

MAKE_TYPES = ["2"]
MAKE_TYPE_NAMES = {"2": "도서", "6": "카드뉴스", "7": "웹진/잡지/신문"}
TARGETS = ["Y"]
TARGET_NAMES = {"Y": "청년기", "U": "대학생", "A": "중장년기"}
TOPICS = ["2002", "2003", "3001", "4001"]
TOPIC_NAMES = {"2002": "투자의 기초", "2003": "투자상품의 활용",
               "3001": "신용의 이해와 관리", "4001": "위험의 개념과 관리"}
ORG_NAMES = {"1": "금융감독원", "13": "투자자교육협의회", "15": "금융투자협회", "33": "한국거래소"}

DOWNLOADABLE_LICENSES = {"A", "B"}

REQUEST_DELAY_SECONDS = 0.0
MAX_RETRIES = 2
RETRY_BACKOFF_BASE = 1.0
TIMEOUT_SECONDS = 5
USER_AGENT = "edu-content-collector-selftest/1.0"

OUTPUT_DIR = "data"
RAW_SUBDIR = "raw"
CATALOG_FILENAME = "catalog.jsonl"
LOG_FILENAME = "collector.log"
MAX_FILENAME_LENGTH = 100
'''


class Handler(BaseHTTPRequestHandler):
    base_url = ""

    def log_message(self, *args):  # 테스트 출력이 지저분해져서 끔
        pass

    def _send(self, status, content_type, body):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)

        if parsed.path == "/api":
            auth_key = (query.get("authKey") or [""])[0]
            # 실제 엔드포인트 재현 — 키가 틀리면 4xx가 아니라 200 + HTML 에러 페이지가 온다.
            if auth_key == "HTML-KEY":
                self._send(200, "text/html; charset=utf-8", HTML_ERROR)
                return
            if auth_key != "GOOD-KEY":
                payload = {"reponse": {"resultCode": "99", "resultMsg": "인증키가 유효하지 않습니다."}}
                self._send(200, "application/json;charset=UTF-8",
                           json.dumps(payload, ensure_ascii=False).encode("utf-8"))
                return
            topic = (query.get("eduCntnt") or [""])[0]
            payload = FIXTURES.get(topic, {"reponse": {"resultCode": "1", "resultCnt": "0", "result": []}})
            body = json.dumps(payload, ensure_ascii=False).replace("{base}", self.base_url)
            self._send(200, "application/json;charset=UTF-8", body.encode("utf-8"))
            return

        if parsed.path == "/file/ok":
            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Disposition", 'attachment; filename="guide.pdf"')
            self.send_header("Content-Length", str(len(PDF_BYTES)))
            self.end_headers()
            self.wfile.write(PDF_BYTES)
            return

        if parsed.path == "/file/broken":
            self._send(200, "text/html;charset=UTF-8", HTML_ERROR)
            return

        self._send(404, "text/plain", b"not found")


def run_collector(workdir: Path, base_url: str, key: str, *args):
    env = {
        "PATH": "/usr/bin:/bin",
        "FSS_EDU_API_BASE": base_url + "/api",
        "FSS_EDU_API_KEY": key,
        "PYTHONIOENCODING": "utf-8",
        "LC_ALL": "en_US.UTF-8",
    }
    result = subprocess.run(
        [sys.executable, "collector.py", *args],
        cwd=str(workdir), env=env, capture_output=True, text=True,
    )
    return result


def load_catalog(workdir: Path):
    path = workdir / "data" / "catalog.jsonl"
    if not path.exists():
        return {}
    with open(path, encoding="utf-8") as handle:
        return {json.loads(line)["id"]: json.loads(line) for line in handle if line.strip()}


def main() -> int:
    failures = []

    def check(label, condition, detail=""):
        mark = "OK  " if condition else "FAIL"
        print("  [%s] %s%s" % (mark, label, "" if condition else " — " + str(detail)))
        if not condition:
            failures.append(label)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    base_url = "http://127.0.0.1:%d" % server.server_address[1]
    Handler.base_url = base_url
    threading.Thread(target=server.serve_forever, daemon=True).start()

    with tempfile.TemporaryDirectory() as tmp:
        workdir = Path(tmp)
        shutil.copy(BASE_DIR / "collector.py", workdir / "collector.py")
        (workdir / "config.py").write_text(TEST_CONFIG, encoding="utf-8")

        print("\n1) 인증키 오류 → 즉시 중단")
        result = run_collector(workdir, base_url, "BAD-KEY")
        check("종료코드 2", result.returncode == 2, result.returncode)
        check("안내 메시지 출력", "인증키 오류로 중단" in result.stdout + result.stderr)

        print("\n1-b) JSON 대신 HTML 에러 페이지 → 재시도 없이 즉시 중단")
        import time as _time
        started = _time.time()
        result = run_collector(workdir, base_url, "HTML-KEY")
        elapsed = _time.time() - started
        check("종료코드 2", result.returncode == 2, result.returncode)
        check("HTML 안내 문구", "HTML 에러 페이지" in result.stdout + result.stderr)
        check("첫 조합에서 바로 끊김(<5초)", elapsed < 5, "%.1fs" % elapsed)

        print("\n2) --dry-run → 카탈로그만 생성, 파일 없음")
        result = run_collector(workdir, base_url, "GOOD-KEY", "--dry-run")
        check("종료코드 0", result.returncode == 0, result.stdout[-400:])
        catalog = load_catalog(workdir)
        check("중복 제거 후 4건", len(catalog) == 4, sorted(catalog))
        check("101 = PENDING_DOWNLOAD", catalog.get("101", {}).get("status") == "PENDING_DOWNLOAD")
        check("102 = LICENSE_EXCLUDED (라이선스 C)",
              catalog.get("102", {}).get("status") == "LICENSE_EXCLUDED")
        check("103 = NO_FILE (단건 dict 응답 파싱됨)",
              catalog.get("103", {}).get("status") == "NO_FILE")
        check("103 외부링크 기록", catalog.get("103", {}).get("external_url") == "https://example.org/webzine")
        check("기관명 매핑", catalog.get("101", {}).get("org_name") == "투자자교육협의회")
        check("주제명 매핑", catalog.get("101", {}).get("topic_name") == "투자의 기초")
        check("파일 미다운로드", not (workdir / "data" / "raw").exists())
        check("resultCode 실패 조합은 건너뜀", "건너뜀 (resultCode=99" in result.stdout)

        print("\n3) 본 실행 → A/B + 첨부파일만 다운로드")
        result = run_collector(workdir, base_url, "GOOD-KEY")
        check("종료코드 0", result.returncode == 0, result.stdout[-400:])
        catalog = load_catalog(workdir)
        check("101 = DOWNLOADED", catalog.get("101", {}).get("status") == "DOWNLOADED")
        check("104 = DOWNLOAD_FAILED (HTML 응답 차단)",
              catalog.get("104", {}).get("status") == "DOWNLOAD_FAILED")
        downloaded = list((workdir / "data" / "raw").rglob("*"))
        files = [p for p in downloaded if p.is_file()]
        check("받은 파일 1개", len(files) == 1, [p.name for p in files])
        if files:
            name = files[0].name
            check("확장자 pdf", name.endswith(".pdf"), name)
            check("파일명 슬러그 처리(특수문자 제거)",
                  '"' not in name and "/" not in name and name.startswith("101_"), name)
            check("파일명 100자 이하", len(name) <= 100, len(name))
            check("기관별 디렉터리", files[0].parent.name == "투자자교육협의회", files[0].parent.name)
            check("내용 보존", files[0].read_bytes() == PDF_BYTES)
            check(".part 잔여물 없음", not any(p.suffix == ".part" for p in downloaded))

        print("\n4) 재실행 → 기존 파일 스킵(멱등성)")
        result = run_collector(workdir, base_url, "GOOD-KEY")
        catalog = load_catalog(workdir)
        check("101 = SKIPPED_EXISTS", catalog.get("101", {}).get("status") == "SKIPPED_EXISTS")
        check("파일 중복 생성 없음",
              len([p for p in (workdir / "data" / "raw").rglob("*") if p.is_file()]) == 1)
        check("개별 실패가 전체를 막지 않음", result.returncode == 0)

        print("\n5) --limit 0 → 다운로드 시도 안 함")
        shutil.rmtree(workdir / "data" / "raw")
        result = run_collector(workdir, base_url, "GOOD-KEY", "--limit", "0")
        catalog = load_catalog(workdir)
        check("101 = PENDING_DOWNLOAD", catalog.get("101", {}).get("status") == "PENDING_DOWNLOAD")
        check("파일 없음", not (workdir / "data" / "raw").exists())

        print("\n6) 로그 파일 기록")
        check("collector.log 생성", (workdir / "data" / "collector.log").exists())

    server.shutdown()

    print("\n" + "=" * 50)
    if failures:
        print("실패 %d건: %s" % (len(failures), ", ".join(failures)))
        return 1
    print("전체 통과")
    return 0


if __name__ == "__main__":
    sys.exit(main())
