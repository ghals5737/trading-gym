#!/usr/bin/env python3
"""DB의 모의고사·퀴즈를 프론트가 그대로 쓸 수 있는 JSON으로 뽑는다.

  python3 export_mock.py            # mock-data.json 생성
  python3 export_mock.py --stdout   # 화면에 출력

백엔드 API가 붙기 전까지 프론트는 이 파일을 import해서 화면을 만들면 되고,
API가 생기면 같은 모양의 응답으로 갈아끼우면 된다. 그래서 필드 이름을
API 응답이라 가정하고 camelCase로 맞췄다.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "edu-rag-indexer"))

from lib import store  # noqa: E402
from lib.settings import load_settings  # noqa: E402

OUT_PATH = Path(__file__).resolve().parent / "mock-data.json"
# 프론트가 import해서 쓰는 사본. 여기서 같이 써줘야 재생성 시 둘이 안 어긋난다.
FRONT_PATH = Path(__file__).resolve().parent.parent / "knowerbot-demo" / "lib" / "exam-mock-data.json"


def export(conn, user_key: str = "demo") -> dict:
    paper = conn.execute(
        "SELECT id, code, title, description, difficulty, total_turns, starting_cash "
        "FROM exam_papers WHERE code = 'MOCK-BASIC-01'"
    ).fetchone()

    turns = conn.execute(
        """
        SELECT turn_no, stock_name, sector, as_of_date, price, holding_qty, avg_buy_price,
               chart_points, news, disclosure, outcome_points, outcome_change_pct,
               outcome_summary, ideal_action, ideal_rationale, learning_point
        FROM exam_turns WHERE paper_id = %s ORDER BY turn_no
        """,
        (paper[0],),
    ).fetchall()

    profile = conn.execute(
        "SELECT risk_type, knowledge_level, info_habit, risk_score, knowledge_score, "
        "info_habit_score, summary FROM investor_profiles WHERE user_key = %s",
        (user_key,),
    ).fetchone()

    attempt = conn.execute(
        "SELECT id, status, final_return_pct, aligned_count FROM exam_attempts "
        "WHERE user_key = %s ORDER BY id DESC LIMIT 1",
        (user_key,),
    ).fetchone()

    responses = conn.execute(
        """
        SELECT t.turn_no, r.action, r.quantity, r.reason_memo, r.viewed_disclosure,
               r.seconds_spent, r.is_aligned
        FROM exam_responses r JOIN exam_turns t ON t.id = r.turn_id
        WHERE r.attempt_id = %s ORDER BY t.turn_no
        """,
        (attempt[0],),
    ).fetchall() if attempt else []

    diagnoses = conn.execute(
        "SELECT pattern_key, severity, hit_count, evidence, rag_query FROM exam_diagnoses "
        "WHERE attempt_id = %s ORDER BY CASE severity WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END, hit_count DESC",
        (attempt[0],),
    ).fetchall() if attempt else []

    quiz_set = conn.execute(
        "SELECT id, headline, generator FROM quiz_sets WHERE user_key = %s ORDER BY id DESC LIMIT 1",
        (user_key,),
    ).fetchone()

    questions = []
    if quiz_set:
        rows = conn.execute(
            """
            SELECT q.id, q.position, q.pattern_key, q.question, q.explanation, q.why_this_question,
                   q.source_chunk_id, q.source_title, q.source_org, q.source_page_start,
                   q.source_page_end, q.source_score, t.turn_no
            FROM quiz_questions q LEFT JOIN exam_turns t ON t.id = q.related_turn_id
            WHERE q.set_id = %s ORDER BY q.position
            """,
            (quiz_set[0],),
        ).fetchall()
        for r in rows:
            options = conn.execute(
                "SELECT position, label, is_correct FROM quiz_options WHERE question_id = %s ORDER BY position",
                (r[0],),
            ).fetchall()
            questions.append({
                "position": r[1],
                "patternKey": r[2],
                "question": r[3],
                "explanation": r[4],
                "whyThisQuestion": r[5],
                "relatedTurnNo": r[12],
                "source": {
                    "chunkId": r[6], "title": r[7], "orgName": r[8],
                    "pageStart": r[9], "pageEnd": r[10], "score": float(r[11]) if r[11] else None,
                },
                "options": [{"position": o[0], "label": o[1], "isCorrect": o[2]} for o in options],
            })

    return {
        "profile": {
            "riskType": profile[0], "knowledgeLevel": profile[1], "infoHabit": profile[2],
            "riskScore": profile[3], "knowledgeScore": profile[4], "infoHabitScore": profile[5],
            "summary": profile[6],
        } if profile else None,
        "paper": {
            "code": paper[1], "title": paper[2], "description": paper[3],
            "difficulty": paper[4], "totalTurns": paper[5], "startingCash": paper[6],
        },
        "turns": [{
            "turnNo": t[0], "stockName": t[1], "sector": t[2], "asOfDate": t[3].isoformat(),
            "price": t[4], "holdingQty": t[5], "avgBuyPrice": t[6],
            "chartPoints": t[7], "news": t[8], "disclosure": t[9],
            # 아래는 응답 제출 후에만 화면에 노출할 것
            "outcome": {
                "points": t[10], "changePct": float(t[11]), "summary": t[12],
                "idealAction": t[13], "idealRationale": t[14], "learningPoint": t[15],
            },
        } for t in turns],
        "attempt": {
            "status": attempt[1], "finalReturnPct": float(attempt[2]) if attempt[2] else None,
            "alignedCount": attempt[3],
            "responses": [{
                "turnNo": r[0], "action": r[1], "quantity": r[2], "reasonMemo": r[3],
                "viewedDisclosure": r[4], "secondsSpent": r[5], "isAligned": r[6],
            } for r in responses],
        } if attempt else None,
        "diagnoses": [{
            "patternKey": d[0], "severity": d[1], "hitCount": d[2],
            "evidence": d[3], "ragQuery": d[4],
        } for d in diagnoses],
        "quizSet": {
            "headline": quiz_set[1], "generator": quiz_set[2], "questions": questions,
        } if quiz_set else None,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="모의고사·퀴즈 목업 JSON 추출")
    parser.add_argument("--user", default="demo")
    parser.add_argument("--stdout", action="store_true")
    args = parser.parse_args()

    settings = load_settings()
    conn = store.connect(settings.database_url)
    data = export(conn, args.user)
    conn.close()

    text = json.dumps(data, ensure_ascii=False, indent=2)
    if args.stdout:
        print(text)
    else:
        OUT_PATH.write_text(text + "\n", encoding="utf-8")
        print("생성 완료: %s (%.1f KB)" % (OUT_PATH.name, len(text) / 1024))
        if FRONT_PATH.parent.is_dir():
            FRONT_PATH.write_text(text + "\n", encoding="utf-8")
            print("  프론트 사본: %s" % FRONT_PATH.relative_to(Path(__file__).resolve().parent.parent))
        print("  턴 %d개 · 응답 %d개 · 진단 %d개 · 퀴즈 %d문항"
              % (len(data["turns"]),
                 len(data["attempt"]["responses"]) if data["attempt"] else 0,
                 len(data["diagnoses"]),
                 len(data["quizSet"]["questions"]) if data["quizSet"] else 0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
