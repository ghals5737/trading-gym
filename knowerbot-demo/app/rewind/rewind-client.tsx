'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import TopNav from '../../components/TopNav';
import ExamChart from '../../components/ExamChart';
import useLoggedIn from '../../components/useLoggedIn';
import {
  answerExamQuiz,
  generateExamQuiz,
  getActiveExam,
  getExamQuiz,
  getExamReport,
  getExamTurn,
  getMyInvestorProfileSafe,
  startExam,
  submitTurn,
  type Diagnosis,
  type ExamAction,
  type ExamAttempt,
  type ExamReport,
  type ExamTurn,
  type ExamTurnOutcome,
  type QuizSet,
} from '../../lib/exam-api';
import { AUTOFILL_PRESETS, autofillExam, type AutofillPreset } from '../../lib/exam-autofill';

// 개발 중에만 노출되는 테스트 도구. 5턴을 손으로 푸는 게 번거로워서 만든 것이라
// 프로덕션 빌드에서는 버튼 자체가 렌더되지 않는다.
const DEV_TOOLS = process.env.NODE_ENV === 'development';

// 모의고사 화면. 진단·퀴즈 생성은 전부 백엔드(/api/exam)가 하고, 여기서는 단계 전환과
// 입력만 담당한다. 예전엔 목업 JSON + 프론트 진단이었는데, 규칙이 두 곳에 있으면
// 어긋나기 때문에 API 연결과 함께 서버로 넘겼다.

type Step = 'intro' | 'turn' | 'result' | 'report' | 'quiz';

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

// 서버도 같은 값으로 검증한다(ExamService.minMemoLength) — 여기서 먼저 막아 왕복을 아낀다.
const MIN_MEMO = 10;

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

interface ProfileSummary {
  riskType: string;
  knowledgeLevel: string;
  infoHabit: string;
  explanationText: string | null;
}

export default function RewindClient() {
  const loggedIn = useLoggedIn();

  const [step, setStep] = useState<Step>('intro');
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [turn, setTurn] = useState<ExamTurn | null>(null);
  const [outcome, setOutcome] = useState<ExamTurnOutcome | null>(null);
  const [report, setReport] = useState<ExamReport | null>(null);
  const [quizSet, setQuizSet] = useState<QuizSet | null>(null);
  const [profile, setProfile] = useState<ProfileSummary | null>(null);

  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  // 현재 턴 입력
  const [action, setAction] = useState<ExamAction | null>(null);
  const [memo, setMemo] = useState('');
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [viewedDisclosure, setViewedDisclosure] = useState(false);

  const run = useCallback(async <T,>(label: string, fn: () => Promise<T>): Promise<T | null> => {
    setBusy(true);
    setBusyLabel(label);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : '요청이 실패했어요');
      return null;
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  }, []);

  const resetTurnInput = () => {
    setAction(null);
    setMemo('');
    setDisclosureOpen(false);
    setViewedDisclosure(false);
  };

  // 로그인 후 진행 중인 응시가 있으면 이어서 풀게 한다(새로고침 대비).
  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    (async () => {
      const [active, myProfile] = await Promise.all([
        getActiveExam().catch(() => null),
        getMyInvestorProfileSafe(),
      ]);
      if (cancelled) return;
      if (myProfile) setProfile(myProfile);
      if (active?.currentTurn) {
        setAttempt(active);
        setTurn(active.currentTurn);
        setStep('turn');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

  const onStart = async () => {
    const started = await run('모의고사를 준비하는 중', () => startExam());
    if (!started) return;
    setAttempt(started);
    setTurn(started.currentTurn);
    resetTurnInput();
    setStep('turn');
  };

  const onSubmitTurn = async () => {
    if (!attempt || !action || memo.trim().length < MIN_MEMO) return;
    const result = await run('결과를 확인하는 중', () =>
      submitTurn(attempt.attemptId, {
        action,
        reasonMemo: memo.trim(),
        viewedDisclosure,
      }),
    );
    if (!result) return;
    setOutcome(result);
    setStep('result');
  };

  const onNext = async () => {
    if (!attempt || !outcome) return;
    if (outcome.completed) {
      const built = await run('메모를 분석하는 중', () => getExamReport(attempt.attemptId));
      if (!built) return;
      setReport(built);
      setStep('report');
      return;
    }
    const next = await run('다음 문제를 가져오는 중', () =>
      getExamTurn(attempt.attemptId, outcome.nextTurnNo!),
    );
    if (!next) return;
    setTurn(next);
    setOutcome(null);
    resetTurnInput();
    setStep('turn');
  };

  // 테스트용: 남은 턴을 프리셋 답안으로 자동 제출하고 바로 리포트까지 간다.
  const onAutofill = async (preset: AutofillPreset) => {
    let target = attempt;
    if (!target) {
      const started = await run('모의고사를 시작하는 중', () => startExam());
      if (!started) return;
      target = started;
      setAttempt(started);
    }
    const from = turn?.turnNo ?? target.currentTurnNo;
    const done = await run(`${preset.label} 답안으로 채우는 중`, async () => {
      await autofillExam(target!.attemptId, preset, from, target!.totalTurns, (p) =>
        setBusyLabel(`${preset.label} 답안으로 채우는 중 (${p.turnNo}/${p.total}턴)`),
      );
      return getExamReport(target!.attemptId);
    });
    if (!done) return;
    setReport(done);
    setOutcome(null);
    setStep('report');
  };

  const onGenerateQuiz = async () => {
    if (!attempt) return;
    // 이미 만들어둔 세트가 있으면 재사용 — LLM 호출을 아낀다.
    const existing = await getExamQuiz(attempt.attemptId).catch(() => null);
    if (existing) {
      setQuizSet(existing);
      setStep('quiz');
      return;
    }
    const generated = await run('맞춤 문제를 만드는 중 (10초쯤 걸려요)', () =>
      generateExamQuiz(attempt.attemptId),
    );
    if (!generated) return;
    setQuizSet(generated);
    setStep('quiz');
  };

  const onAnswerQuiz = async (questionId: string, optionId: string) => {
    const result = await run('채점하는 중', () => answerExamQuiz(questionId, optionId));
    if (!result || !quizSet) return;
    setQuizSet({
      ...quizSet,
      questions: quizSet.questions.map((q) =>
        q.id === questionId
          ? {
              ...q,
              answered: true,
              answeredOptionId: optionId,
              correctOptionId: result.correctOptionId,
              correct: result.correct,
              explanation: result.explanation,
              whyThisQuestion: result.whyThisQuestion,
            }
          : q,
      ),
    });
  };

  // ─────────────────────────────────────────── 공통 조각
  const devPanel = DEV_TOOLS ? (
    <div
      className="card"
      style={{ marginTop: 12, border: '1px dashed var(--muted)', background: 'transparent' }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>
        🧪 테스트 도구 (개발 모드에서만 보여요)
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {AUTOFILL_PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy}
            title={preset.description}
            onClick={() => onAutofill(preset)}
          >
            {preset.label}로 채우기
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, lineHeight: 1.6 }}>
        남은 턴을 미리 정해둔 답안으로 제출하고 바로 진단 리포트로 넘어가요.
        메모에 진단 규칙이 잡는 표현이 들어 있어서 결과도 그대로 나옵니다.
      </div>
    </div>
  ) : null;

  const banner = (
    <>
      {busy && (
        <div className="card" style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="pill">진행 중</span>
          <span style={{ fontSize: 14, color: 'var(--soft)' }}>{busyLabel}…</span>
        </div>
      )}
      {error && (
        <div
          className="card"
          style={{ marginTop: 12, background: 'var(--red-chip)', border: '1px solid var(--red)' }}
        >
          <span style={{ fontSize: 14, color: 'var(--red)' }}>{error}</span>
        </div>
      )}
    </>
  );

  if (!loggedIn) {
    return (
      <div>
        <TopNav right="모의고사" />
        <div className="page-narrow" style={{ alignItems: 'center', textAlign: 'center' }}>
          <div className="eyebrow" style={{ justifyContent: 'center' }}>리와인드 · 모의고사</div>
          <h1 style={{ fontSize: 26 }}>로그인하면 모의고사를 풀 수 있어요</h1>
          <p className="lede">
            판단과 메모를 기록해 습관을 진단하기 때문에 로그인이 필요해요. (데모 계정: demo / demo)
          </p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────── 시작
  if (step === 'intro') {
    return (
      <div>
        <TopNav right="모의고사" />
        <div className="page-narrow">
          <div className="eyebrow">리와인드 · 모의고사</div>
          <h1 style={{ fontSize: 28, marginBottom: 8 }}>과거 시장에서 판단을 연습해요</h1>
          <p className="lede">
            차트와 그날의 뉴스만 보고 매수·매도·관망을 고르고, 왜 그렇게 판단했는지 적어보세요.
            제출하면 실제 결과가 공개됩니다.
          </p>

          {profile && (
            <div className="card" style={{ marginTop: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 10 }}>
                내 투자성향 (온보딩 결과)
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <span className="pill">{RISK_LABEL[profile.riskType] ?? profile.riskType}</span>
                <span className="pill">
                  지식 {KNOWLEDGE_LABEL[profile.knowledgeLevel] ?? profile.knowledgeLevel}
                </span>
                <span className="pill">{INFO_LABEL[profile.infoHabit] ?? profile.infoHabit}</span>
              </div>
              {profile.explanationText && (
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: 'var(--soft)' }}>
                  {profile.explanationText}
                </p>
              )}
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
              <li>제출하면 실제로 어떻게 됐는지 공개돼요</li>
              <li>끝나면 메모를 분석해 습관을 진단하고, 맞춤 문제를 드려요</li>
            </ol>
          </div>

          {banner}
          {devPanel}

          <div className="cta-row" style={{ marginTop: 20 }}>
            <button type="button" className="btn btn-primary" onClick={onStart} disabled={busy}>
              모의고사 시작하기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────── 진단 리포트
  if (step === 'report' && report) {
    return (
      <div>
        <TopNav right="진단 리포트" />
        <div className="page-narrow">
          <div className="eyebrow">모의고사 결과</div>
          <h1 style={{ fontSize: 26, marginBottom: 6 }}>
            {report.totalTurns}턴 중 {report.alignedCount}턴을 모범답안과 같게 판단했어요
          </h1>
          <p className="lede">
            아래 진단은 <strong>직접 적으신 메모</strong>에서 뽑은 거예요. 어떤 표현이 근거가 됐는지 같이 보여드릴게요.
          </p>

          {report.diagnoses.length === 0 ? (
            <div className="card" style={{ marginTop: 16 }}>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--soft)' }}>
                눈에 띄는 위험 습관이 잡히지 않았어요. 메모에 판단 근거를 구체적으로 적을수록 진단이 정확해져요.
              </p>
            </div>
          ) : (
            report.diagnoses.map((d: Diagnosis) => (
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
                    style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px 12px', marginBottom: 6 }}
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

          {banner}

          <div className="cta-row" style={{ marginTop: 20 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onGenerateQuiz}
              disabled={busy || report.diagnoses.length === 0}
            >
              맞춤 문제 풀어보기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────── 맞춤 퀴즈
  if (step === 'quiz' && quizSet) {
    return (
      <div>
        <TopNav right="맞춤 문제" />
        <div className="page-narrow">
          <div className="eyebrow">내 메모에서 만든 문제</div>
          <h1 style={{ fontSize: 26, marginBottom: 6 }}>{quizSet.headline ?? '맞춤 문제'}</h1>
          <p className="lede">문제마다 어떤 자료 몇 쪽을 근거로 만들었는지 함께 표시돼요.</p>

          {banner}

          {quizSet.questions.map((q) => (
            <div key={q.id} className="card" style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                Q{q.position + 1}
                {q.relatedTurnNo ? ` · ${q.relatedTurnNo}턴 판단에서` : ''}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.55, marginBottom: 12 }}>
                {q.question}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {q.options.map((o) => {
                  const isPicked = q.answeredOptionId === o.id;
                  const isCorrect = q.correctOptionId === o.id;
                  let bg = 'var(--white)';
                  let border = '1px solid var(--line)';
                  if (q.answered && isCorrect) {
                    bg = 'var(--green-chip)';
                    border = '2px solid var(--green)';
                  } else if (q.answered && isPicked && !isCorrect) {
                    bg = 'var(--red-chip)';
                    border = '2px solid var(--red)';
                  }
                  return (
                    <button
                      key={o.id}
                      type="button"
                      disabled={q.answered || busy}
                      onClick={() => onAnswerQuiz(q.id, o.id)}
                      style={{
                        textAlign: 'left',
                        padding: '11px 14px',
                        borderRadius: 10,
                        background: bg,
                        border,
                        fontSize: 14,
                        lineHeight: 1.5,
                        color: 'var(--ink)',
                        cursor: q.answered ? 'default' : 'pointer',
                      }}
                    >
                      {'①②③④'[o.position]} {o.label}
                    </button>
                  );
                })}
              </div>

              {q.answered && (
                <div style={{ marginTop: 12 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: q.correct ? 'var(--green)' : 'var(--red)',
                      marginBottom: 6,
                    }}
                  >
                    {q.correct ? '정답이에요' : '아쉬워요'}
                  </div>
                  {q.explanation && (
                    <p style={{ margin: '0 0 8px', fontSize: 14, lineHeight: 1.65, color: 'var(--soft)' }}>
                      {q.explanation}
                    </p>
                  )}
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
          ))}

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
  if (!turn) {
    return (
      <div>
        <TopNav right="모의고사" />
        <div className="page-narrow">
          {banner}
          {!busy && !error && <p className="lede">문제를 불러오는 중이에요…</p>}
        </div>
      </div>
    );
  }

  const revealed = step === 'result' && outcome !== null;

  return (
    <div>
      <TopNav right={`${turn.turnNo} / ${attempt?.totalTurns ?? '?'}턴`} />
      <div className="page-narrow">
        <div className="eyebrow">
          {turn.asOfDate} 시점{turn.sector ? ` · ${turn.sector}` : ''}
        </div>
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>
          {turn.stockName} <span style={{ fontSize: 18, color: 'var(--soft)' }}>{won(turn.price)}</span>
        </h1>
        {turn.holdingQty > 0 && (
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--muted)' }}>
            보유 {turn.holdingQty}주 · 평단가 {won(turn.avgBuyPrice ?? 0)}
          </p>
        )}

        <div className="card" style={{ marginTop: 12, padding: 12 }}>
          <ExamChart points={turn.chartPoints} outcomePoints={revealed ? outcome!.outcomePoints : null} />
          {!revealed && (
            <p style={{ margin: '6px 2px 0', fontSize: 12, color: 'var(--muted)' }}>
              이후 흐름은 판단을 제출하면 공개돼요.
            </p>
          )}
        </div>

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {turn.news.map((n) => {
            const style = TAG_STYLE[n.tag] ?? TAG_STYLE['뉴스'];
            return (
              <div
                key={n.title}
                className="card"
                style={{ padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start' }}
              >
                <span className="pill" style={{ background: style.bg, color: style.fg, flex: 'none' }}>
                  {n.tag}
                </span>
                <span style={{ fontSize: 14, lineHeight: 1.5 }}>{n.title}</span>
              </div>
            );
          })}
        </div>

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

        {banner}
        {devPanel}

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
                    disabled={disabled || busy}
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
              <label htmlFor="memo" style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
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
              disabled={busy || !action || memo.trim().length < MIN_MEMO}
              onClick={onSubmitTurn}
            >
              제출하고 결과 보기
            </button>
          </div>
        )}

        {revealed && outcome && (
          <div
            className="card"
            style={{
              marginTop: 14,
              border: outcome.isAligned ? '2px solid var(--green)' : '1px solid var(--line)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span
                className="pill"
                style={{
                  background: outcome.isAligned ? 'var(--green-chip)' : 'var(--red-chip)',
                  color: outcome.isAligned ? 'var(--green)' : 'var(--red)',
                }}
              >
                {outcome.isAligned ? '모범답안과 같아요' : '모범답안과 달라요'}
              </span>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                내 판단 {ACTION_LABEL[outcome.myAction]} · 모범답안 {ACTION_LABEL[outcome.idealAction]}
              </span>
            </div>

            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: outcome.outcomeChangePct >= 0 ? 'var(--red)' : '#3e6fd8',
                marginBottom: 6,
              }}
            >
              {outcome.outcomeSummary}
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.65, color: 'var(--soft)' }}>
              {outcome.idealRationale}
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
              배울 점 — {outcome.learningPoint}
            </div>

            <button
              type="button"
              className="btn btn-primary btn-block"
              style={{ marginTop: 14 }}
              onClick={onNext}
              disabled={busy}
            >
              {outcome.completed ? '진단 리포트 보기' : '다음 턴으로'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
