#!/usr/bin/env python3
"""스탯 → RAG 검색 질의 사전계산 (퀴즈 생성 파이프라인 1단계).

행동 리포트의 8개 스탯은 고정돼 있으므로, 각 스탯의 검색 질의 임베딩을
여기서 한 번만 계산해 stat_rag_queries 테이블에 넣어둔다. 그러면 백엔드(Kotlin)는
임베딩 모델 없이 순수 SQL만으로 "약한 스탯에 맞는 교육 청크"를 찾을 수 있다:

    SELECT c.id, c.content, c.page_start, c.page_end, d.title, d.org_name,
           1 - (c.embedding <=> q.embedding) AS score
    FROM stat_rag_queries q
    CROSS JOIN LATERAL (
        SELECT * FROM edu_chunks c2
        ORDER BY c2.embedding <=> q.embedding LIMIT 5
    ) c
    JOIN edu_documents d ON d.id = c.document_id
    WHERE q.stat_key = 'LOSS_AVERSION'
    ORDER BY score DESC;

실행:
    DATABASE_URL="postgresql://..." python3 build_stat_queries.py           # 생성 + 검증
    DATABASE_URL="postgresql://..." python3 build_stat_queries.py --verify  # 검증만 (모델 안 올림)

질의를 바꾸면 다시 실행하면 된다 — 매핑에 없는 행은 지우고, 있는 행은 갱신한다(멱등).
"""

from __future__ import annotations

import argparse
import sys
from typing import Dict, List

from lib import store
from lib.embedding import get_embedder, to_pgvector
from lib.settings import load_settings

# 스탯 의미는 backend BehaviorReportService의 계산 로직 기준.
# 질의는 "이 스탯이 약한 사용자가 배워야 할 내용"을 서술한 문장으로 쓴다 —
# 코퍼스의 설명문과 문체가 비슷할수록 임베딩 검색이 잘 붙는다.
STAT_QUERIES: Dict[str, List[str]] = {
    # 매도 승률 낮음 → 판단 기준 없이 사고파는 문제
    "JUDGMENT_ACCURACY": [
        "주식을 사고팔 때 판단 기준을 세우는 방법",
        "기업의 가치를 평가하고 투자를 결정하는 방법",
    ],
    # 공시 확인 없이 매수 → 공시·재무제표 읽는 습관
    "DISCLOSURE_CHECK_RATE": [
        "재무제표와 공시를 확인하고 투자하는 방법",
        "기업 정보를 직접 확인하는 투자 습관",
    ],
    # 반대매매 발생·고레버리지 → 레버리지 위험
    "RISK_MANAGEMENT_SCORE": [
        "레버리지 투자의 위험성",
        "빚을 내서 투자할 때 생기는 위험과 손실 확대",
    ],
    # 충동 태그 비율 높음 → 계획 기반 투자
    "IMPULSIVE_TRADING": [
        "충동적인 투자 결정을 피하는 방법",
        "투자 계획을 세우고 원칙을 지키는 습관",
    ],
    # 손실 매도 중 손절 원칙 비율 낮음 → 손절과 손실 관리
    "LOSS_AVERSION": [
        "손실이 났을 때 손절매로 위험을 관리하는 원칙",
        "투자 손실을 관리하는 방법",
    ],
    # 물타기 비율 높음 → 심리 편향
    "CONFIRMATION_BIAS": [
        "투자에서 흔히 겪는 심리적 편향과 극복 방법",
        "떨어지는 주식에 추가 매수하는 물타기의 위험",
    ],
    # 종목 집중 → 분산투자
    "DIVERSIFICATION": [
        "분산투자를 해야 하는 이유",
        "여러 자산에 나누어 투자하는 포트폴리오 구성",
    ],
    # 신용거래 비중·반대매매 → 투기적 매매 경계
    "GAMBLING_SIGNAL": [
        "투기와 투자의 차이",
        "과도한 신용거래와 한탕주의 투자의 위험",
    ],
}

DDL = """
CREATE TABLE IF NOT EXISTS stat_rag_queries (
  stat_key   TEXT NOT NULL,
  query_text TEXT NOT NULL,
  embedding  vector({dimension}) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (stat_key, query_text)
);
"""

VERIFY_SQL = """
SELECT q.query_text,
       1 - (c.embedding <=> q.embedding) AS score,
       d.title, d.org_name, c.page_start, c.page_end,
       left(regexp_replace(c.content, '\\s+', ' ', 'g'), 70) AS preview
FROM stat_rag_queries q
CROSS JOIN LATERAL (
    SELECT * FROM edu_chunks c2 ORDER BY c2.embedding <=> q.embedding LIMIT 1
) c
JOIN edu_documents d ON d.id = c.document_id
WHERE q.stat_key = %s
ORDER BY score DESC
"""


def build(conn, embedder) -> None:
    conn.execute(DDL.format(dimension=embedder.dimension))

    pairs = [(stat, q) for stat, queries in STAT_QUERIES.items() for q in queries]
    texts = [q for _, q in pairs]
    print("질의 %d개 임베딩 계산 중 (%s)..." % (len(texts), embedder.name))
    vectors = embedder.encode(texts)

    with conn.cursor() as cursor:
        cursor.executemany(
            """
            INSERT INTO stat_rag_queries (stat_key, query_text, embedding)
            VALUES (%s, %s, %s::vector)
            ON CONFLICT (stat_key, query_text)
            DO UPDATE SET embedding = EXCLUDED.embedding, created_at = now()
            """,
            [(stat, q, to_pgvector(v)) for (stat, q), v in zip(pairs, vectors)],
        )
        # 매핑에서 빠진 질의는 정리 — 테이블이 이 파일과 항상 일치하게.
        # (튜플 배열 바인딩은 psycopg가 지원하지 않아 문자열 키로 비교)
        cursor.execute(
            "DELETE FROM stat_rag_queries WHERE stat_key || '|' || query_text <> ALL(%s)",
            ([f"{stat}|{q}" for stat, q in pairs],),
        )
        removed = cursor.rowcount
    conn.commit()
    print("적재 완료 — %d행 upsert, %d행 정리" % (len(pairs), removed))


def verify(conn) -> bool:
    print()
    print("=" * 86)
    print("스탯별 검색 검증 — 각 질의의 최상위 청크 (유사도 0.55 미만은 근거 부족 경고)")
    print("=" * 86)
    weak = []
    for stat in STAT_QUERIES:
        rows = conn.execute(VERIFY_SQL, (stat,)).fetchall()
        if not rows:
            print("[%s] !! stat_rag_queries에 행이 없음 — 먼저 build를 실행하세요" % stat)
            weak.append(stat)
            continue
        print("[%s]" % stat)
        for query_text, score, title, org, p1, p2, preview in rows:
            flag = "  " if score >= 0.55 else "⚠️"
            pages = "%s쪽" % p1 if p1 == p2 else "%s–%s쪽" % (p1, p2)
            print(" %s %.4f  %s · %s · %s" % (flag, score, title, org, pages))
            print("      질의: %s" % query_text)
            print("      본문: %s" % preview)
        if all(r[1] < 0.55 for r in rows):
            weak.append(stat)
    print("-" * 86)
    if weak:
        print("근거가 약한 스탯: %s" % ", ".join(weak))
        print("→ 해당 스탯 퀴즈는 생성 품질이 낮을 수 있음. 질의를 다듬거나 관련 자료를 추가 확보할 것.")
    else:
        print("모든 스탯이 0.55 이상의 근거 청크를 확보했다.")
    return not weak


def main() -> int:
    parser = argparse.ArgumentParser(description="스탯→RAG 질의 임베딩 사전계산")
    parser.add_argument("--verify", action="store_true", help="검증만 (임베딩 모델 안 올림)")
    args = parser.parse_args()

    settings = load_settings()
    conn = store.connect(settings.database_url)
    print("대상 DB:", conn.execute("SELECT current_database()").fetchone()[0])

    try:
        if not args.verify:
            embedder = get_embedder(settings.embedding)
            build(conn, embedder)
        ok = verify(conn)
    finally:
        conn.close()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
