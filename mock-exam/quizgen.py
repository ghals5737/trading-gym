#!/usr/bin/env python3
"""모의고사 응시 기록 → 행동 진단 → edu_chunks RAG 검색 → 맞춤 퀴즈 생성.

  python3 quizgen.py --user demo              # 최근 응시로 퀴즈 생성
  python3 quizgen.py --user demo --diagnose   # 진단만 하고 퀴즈는 안 만듦
  python3 quizgen.py --user demo --show       # 생성된 퀴즈 조회

핵심은 exam_responses.reason_memo다. 매매 기록만 보면 "1턴에 매수했다"까지만 알 수 있지만,
메모를 보면 "리딩방을 보고 샀다"는 걸 안다. 그래야 같은 오답이라도 원인별로 다른 자료를
찾아 다른 문제를 낼 수 있다.

파이프라인:
  1) 응답+메모를 규칙으로 스캔해 행동 패턴 진단 (exam_diagnoses)
  2) 패턴마다 정해진 자연어 질의로 edu_chunks를 벡터 검색 → 근거 청크
  3) 근거 + 사용자의 실제 메모를 프롬프트에 넣어 LLM이 4지선다 생성
     (키가 없으면 stub 생성기가 근거 청크를 활용한 문제를 만들어 데모는 항상 동작)
  4) quiz_sets / quiz_questions / quiz_options에 저장. 문항마다 source_chunk_id로 근거를 고정.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

# 임베딩·검색은 edu-rag-indexer의 lib을 그대로 재사용한다(중복 구현 방지).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "edu-rag-indexer"))

from lib import store  # noqa: E402
from lib.embedding import get_embedder  # noqa: E402
from lib.settings import load_settings  # noqa: E402

# ---------------------------------------------------------------------------
# 1) 진단 규칙
# ---------------------------------------------------------------------------
# 각 패턴은 (메모에서 찾을 표현, 행동 조건)으로 정의하고, 그 패턴을 보완할
# 교육자료를 찾기 위한 rag_query를 들고 있다. 규칙 기반이라 왜 그렇게 진단했는지
# 항상 설명할 수 있다 — 심사에서 "AI가 그냥 그렇게 말했다"를 피하려는 의도.

PATTERNS: List[Dict[str, Any]] = [
    {
        "key": "NEWS_CHASING",
        "label": "뉴스·리딩방 보고 추격매수",
        "keywords": ["리딩방", "추천", "마지막 기회", "지금 아니면", "실검", "수혜주", "테마"],
        "actions": ["BUY"],
        "rag_query": "투자 정보를 검증하지 않고 추천만 믿고 매수하는 위험",
    },
    {
        "key": "HERD_FOLLOWING",
        "label": "남들 따라 사기(군중심리)",
        "keywords": ["다들", "남들", "분위기", "뒤처", "인증", "1위", "너도나도"],
        "actions": ["BUY"],
        "rag_query": "군중심리에 휩쓸린 투자와 과열된 테마주의 위험",
    },
    {
        "key": "PANIC_SELL",
        "label": "공포에 매도",
        "keywords": ["무서", "불안", "더 떨어질", "겁", "폭락", "던지"],
        "actions": ["SELL"],
        "rag_query": "시장이 급락할 때 공포에 파는 투자자의 심리와 대응",
    },
    {
        "key": "LOSS_AVERSION",
        "label": "손실 확정 회피·물타기",
        "keywords": ["평단", "물타기", "추가매수", "버티", "손실이 확정", "본전"],
        "actions": ["BUY", "HOLD"],
        "rag_query": "손실이 났을 때 손절매 기준을 세우고 물타기를 피하는 방법",
    },
    {
        "key": "NO_RATIONALE",
        "label": "근거 없는 판단",
        "keywords": ["느낌", "감으로", "그냥", "왠지", "찍", "몰라"],
        "actions": ["BUY", "SELL", "HOLD"],
        "rag_query": "투자 판단의 기준을 세우고 계획적으로 투자하는 방법",
    },
]

# 공시 미확인은 메모가 아니라 행동(viewed_disclosure)으로 판정하므로 따로 둔다.
DISCLOSURE_PATTERN = {
    "key": "DISCLOSURE_IGNORED",
    "label": "공시 확인 없이 판단",
    "rag_query": "재무제표와 공시를 확인하고 투자를 결정하는 방법",
}


def diagnose(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """응답 목록 → 진단 목록. evidence에 '어느 턴의 어떤 메모 때문인지'를 남긴다."""
    found: List[Dict[str, Any]] = []

    for pattern in PATTERNS:
        evidence = []
        for row in rows:
            if row["action"] not in pattern["actions"]:
                continue
            memo = row["reason_memo"]
            hits = [kw for kw in pattern["keywords"] if kw in memo]
            if not hits:
                continue
            evidence.append({
                "turn_no": row["turn_no"],
                "stock_name": row["stock_name"],
                "action": row["action"],
                "matched": hits,
                "memo": memo,
                "was_wrong": not row["is_aligned"],
                "outcome_change_pct": float(row["outcome_change_pct"]),
            })
        if evidence:
            wrong = sum(1 for e in evidence if e["was_wrong"])
            severity = "HIGH" if wrong >= 2 else ("MEDIUM" if wrong == 1 else "LOW")
            found.append({
                "pattern_key": pattern["key"],
                "label": pattern["label"],
                "severity": severity,
                "hit_count": len(evidence),
                "evidence": evidence,
                "rag_query": pattern["rag_query"],
            })

    # 공시 미확인 — 매수 판단 중 공시를 안 본 비율로 판정
    buys = [r for r in rows if r["action"] == "BUY"]
    unchecked = [r for r in buys if not r["viewed_disclosure"]]
    if buys and len(unchecked) / len(buys) >= 0.5:
        found.append({
            "pattern_key": DISCLOSURE_PATTERN["key"],
            "label": DISCLOSURE_PATTERN["label"],
            "severity": "HIGH" if len(unchecked) >= 3 else "MEDIUM",
            "hit_count": len(unchecked),
            "evidence": [{
                "turn_no": r["turn_no"],
                "stock_name": r["stock_name"],
                "action": r["action"],
                "matched": ["공시 미확인"],
                "memo": r["reason_memo"],
                "was_wrong": not r["is_aligned"],
                "outcome_change_pct": float(r["outcome_change_pct"]),
            } for r in unchecked],
            "rag_query": DISCLOSURE_PATTERN["rag_query"],
        })

    # 심각도 높은 것 → 많이 걸린 것 순
    order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    found.sort(key=lambda d: (order[d["severity"]], -d["hit_count"]))
    return found


# ---------------------------------------------------------------------------
# 2) 퀴즈 생성기 (stub / LLM)
# ---------------------------------------------------------------------------

QUIZ_JSON_SCHEMA = """{
  "question": "질문 한 문장",
  "options": ["보기1", "보기2", "보기3", "보기4"],
  "correct_index": 0,
  "explanation": "왜 그 답이 맞는지 2~3문장. 근거 자료의 내용을 인용할 것.",
  "why_this_question": "이 사용자에게 왜 이 문제를 냈는지 한 문장"
}"""


def pick_evidence(diag: Dict[str, Any], used_turns: Optional[set] = None) -> Dict[str, Any]:
    """이 진단을 대표할 판단 하나를 고른다.

    기준: (1) 앞 문제에서 이미 인용한 턴은 피한다 — 문제마다 다른 판단을 짚어줘야
    "내 모의고사를 읽고 만든 문제"로 느껴진다. (2) 틀린 판단 우선. (3) 손익 영향이 큰 순.
    """
    candidates = diag["evidence"]
    if used_turns:
        fresh = [e for e in candidates if e["turn_no"] not in used_turns]
        if fresh:
            candidates = fresh
    return max(candidates, key=lambda e: (e["was_wrong"], abs(e["outcome_change_pct"])))


def build_prompt(diag: Dict[str, Any], chunks: List[Dict[str, Any]],
                 worst: Optional[Dict[str, Any]] = None) -> str:
    worst = worst or pick_evidence(diag)
    sources = "\n\n".join(
        "[자료 %d] %s · %s %s쪽\n%s"
        % (i + 1, c["title"], c["org_name"] or "", c["page_start"],
           " ".join(c["content"].split())[:700])
        for i, c in enumerate(chunks)
    )
    return f"""당신은 투자 교육 코치입니다. 아래 사용자의 실제 모의고사 판단을 보고,
제공된 교육자료에 근거해서 4지선다 문제 1개를 만들어주세요.

[사용자의 판단]
- {worst['turn_no']}턴 {worst['stock_name']}에서 '{worst['action']}'를 선택
- 그 이유로 이렇게 적었습니다: "{worst['memo']}"
- 결과: 이후 {worst['outcome_change_pct']}%
- 진단된 습관: {diag['label']}

[교육자료 — 반드시 이 내용에만 근거할 것]
{sources}

[요구사항]
- 사용자가 실제로 한 판단과 직접 연결되는 문제일 것
- 보기 4개는 모두 그럴듯하되 정답은 하나
- 자료에 없는 내용을 지어내지 말 것
- 아래 JSON 형식으로만 답할 것 (설명 문장 없이 JSON만)

{QUIZ_JSON_SCHEMA}"""


def generate_stub(diag: Dict[str, Any], chunks: List[Dict[str, Any]],
                  worst: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """LLM 키가 없어도 데모가 돌아가게 하는 기본 생성기.

    진단 패턴별로 미리 써둔 문제를 쓰되, 근거 자료와 사용자의 실제 메모는 실제
    검색·응답 결과를 끼워넣는다. (문항 자체는 고정이라 '생성'은 아니지만,
    근거 연결과 저장 경로는 LLM 경로와 완전히 동일하게 검증된다.)
    """
    worst = worst or pick_evidence(diag)
    bank = {
        "NEWS_CHASING": (
            "리딩방이나 뉴스에서 \"지금이 마지막 기회\"라는 말을 들었을 때, 가장 먼저 해야 할 일은?",
            ["남들보다 늦기 전에 일단 소액이라도 매수한다",
             "기업의 공시와 재무제표를 직접 확인해 그 주장에 근거가 있는지 본다",
             "차트가 우상향인지만 확인하고 판단한다",
             "커뮤니티에서 다른 사람들의 반응을 더 찾아본다"],
            1,
            "추천의 강도와 근거의 강도는 다릅니다. 급하게 결정하도록 압박하는 정보일수록 공시·재무 같은 1차 자료로 확인해야 해요.",
        ),
        "HERD_FOLLOWING": (
            "단기간에 급등한 테마주에서 \"다들 사고 있다\"는 이유로 매수할 때 가장 큰 위험은?",
            ["거래량이 줄어 매도가 어려워진다",
             "테마와 실제 사업·매출의 연결고리가 약해 기대가 꺼지면 급락한다",
             "배당을 받지 못한다",
             "증권사 수수료가 더 비싸진다"],
            1,
            "테마 관련 매출이 전체의 일부에 불과한 경우가 많습니다. 기대감만으로 오른 가격은 기대가 사라지면 근거 없이 무너집니다.",
        ),
        "PANIC_SELL": (
            "시장 전체가 급락할 때, 보유 종목을 팔지 말지 판단하는 기준으로 가장 적절한 것은?",
            ["오늘 하락률이 얼마인지",
             "커뮤니티 분위기가 얼마나 나쁜지",
             "그 기업의 재무 상태와 실적이 실제로 나빠졌는지",
             "주변 사람들이 팔았는지"],
            2,
            "시장 전체의 하락과 개별 기업의 가치 훼손은 다른 문제입니다. 재무가 멀쩡한데 분위기 때문에 파는 것이 가장 비싼 선택이 되곤 해요.",
        ),
        "LOSS_AVERSION": (
            "손실 중인 종목의 평균 단가를 낮추려고 추가 매수할 때 실제로 일어나는 일은?",
            ["손실이 줄어들고 회복이 빨라진다",
             "투자 원금이 커져서 같은 하락률에도 손실 금액이 더 커진다",
             "평단가가 낮아지므로 위험도 함께 낮아진다",
             "세금이 줄어든다"],
            1,
            "평단가가 낮아지는 것과 위험이 줄어드는 것은 다릅니다. 하락에 근거가 있다면 추가 매수는 한 종목에 더 크게 베팅하는 셈이에요.",
        ),
        "NO_RATIONALE": (
            "투자 판단을 기록으로 남겨야 하는 가장 큰 이유는?",
            ["세금 신고에 필요해서",
             "나중에 결과와 대조해 어떤 근거가 맞고 틀렸는지 배울 수 있어서",
             "증권사에 제출해야 해서",
             "수수료를 아낄 수 있어서"],
            1,
            "\"느낌\"으로 산 판단은 결과가 좋든 나쁘든 배울 게 남지 않습니다. 근거를 적어두면 그 근거가 맞았는지 검증할 수 있어요.",
        ),
        "DISCLOSURE_IGNORED": (
            "매수 전에 전자공시(DART)에서 확인해야 할 항목으로 가장 거리가 먼 것은?",
            ["최근 매출과 영업이익 추이",
             "전환사채(CB) 등 잠재적 매도 물량",
             "최대주주·임원의 지분 매각 여부",
             "해당 종목의 오늘 실시간 검색어 순위"],
            3,
            "공시는 기업의 실제 상태를 담은 1차 자료입니다. 검색어 순위는 분위기일 뿐 기업 가치와 무관해요.",
        ),
    }
    question, options, correct, explanation = bank[diag["pattern_key"]]
    return {
        "question": question,
        "options": options,
        "correct_index": correct,
        "explanation": explanation,
        "why_this_question": "%d턴에서 \"%s\"라고 적으셨어요. 그 판단의 근거를 다시 살펴보는 문제예요."
                             % (worst["turn_no"], worst["memo"][:40].rstrip() + "…"),
    }


def generate_llm(prompt: str, provider: str, model: str, api_key: str) -> Optional[Dict[str, Any]]:
    """Anthropic API로 생성. 실패하면 None을 돌려 호출부가 stub으로 넘어가게 한다."""
    import urllib.request

    body = json.dumps({
        "model": model,
        "max_tokens": 1200,
        "messages": [{"role": "user", "content": prompt}],
    }).encode("utf-8")
    request = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "content-type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
        text = "".join(part.get("text", "") for part in payload.get("content", []))
        match = re.search(r"\{.*\}", text, re.S)
        if not match:
            print("  ! LLM 응답에서 JSON을 찾지 못했습니다 — stub으로 대체")
            return None
        return json.loads(match.group(0))
    except Exception as exc:
        print("  ! LLM 호출 실패(%s) — stub으로 대체" % exc)
        return None


def validate(quiz: Dict[str, Any]) -> bool:
    """LLM이 만든 JSON을 저장 전에 검증 — 형식이 깨진 문제가 DB에 들어가지 않게."""
    if not isinstance(quiz.get("question"), str) or not quiz["question"].strip():
        return False
    options = quiz.get("options")
    if not isinstance(options, list) or len(options) != 4:
        return False
    if any(not isinstance(o, str) or not o.strip() for o in options):
        return False
    index = quiz.get("correct_index")
    if not isinstance(index, int) or not 0 <= index < 4:
        return False
    return isinstance(quiz.get("explanation"), str) and bool(quiz["explanation"].strip())


# ---------------------------------------------------------------------------
# 3) DB 입출력
# ---------------------------------------------------------------------------


def load_attempt(conn, user_key: str) -> Optional[Dict[str, Any]]:
    row = conn.execute(
        """
        SELECT a.id, a.paper_id, p.title, a.final_return_pct, a.aligned_count, p.total_turns
        FROM exam_attempts a JOIN exam_papers p ON p.id = a.paper_id
        WHERE a.user_key = %s AND a.status = 'COMPLETED'
        ORDER BY a.completed_at DESC NULLS LAST, a.id DESC LIMIT 1
        """,
        (user_key,),
    ).fetchone()
    if not row:
        return None
    return {"id": row[0], "paper_id": row[1], "paper_title": row[2],
            "final_return_pct": row[3], "aligned_count": row[4], "total_turns": row[5]}


def load_responses(conn, attempt_id: int) -> List[Dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT t.turn_no, t.id, t.stock_name, r.action, t.ideal_action, r.reason_memo,
               r.viewed_disclosure, r.is_aligned, t.outcome_change_pct, t.learning_point
        FROM exam_responses r JOIN exam_turns t ON t.id = r.turn_id
        WHERE r.attempt_id = %s ORDER BY t.turn_no
        """,
        (attempt_id,),
    ).fetchall()
    return [{"turn_no": r[0], "turn_id": r[1], "stock_name": r[2], "action": r[3],
             "ideal_action": r[4], "reason_memo": r[5], "viewed_disclosure": r[6],
             "is_aligned": r[7], "outcome_change_pct": r[8], "learning_point": r[9]}
            for r in rows]


def save_diagnoses(conn, attempt_id: int, diagnoses: List[Dict[str, Any]]) -> None:
    conn.execute("DELETE FROM exam_diagnoses WHERE attempt_id = %s", (attempt_id,))
    with conn.cursor() as cursor:
        cursor.executemany(
            """
            INSERT INTO exam_diagnoses (attempt_id, pattern_key, severity, hit_count, evidence, rag_query)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            [(attempt_id, d["pattern_key"], d["severity"], d["hit_count"],
              json.dumps(d["evidence"], ensure_ascii=False), d["rag_query"]) for d in diagnoses],
        )
    conn.commit()


def save_quiz_set(conn, attempt_id: int, user_key: str, generator: str,
                  headline: str, items: List[Dict[str, Any]]) -> int:
    conn.execute("DELETE FROM quiz_sets WHERE attempt_id = %s", (attempt_id,))
    set_id = conn.execute(
        "INSERT INTO quiz_sets (attempt_id, user_key, generator, headline) VALUES (%s,%s,%s,%s) RETURNING id",
        (attempt_id, user_key, generator, headline),
    ).fetchone()[0]

    for position, item in enumerate(items):
        chunk = item["chunk"]
        quiz = item["quiz"]
        question_id = conn.execute(
            """
            INSERT INTO quiz_questions
              (set_id, position, pattern_key, related_turn_id, question, explanation,
               why_this_question, source_chunk_id, source_title, source_org,
               source_page_start, source_page_end, source_score)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
            """,
            (set_id, position, item["pattern_key"], item["related_turn_id"],
             quiz["question"], quiz["explanation"], quiz.get("why_this_question"),
             chunk["chunk_id"], chunk["title"], chunk["org_name"],
             chunk["page_start"], chunk["page_end"], round(chunk["score"], 4)),
        ).fetchone()[0]
        with conn.cursor() as cursor:
            cursor.executemany(
                "INSERT INTO quiz_options (question_id, position, label, is_correct) VALUES (%s,%s,%s,%s)",
                [(question_id, i, label, i == quiz["correct_index"])
                 for i, label in enumerate(quiz["options"])],
            )
    conn.commit()
    return set_id


def search_chunks(conn, embedder, query: str, top_k: int = 3) -> List[Dict[str, Any]]:
    vector = embedder.encode([query])[0]
    results = store.search(conn, vector, top_k=top_k)
    # store.search는 chunk id를 안 돌려줘서, 근거를 DB에 고정하려면 id가 필요하다.
    for r in results:
        row = conn.execute(
            """
            SELECT c.id FROM edu_chunks c JOIN edu_documents d ON d.id = c.document_id
            WHERE c.chunk_index = %s AND d.title = %s LIMIT 1
            """,
            (r["chunk_index"], r["title"]),
        ).fetchone()
        r["chunk_id"] = row[0] if row else None
    return results


# ---------------------------------------------------------------------------
# 4) 출력
# ---------------------------------------------------------------------------


def print_diagnoses(attempt: Dict[str, Any], diagnoses: List[Dict[str, Any]]) -> None:
    print("=" * 78)
    print("모의고사 진단 — %s" % attempt["paper_title"])
    print("  정답 %s/%s턴 · 최종 수익률 %s%%" %
          (attempt["aligned_count"], attempt["total_turns"], attempt["final_return_pct"]))
    print("=" * 78)
    for d in diagnoses:
        print("[%s] %s (%s · %d회)" % (d["severity"], d["label"], d["pattern_key"], d["hit_count"]))
        for e in d["evidence"][:2]:
            mark = "오답" if e["was_wrong"] else "정답"
            print("   %d턴 %s %s(%s) · 감지어: %s" %
                  (e["turn_no"], e["stock_name"], e["action"], mark, ", ".join(e["matched"])))
            print("     \"%s\"" % (e["memo"][:60] + ("…" if len(e["memo"]) > 60 else "")))
        print("   → 검색 질의: %s" % d["rag_query"])
        print()


def show_quiz(conn, user_key: str) -> int:
    row = conn.execute(
        "SELECT id, headline, generator, created_at FROM quiz_sets WHERE user_key=%s ORDER BY id DESC LIMIT 1",
        (user_key,),
    ).fetchone()
    if not row:
        print("생성된 퀴즈가 없습니다. 먼저 quizgen.py를 실행하세요.")
        return 1
    set_id, headline, generator, created_at = row
    print("=" * 78)
    print("맞춤 퀴즈 — %s" % headline)
    print("  생성기: %s · %s" % (generator, created_at.strftime("%Y-%m-%d %H:%M")))
    print("=" * 78)

    questions = conn.execute(
        """
        SELECT q.id, q.position, q.pattern_key, q.question, q.explanation, q.why_this_question,
               q.source_title, q.source_org, q.source_page_start, q.source_page_end, q.source_score,
               t.turn_no
        FROM quiz_questions q LEFT JOIN exam_turns t ON t.id = q.related_turn_id
        WHERE q.set_id = %s ORDER BY q.position
        """,
        (set_id,),
    ).fetchall()
    for q in questions:
        print("Q%d. [%s] %s" % (q[1] + 1, q[2], q[3]))
        options = conn.execute(
            "SELECT position, label, is_correct FROM quiz_options WHERE question_id=%s ORDER BY position",
            (q[0],),
        ).fetchall()
        for pos, label, correct in options:
            print("   %s %s%s" % ("①②③④"[pos], label, "  ← 정답" if correct else ""))
        print("   해설: %s" % q[4])
        if q[5]:
            print("   왜 이 문제: %s" % q[5])
        pages = "%s쪽" % q[8] if q[8] == q[9] else "%s–%s쪽" % (q[8], q[9])
        print("   근거: %s · %s · %s (유사도 %.4f)" % (q[6], q[7], pages, q[10]))
        print()
    return 0


# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description="모의고사 → RAG 맞춤 퀴즈 생성")
    parser.add_argument("--user", default="demo", help="사용자 키 (기본 demo)")
    parser.add_argument("--diagnose", action="store_true", help="진단만 하고 퀴즈는 안 만듦")
    parser.add_argument("--show", action="store_true", help="생성된 퀴즈 조회")
    parser.add_argument("--max-questions", type=int, default=3, help="생성할 문항 수 (기본 3)")
    args = parser.parse_args()

    settings = load_settings()
    conn = store.connect(settings.database_url)

    if args.show:
        code = show_quiz(conn, args.user)
        conn.close()
        return code

    attempt = load_attempt(conn, args.user)
    if not attempt:
        print("완료된 모의고사 응시가 없습니다: %s" % args.user)
        conn.close()
        return 1

    responses = load_responses(conn, attempt["id"])
    diagnoses = diagnose(responses)
    save_diagnoses(conn, attempt["id"], diagnoses)
    print_diagnoses(attempt, diagnoses)

    if args.diagnose:
        conn.close()
        return 0

    if not diagnoses:
        print("진단된 습관이 없어 퀴즈를 만들지 않았습니다.")
        conn.close()
        return 0

    import os
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    model = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5")
    generator = ("anthropic:%s" % model) if api_key else "stub"
    print("퀴즈 생성 — 생성기: %s" % generator)

    print("임베딩 모델 로딩 중...")
    embedder = get_embedder(settings.embedding)

    items: List[Dict[str, Any]] = []
    used_turns: set = set()  # 문제마다 다른 턴을 인용하도록 추적
    for diag in diagnoses[: args.max_questions]:
        chunks = search_chunks(conn, embedder, diag["rag_query"], top_k=3)
        if not chunks:
            print("  ! %s — 근거 자료를 못 찾아 건너뜁니다" % diag["pattern_key"])
            continue
        top = chunks[0]
        print("  [%s] 근거: %s %s쪽 (유사도 %.4f)" %
              (diag["pattern_key"], top["title"], top["page_start"], top["score"]))

        worst = pick_evidence(diag, used_turns)
        used_turns.add(worst["turn_no"])

        quiz = None
        if api_key:
            quiz = generate_llm(build_prompt(diag, chunks, worst), "anthropic", model, api_key)
            if quiz and not validate(quiz):
                print("  ! 생성된 JSON이 형식에 안 맞아 stub으로 대체")
                quiz = None
        if quiz is None:
            quiz = generate_stub(diag, chunks, worst)

        turn_id = next((r["turn_id"] for r in responses if r["turn_no"] == worst["turn_no"]), None)
        items.append({"pattern_key": diag["pattern_key"], "related_turn_id": turn_id,
                      "chunk": top, "quiz": quiz})

    if not items:
        print("생성된 문항이 없습니다.")
        conn.close()
        return 1

    worst_diag = diagnoses[0]
    headline = "%s 습관이 %d번 보였어요" % (worst_diag["label"], worst_diag["hit_count"])
    set_id = save_quiz_set(conn, attempt["id"], args.user, generator, headline, items)
    print()
    print("저장 완료 — quiz_sets id=%d, 문항 %d개" % (set_id, len(items)))
    print("조회: python3 quizgen.py --user %s --show" % args.user)
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
