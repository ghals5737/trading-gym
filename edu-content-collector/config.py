"""수집기 설정 — 코드 목록·매핑과 튜닝 값.

주제/대상/유형을 늘리거나 줄일 일은 이 파일만 고치면 된다. 코드→이름 매핑은
SPEC.md 2절의 표를 그대로 옮긴 것이라, 표가 갱신되면 여기도 같이 갱신할 것.
"""

import os

# --- API ---

# 테스트(selftest.py)에서 로컬 가짜 서버로 갈아끼울 수 있게 환경변수로 덮어쓸 수 있게 둠.
API_BASE_URL = os.environ.get(
    "FSS_EDU_API_BASE",
    "https://www.fss.or.kr/edu/openApi/api/eduContents.jsp",
)
API_KEY_ENV = "FSS_EDU_API_KEY"

# --- 수집 대상 코드 ---

# 제작유형: 텍스트로 파싱 가능한 것만. 영상(1)·웹툰(3)·교구(5)·오디오북(8)은 제외.
MAKE_TYPES = ["2", "6", "7"]
MAKE_TYPE_NAMES = {
    "1": "영상",
    "2": "도서",
    "3": "웹툰",
    "5": "교구",
    "6": "카드뉴스",
    "7": "웹진/잡지/신문",
    "8": "오디오북",
}

# 교육대상: 트레이딩 짐의 타깃(사회초년생·2030)에 맞춘 3개.
TARGETS = ["Y", "U", "A"]
TARGET_NAMES = {
    "Y": "청년기",
    "U": "대학생",
    "A": "중장년기",
}

# 교육내용(주제) — RAG 지식베이스의 주제 태그가 된다.
TOPICS = [
    "2001",
    "2002",
    "2003",
    "3001",
    "3002",
    "3004",
    "4001",
    "5005",
    "6001",
    "6006",
]
TOPIC_NAMES = {
    "2001": "예금",
    "2002": "투자의 기초",
    "2003": "투자상품의 활용",
    "3001": "신용의 이해와 관리",
    "3002": "대출의 기초와 활용",
    "3004": "부채관리",
    "4001": "위험의 개념과 관리",
    "5005": "금융사기예방",
    "6001": "생애재무설계의 개념과 필요성",
    "6006": "노후자금관리",
}

# 운영기관: 기본은 미지정(전체 조회). --org로 좁힐 때와 org_name 매핑에만 쓴다.
# SPEC에 나온 4곳만 확정값이고, 그 외 코드는 "기관{코드}"로 폴백한다.
ORG_NAMES = {
    "1": "금융감독원",
    "13": "투자자교육협의회",
    "15": "금융투자협회",
    "33": "한국거래소",
}

# --- 필터 ---

# A: 출처표시(자유이용), B: 출처표시+상업적 이용금지. 이 둘만 파일을 받는다.
DOWNLOADABLE_LICENSES = {"A", "B"}

# --- 요청 튜닝 ---

REQUEST_DELAY_SECONDS = 1.0  # 호출 간 지연 (rate limit 배려, 1초 이상 유지할 것)
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 2.0  # 재시도 대기 = BASE ** (시도횟수-1) 초
TIMEOUT_SECONDS = 30
USER_AGENT = "edu-content-collector/1.0 (+trading-gym RAG ingest)"

# --- 출력 경로 (collector.py 기준 상대 경로) ---

OUTPUT_DIR = "data"
RAW_SUBDIR = "raw"
CATALOG_FILENAME = "catalog.jsonl"
LOG_FILENAME = "collector.log"

MAX_FILENAME_LENGTH = 100  # 확장자 포함 파일명 길이 상한
