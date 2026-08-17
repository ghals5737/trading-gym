'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import TopNav from '../../components/TopNav';
import ExamChart, { type ChartPoint } from '../../components/ExamChart';
import { diagnose, type Diagnosis, type ExamAction } from '../../lib/exam-diagnose';
import mock from '../../lib/exam-mock-data.json';

// 백엔드 API가 붙기 전까지는 mock-exam/export_mock.py가 만든 JSON을 그대로 쓴다.
// 응답·진단은 사용자가 이 화면에서 실제로 고른 것으로 계산하고, 퀴즈는 미리 생성해둔
// 문항 은행에서 진단된 패턴에 맞는 것을 고른다(LLM 호출은 서버 몫이라 여기선 불가).

interface NewsItem {
  tag: string;
  title: string;
}
interface DisclosureRow {
  label: string;
  value: string;
  tone: string;
}
interface Turn {
  turnNo: number;
  stockName: string;
  sector: string;
  asOfDate: string;
  price: number;
  holdingQty: number;
  avgBuyPrice: number | null;
  chartPoints: ChartPoint[];
  news: NewsItem[];
  disclosure: { rows: DisclosureRow[]; note: string } | null;
  outcome: {
    points: ChartPoint[];
    changePct: number;
    summary: string;
    idealAction: ExamAction;
    idealRationale: string;
    learningPoint: string;
  };
}
interface QuizQuestion {
  position: number;
  patternKey: string;
  question: string;
  explanation: string;
  whyThisQuestion: string | null;
  relatedTurnNo: number | null;
  source: {
    title: string;
    orgName: string;
    pageStart: number;
    pageEnd: number;
    score: number | null;
  };
  options: { position: number; label: string; isCorrect: boolean }[];
}

const TURNS = mock.turns as unknown as Turn[];
const QUESTIONS = (mock.quizSet?.questions ?? []) as unknown as QuizQuestion[];
const PAPER = mock.paper;
const PROFILE = mock.profile;

const ACTIONS: { key: ExamAction; label: string; hint: string }[] = [
  { key: 'BUY', label: '매수', hint: '지금 산다' },
  { key: 'HOLD', label: '관망', hint: '아무것도 안 한다' },
  { key: 'SELL', label: '매도', hint: '판다 (보유 중일 때)' },
];

const ACTION_LABEL: Record<ExamAction, string> = { BUY: '매수', HOLD: '관망', SELL: '매도' };

const TAG_STYLE: Record<string, { bg: string; fg: string }> = {
  리딩방: { bg: 'var(--red-chip)', fg: 'var(--red)' },
  커뮤니티: { bg: 'var(--amber-chip)', fg: 'var(--amber)' },
  뉴스: { bg: 'var(--chip)', fg: 'var(--soft)' },
};

const RISK_LABEL: Record<string, string> = {
  STABLE: '안정형',
  NEUTRAL: '중립형',
  AGGRESSIVE: '공격형',
};
const KNOWLEDGE_LABEL: Record<string, string> = {
  BEGINNER: '입문',
  INTERMEDIATE: '중급',
  ADVANCED: '상급',
};
const INFO_LABEL: Record<string, string> = {
  INDEPENDENT: '직접 확인형',
  MIXED: '혼합형',
  DEPENDENT: '추천 의존형',
};

const MIN_MEMO = 10;

interface Answer {
  turnNo: number;
  action: ExamAction;
  reasonMemo: string;
  viewedDisclosure: boolean;
}

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

export default function RewindClient() {
  const [step, setStep] = useState<'intro' | 'turn' | 'result' | 'report' | 'quiz'>('intro');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);

  // 현재 턴 입력 상태
  const [action, setAction] = useState<ExamAction | null>(null);
  const [memo, setMemo] = useState('');
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [viewedDisclosure, setViewedDisclosure] = useState(false);

  const [quizPicks, setQuizPicks] = useState<Record<number, number>>({});

  const turn = TURNS[index];
  const isLast = index === TURNS.length - 1;

  const resetTurnState = () => {
    setAction(null);
    setMemo('');
    setDisclosureOpen(false);
    setViewedDisclosure(false);
  };

  const submitTurn = () => {
    if (!action || memo.trim().length < MIN_MEMO) return;
    setAnswers((prev) => [
      ...prev,
      { turnNo: turn.turnNo, action, reasonMemo: memo.trim(), viewedDisclosure },
    ]);
    setStep('result');
  };

  const nextTurn = () => {
    if (isLast) {
      setStep('report');
      return;
    }
    setIndex((i) => i + 1);
    resetTurnState();
    setStep('turn');
  };

  // 사용자가 실제로 고른 답으로 진단 — 미리 계산된 결과가 아니다.
  const diagnoses: Diagnosis[] = useMemo(() => {
    if (answers.length === 0) return [];
    return diagnose(
      answers.map((a) => {
        const t = TURNS.find((x) => x.turnNo === a.turnNo)!;
        return {
          turnNo: a.turnNo,
          stockName: t.stockName,
          action: a.action,
          reasonMemo: a.reasonMemo,
          viewedDisclosure: a.viewedDisclosure,
          isAligned: a.action === t.outcome.idealAction,
          outcomeChangePct: t.outcome.changePct,
        };
      }),
    );
  }, [answers]);

  // 진단된 패턴에 해당하는 문항만 골라 최대 3개 — 심각한 순서 그대로.
  const quiz: QuizQuestion[] = useMemo(() => {
    const keys = diagnoses.map((d) => d.patternKey);
    return keys
      .map((k) => QUESTIONS.find((q) => q.patternKey === k))
      .filter((q): q is QuizQuestion => Boolean(q))
      .slice(0, 3);
  }, [diagnoses]);

  const alignedCount = answers.filter((a) => {
    const t = TURNS.find((x) => x.turnNo === a.turnNo)!;
    return a.action === t.outcome.idealAction;
  }).length;

  // ─────────────────────────────────────────── 시작 화면
  if (step === 'intro') {
    return (
      <div>
        <TopNav right="모의고사" />
        <div className="page-narrow">
          <div className="eyebrow">리와인드 · 모의고사</div>
          <h1 style={{ fontSize: 28, marginBottom: 8 }}>{PAPER.title}</h1>
          <p className="lede">{PAPER.description}</p>

          {PROFILE && (
            <div className="card" style={{ marginTop: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 10 }}>
                내 투자성향 (온보딩 결과)
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <span className="pill">{RISK_LABEL[PROFILE.riskType] ?? PROFILE.riskType}</span>
                <span className="pill">
                  지식 {KNOWLEDGE_LABEL[PROFILE.knowledgeLevel] ?? PROFILE.knowledgeLevel}
                </span>
                <span className="pill">{INFO_LABEL[PROFILE.infoHabit] ?? PROFILE.infoHabit}</span>
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: 'var(--soft)' }}>
                {PROFILE.summary}
              </p>
            </div>
          )}

          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 10 }}>
              이렇게 진행돼요
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.9, color: 'var(--soft)' }}>
              <li>차트와 그날의 뉴스를 봅니다 (공시는 직접 열어봐야 보여요)</li>
              <li><strong style={{ color: 'var(--ink)' }}>매수 · 관망 · 매도</strong> 중 하나를 고르고,</li>
              <li><strong style={{ color: 'var(--ink)' }}>왜 그렇게 판단했는지 메모</strong>를 남깁니다</li>
              <li>제출하면 실제로 어떻게 됐는지 공개돼요 ({PAPER.totalTurns}턴 반복)</li>
              <li>끝나면 메모를 분석해 습관을 진단하고, 맞춤 문제를 드려요</li>
            </ol>
          </div>

          <div className="cta-row" style={{ marginTop: 20 }}>
            <button type="button" className="btn btn-primary" onClick={() => setStep('turn')}>
              모의고사 시작하기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────── 진단 리포트
  if (step === 'report') {
    return (
      <div>
        <TopNav right="진단 리포트" />
        <div className="page-narrow">
          <div className="eyebrow">모의고사 결과</div>
          <h1 style={{ fontSize: 26, marginBottom: 6 }}>
            {TURNS.length}턴 중 {alignedCount}턴을 모범답안과 같게 판단했어요
          </h1>
          <p className="lede">
            아래 진단은 <strong>직접 적으신 메모</strong>에서 뽑은 거예요. 어떤 표현이 근거가 됐는지 같이 보여드릴게요.
          </p>

          {diagnoses.length === 0 ? (
            <div className="card" style={{ marginTop: 16 }}>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--soft)' }}>
                눈에 띄는 위험 습관이 잡히지 않았어요. 메모에 판단 근거를 구체적으로 적을수록 진단이 정확해져요.
              </p>
            </div>
          ) : (
            diagnoses.map((d) => (
              <div key={d.patternKey} className="card" style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span
                    className="pill"
                    style={{
                      background: d.severity === 'HIGH' ? 'var(--red-chip)' : 'var(--amber-chip)',
                      color: d.severity === 'HIGH' ? 'var(--red)' : 'var(--amber)',
                    }}
                  >
                    {d.severity === 'HIGH' ? '주의' : '관찰'}
                  </span>
                  <strong style={{ fontSize: 16 }}>{d.label}</strong>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>{d.hitCount}회</span>
                </div>
                {d.evidence.slice(0, 2).map((e) => (
                  <div
                    key={`${d.patternKey}-${e.turnNo}`}
                    style={{
                      background: 'var(--bg)',
                      borderRadius: 10,
                      padding: '10px 12px',
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                      {e.turnNo}턴 {e.stockName} · {ACTION_LABEL[e.action]}
                      {e.wasWrong && <span style={{ color: 'var(--red)' }}> · 아쉬운 판단</span>}
                      {' · 감지: '}
                      {e.matched.join(', ')}
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink)' }}>“{e.memo}”</div>
                  </div>
                ))}
              </div>
            ))
          )}

          <div className="cta-row" style={{ marginTop: 20 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep('quiz')}
              disabled={quiz.length === 0}
            >
              맞춤 문제 {quiz.length}개 풀어보기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────── 맞춤 퀴즈
  if (step === 'quiz') {
    return (
      <div>
        <TopNav right="맞춤 문제" />
        <div className="page-narrow">
          <div className="eyebrow">내 메모에서 만든 문제</div>
          <h1 style={{ fontSize: 26, marginBottom: 6 }}>
            {mock.quizSet?.headline ?? '맞춤 문제'}
          </h1>
          <p className="lede">
            문제마다 어떤 자료 몇 쪽을 근거로 만들었는지 함께 표시돼요.
          </p>

          {quiz.map((q, qi) => {
            const picked = quizPicks[qi];
            const answered = picked !== undefined;
            const correct = q.options.find((o) => o.isCorrect);
            return (
              <div key={q.patternKey} className="card" style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                  Q{qi + 1}
                  {q.relatedTurnNo ? ` · ${q.relatedTurnNo}턴 판단에서` : ''}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.55, marginBottom: 12 }}>
                  {q.question}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {q.options.map((o) => {
                    const isPicked = picked === o.position;
                    let bg = 'var(--white)';
                    let border = '1px solid var(--line)';
                    if (answered && o.isCorrect) {
                      bg = 'var(--green-chip)';
                      border = '2px solid var(--green)';
                    } else if (answered && isPicked && !o.isCorrect) {
                      bg = 'var(--red-chip)';
                      border = '2px solid var(--red)';
                    }
                    return (
                      <button
                        key={o.position}
                        type="button"
                        disabled={answered}
                        onClick={() => setQuizPicks((p) => ({ ...p, [qi]: o.position }))}
                        style={{
                          textAlign: 'left',
                          padding: '11px 14px',
                          borderRadius: 10,
                          background: bg,
                          border,
                          fontSize: 14,
                          lineHeight: 1.5,
                          color: 'var(--ink)',
                          cursor: answered ? 'default' : 'pointer',
                        }}
                      >
                        {'①②③④'[o.position]} {o.label}
                      </button>
                    );
                  })}
                </div>

                {answered && (
                  <div style={{ marginTop: 12 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: picked === correct?.position ? 'var(--green)' : 'var(--red)',
                        marginBottom: 6,
                      }}
                    >
                      {picked === correct?.position ? '정답이에요' : '아쉬워요'}
                    </div>
                    <p style={{ margin: '0 0 8px', fontSize: 14, lineHeight: 1.65, color: 'var(--soft)' }}>
                      {q.explanation}
                    </p>
                    {q.whyThisQuestion && (
                      <p
                        style={{
                          margin: '0 0 8px',
                          fontSize: 13,
                          lineHeight: 1.6,
                          color: 'var(--soft)',
                          background: 'var(--bg)',
                          borderRadius: 8,
                          padding: '8px 10px',
                        }}
                      >
                        왜 이 문제냐면 — {q.whyThisQuestion}
                      </p>
                    )}
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      근거: {q.source.title} · {q.source.orgName} ·{' '}
                      {q.source.pageStart === q.source.pageEnd
                        ? `${q.source.pageStart}쪽`
                        : `${q.source.pageStart}–${q.source.pageEnd}쪽`}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="cta-row" style={{ marginTop: 20 }}>
            <Link href="/library" className="btn btn-secondary">
              자료실에서 더 읽기
            </Link>
            <Link href="/my" className="btn btn-primary">
              내 기록 보기
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────── 턴 진행 / 결과 공개
  const revealed = step === 'result';
  const myAnswer = revealed ? answers[answers.length - 1] : null;
  const wasRight = myAnswer?.action === turn.outcome.idealAction;

  return (
    <div>
      <TopNav right={`${turn.turnNo} / ${TURNS.length}턴`} />
      <div className="page-narrow">
        <div className="eyebrow">
          {turn.asOfDate} 시점 · {turn.sector}
        </div>
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>
          {turn.stockName}{' '}
          <span style={{ fontSize: 18, color: 'var(--soft)' }}>{won(turn.price)}</span>
        </h1>
        {turn.holdingQty > 0 && (
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--muted)' }}>
            보유 {turn.holdingQty}주 · 평단가 {won(turn.avgBuyPrice ?? 0)}
          </p>
        )}

        <div className="card" style={{ marginTop: 12, padding: 12 }}>
          <ExamChart
            points={turn.chartPoints}
            outcomePoints={revealed ? turn.outcome.points : null}
          />
          {!revealed && (
            <p style={{ margin: '6px 2px 0', fontSize: 12, color: 'var(--muted)' }}>
              이후 흐름은 판단을 제출하면 공개돼요.
            </p>
          )}
        </div>

        {/* 뉴스 */}
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {turn.news.map((n) => {
            const style = TAG_STYLE[n.tag] ?? TAG_STYLE['뉴스'];
            return (
              <div
                key={n.title}
                className="card"
                style={{ padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start' }}
              >
                <span
                  className="pill"
                  style={{ background: style.bg, color: style.fg, flex: 'none' }}
                >
                  {n.tag}
                </span>
                <span style={{ fontSize: 14, lineHeight: 1.5 }}>{n.title}</span>
              </div>
            );
          })}
        </div>

        {/* 공시 */}
        {turn.disclosure && (
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => {
                setDisclosureOpen((v) => !v);
                setViewedDisclosure(true);
              }}
              disabled={revealed}
            >
              {disclosureOpen ? '공시 접기' : '📄 공시·재무 확인하기 (DART)'}
            </button>
            {disclosureOpen && (
              <div className="card" style={{ marginTop: 8 }}>
                {turn.disclosure.rows.map((r) => (
                  <div
                    key={r.label}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '8px 0',
                      borderBottom: '1px solid var(--line)',
                      fontSize: 14,
                    }}
                  >
                    <span style={{ color: 'var(--soft)' }}>{r.label}</span>
                    <strong style={{ color: r.tone === 'bad' ? 'var(--red)' : 'var(--green)' }}>
                      {r.value}
                    </strong>
                  </div>
                ))}
                <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                  {turn.disclosure.note}
                </p>
              </div>
            )}
          </div>
        )}

        {/* 판단 입력 */}
        {!revealed && (
          <div className="card" style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>어떻게 하시겠어요?</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {ACTIONS.map((a) => {
                const disabled = a.key === 'SELL' && turn.holdingQty === 0;
                const selected = action === a.key;
                return (
                  <button
                    key={a.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => setAction(a.key)}
                    style={{
                      padding: '12px 8px',
                      borderRadius: 12,
                      border: selected ? '2px solid var(--green)' : '1px solid var(--line)',
                      background: selected ? 'var(--green-chip)' : 'var(--white)',
                      color: disabled ? 'var(--muted)' : 'var(--ink)',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.5 : 1,
                    }}
                  >
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{a.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{a.hint}</div>
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: 14 }}>
              <label
                htmlFor="memo"
                style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}
              >
                왜 그렇게 판단했나요? <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <textarea
                id="memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={3}
                placeholder="예: 공시를 보니 매출이 늘고 있어서 분위기와 다르다고 생각했어요"
                style={{
                  width: '100%',
                  borderRadius: 10,
                  border: '1px solid var(--line)',
                  background: 'var(--white)',
                  color: 'var(--ink)',
                  padding: '10px 12px',
                  fontSize: 14,
                  lineHeight: 1.6,
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                {memo.trim().length < MIN_MEMO
                  ? `${MIN_MEMO}자 이상 적어주세요 (${memo.trim().length}/${MIN_MEMO}) — 이 메모로 투자 습관을 진단해요`
                  : '좋아요. 이 메모가 맞춤 문제의 재료가 돼요.'}
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary btn-block"
              style={{ marginTop: 14 }}
              disabled={!action || memo.trim().length < MIN_MEMO}
              onClick={submitTurn}
            >
              제출하고 결과 보기
            </button>
          </div>
        )}

        {/* 결과 공개 */}
        {revealed && myAnswer && (
          <div
            className="card"
            style={{
              marginTop: 14,
              border: wasRight ? '2px solid var(--green)' : '1px solid var(--line)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span
                className="pill"
                style={{
                  background: wasRight ? 'var(--green-chip)' : 'var(--red-chip)',
                  color: wasRight ? 'var(--green)' : 'var(--red)',
                }}
              >
                {wasRight ? '모범답안과 같아요' : '모범답안과 달라요'}
              </span>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                내 판단 {ACTION_LABEL[myAnswer.action]} · 모범답안{' '}
                {ACTION_LABEL[turn.outcome.idealAction]}
              </span>
            </div>

            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: turn.outcome.changePct >= 0 ? 'var(--red)' : '#3e6fd8',
                marginBottom: 6,
              }}
            >
              {turn.outcome.summary}
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.65, color: 'var(--soft)' }}>
              {turn.outcome.idealRationale}
            </p>
            <div
              style={{
                background: 'var(--green-chip)',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 13,
                color: 'var(--ink)',
              }}
            >
              배울 점 — {turn.outcome.learningPoint}
            </div>

            <button
              type="button"
              className="btn btn-primary btn-block"
              style={{ marginTop: 14 }}
              onClick={nextTurn}
            >
              {isLast ? '진단 리포트 보기' : '다음 턴으로'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
