'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import TopNav from '../../components/TopNav';
import LoginButton from '../../components/LoginButton';
import {
  generateQuiz,
  getLatestQuiz,
  getQuizHistory,
  submitQuizAnswer,
  type PersonalizedQuizResponse,
  type QuizAnswerResponse,
  type QuizHistoryItemResponse,
} from '../../lib/quiz-api';
import { SESSION_STAT_LABELS, type SessionStatKey } from '../../lib/user-api';

declare global {
  interface Window {
    knowerbotRequireLogin?: () => void;
  }
}

// knowerbot-runtime.js는 <Script strategy="afterInteractive">라 이 컴포넌트가 먼저
// 마운트될 수 있음 — window.knowerbotRequireLogin이 아직 없으면 뜰 때까지 잠깐 재시도.
function notifyKnowerbotLoginRequired() {
  let attempts = 0;
  const tryNotify = () => {
    if (typeof window.knowerbotRequireLogin === 'function') {
      window.knowerbotRequireLogin();
      return;
    }
    attempts += 1;
    if (attempts < 20) window.setTimeout(tryNotify, 200);
  };
  tryNotify();
}

const PT_LOGIN_FEATURES = [
  { icon: '1', title: '맞춤 문제 생성', desc: '내 모의투자 스탯 중 가장 약한 지표를 골라 AI가 문제를 만들어요.' },
  { icon: '2', title: '실제 자료 근거', desc: '금감원·한국은행 등 공신력 있는 자료를 검색해서 근거로 삼아요.' },
  { icon: '3', title: '즉시 채점', desc: '풀면 바로 정답·해설을 확인할 수 있어요.' },
  { icon: '4', title: '반복 학습', desc: '풀 때마다 새 문제로, 약점을 계속 보완해나가요.' },
];

export default function PtClient() {
  const [needsLogin, setNeedsLogin] = useState(false);
  const [checkedLogin, setCheckedLogin] = useState(false);
  const [quiz, setQuiz] = useState<PersonalizedQuizResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [result, setResult] = useState<QuizAnswerResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<QuizHistoryItemResponse[] | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function refreshHistory() {
    getQuizHistory()
      .then(setHistory)
      .catch(() => {}); // 지난 퀴즈 목록은 부가 기능이라 실패해도 메인 화면엔 영향 안 줌
  }

  useEffect(() => {
    let loggedInNow = false;
    try {
      loggedInNow = localStorage.getItem('kg_logged_in') === '1';
    } catch (e) {}
    if (!loggedInNow) {
      setNeedsLogin(true);
      setCheckedLogin(true);
      notifyKnowerbotLoginRequired();
      return;
    }
    setCheckedLogin(true);
    (async () => {
      setLoading(true);
      try {
        const latest = await getLatestQuiz();
        setQuiz(latest ?? (await generateQuiz()));
      } catch (e) {
        setError(e instanceof Error ? e.message : '문제를 불러오지 못했어요');
      } finally {
        setLoading(false);
      }
    })();
    refreshHistory();
  }, []);

  async function handleNewQuiz() {
    setLoading(true);
    setError(null);
    setQuiz(null);
    setSelectedOptionId(null);
    setResult(null);
    try {
      setQuiz(await generateQuiz());
      refreshHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : '문제를 만들지 못했어요');
    } finally {
      setLoading(false);
    }
  }

  async function handleSelect(optionId: string) {
    if (!quiz || result || submitting) return;
    setSelectedOptionId(optionId);
    setSubmitting(true);
    try {
      setResult(await submitQuizAnswer(quiz.id, optionId));
      refreshHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : '채점하지 못했어요');
    } finally {
      setSubmitting(false);
    }
  }

  // 지난 퀴즈를 메인 카드로 다시 올려서 처음부터 다시 풀 수 있게 함 — 새로 고른 답은
  // handleSelect가 submitQuizAnswer로 저장하면서 이전 답을 덮어씀.
  function handleRetry(item: QuizHistoryItemResponse) {
    setError(null);
    setSelectedOptionId(null);
    setResult(null);
    setQuiz({
      id: item.id,
      targetStatKey: item.targetStatKey,
      question: item.question,
      options: item.options,
      sourceOrgName: item.sourceOrgName,
      sourceTitle: item.sourceTitle,
      sourcePageStart: item.sourcePageStart,
      sourcePageEnd: item.sourcePageEnd,
      sourceSessionId: item.sourceSessionId,
      createdAt: item.createdAt,
    });
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 현재 카드에 떠 있는 문제는 지난 퀴즈 목록에서 중복으로 보여주지 않음.
  const historyGroups = useMemo(() => {
    if (!history) return [];
    const rest = history.filter((item) => item.id !== quiz?.id);
    const byKey = new Map<SessionStatKey, QuizHistoryItemResponse[]>();
    for (const item of rest) {
      const list = byKey.get(item.targetStatKey) ?? [];
      list.push(item);
      byKey.set(item.targetStatKey, list);
    }
    return (Object.keys(SESSION_STAT_LABELS) as SessionStatKey[])
      .filter((key) => byKey.has(key))
      .map((key) => ({ key, items: byKey.get(key)! }));
  }, [history, quiz?.id]);

  if (!checkedLogin) {
    return null;
  }

  if (needsLogin) {
    return (
      <div>
        <TopNav />
        <div className="page">
          <div className="hero">
            <div className="eyebrow">
              <span className="badge">짐</span>
              로그인이 필요해요
            </div>
            <h1>로그인하고 오늘의 PT를 시작해보세요</h1>
            <p className="lede">
              내가 약한 부분을 AI가 실제 금융교육 자료로 찾아서 맞춤 문제를 만들어줘요. 계정별로
              진행 상황이 그대로 저장돼요.
            </p>
            <div className="cta-row">
              <LoginButton className="btn btn-primary">로그인</LoginButton>
            </div>
          </div>
          <div className="card-grid">
            {PT_LOGIN_FEATURES.map((f) => (
              <div className="card" key={f.title}>
                <span className="icon">{f.icon}</span>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <TopNav right="오늘의 PT" />
      <div className="page">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
          {/* 왼쪽: 지난 퀴즈 — 지표(targetStatKey)별로 섹션을 나눠서 보여줌 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>지난 퀴즈</p>
            {historyGroups.length === 0 && (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>아직 지난 퀴즈가 없어요.</p>
            )}
            {historyGroups.map(({ key, items }) => (
              <div
                key={key}
                style={{
                  background: 'var(--white)',
                  border: '1px solid var(--line)',
                  borderRadius: 14,
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
                  {SESSION_STAT_LABELS[key].label} · {items.length}문제
                </p>
                {items.map((item) => {
                  const expanded = expandedIds.has(item.id);
                  const badge = !item.answered
                    ? { text: '안 풀었어요', color: 'var(--muted)', bg: 'var(--chip)' }
                    : item.correct
                      ? { text: '정답', color: 'var(--green)', bg: 'var(--green-chip)' }
                      : { text: '오답', color: 'var(--red)', bg: 'var(--red-chip)' };
                  return (
                    <div key={item.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          onClick={() => toggleExpanded(item.id)}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            textAlign: 'left',
                            background: 'transparent',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <span
                            style={{
                              flexShrink: 0,
                              fontSize: 11,
                              fontWeight: 700,
                              color: badge.color,
                              background: badge.bg,
                              borderRadius: 999,
                              padding: '2px 8px',
                            }}
                          >
                            {badge.text}
                          </span>
                          <span
                            style={{
                              fontSize: 13,
                              color: 'var(--ink)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {item.question}
                          </span>
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ flexShrink: 0 }}
                          onClick={() => handleRetry(item)}
                        >
                          {item.answered ? '다시 풀기' : '풀기'}
                        </button>
                      </div>
                      {expanded && (
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {item.options.map((opt) => {
                            const isCorrectAnswer = item.answered && opt.id === item.correctOptionId;
                            const isPicked = item.answered && opt.id === item.answeredOptionId;
                            return (
                              <div
                                key={opt.id}
                                style={{
                                  padding: '8px 12px',
                                  borderRadius: 8,
                                  border: `1px solid ${isCorrectAnswer ? 'var(--green)' : isPicked ? 'var(--red)' : 'var(--line)'}`,
                                  background: isCorrectAnswer ? 'var(--green-chip)' : isPicked ? 'var(--red-chip)' : 'transparent',
                                  fontSize: 12,
                                  color: isCorrectAnswer ? 'var(--green)' : 'var(--ink)',
                                }}
                              >
                                {opt.label}
                                {isCorrectAnswer ? '  ✓' : ''}
                              </div>
                            );
                          })}
                          {item.answered && item.explanation && (
                            <p style={{ margin: '4px 0 0', fontSize: 12, lineHeight: 1.6, color: 'var(--soft)' }}>
                              {item.explanation}
                            </p>
                          )}
                          {item.sourceTitle && (
                            <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>
                              📚 {item.sourceOrgName ?? '출처 미상'} 「{item.sourceTitle}」
                              {item.sourcePageStart
                                ? ` ${item.sourcePageStart}${item.sourcePageStart === item.sourcePageEnd ? '' : `-${item.sourcePageEnd}`}쪽`
                                : ''}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* 오른쪽: 지금 풀 문제 — 새로 생성했든, 왼쪽에서 "다시 풀기"로 불러왔든 여기 뜸 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {loading && (
              <div className="result-card" style={{ padding: 24, textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
                  AI가 내 약점 지표를 확인하고 자료를 찾아 문제를 만드는 중이에요...
                </p>
              </div>
            )}

            {!loading && error && (
              <div className="result-card" style={{ padding: 24, textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>{error}</p>
                {error.includes('세션이 없') ? (
                  <Link href="/simulation" className="btn btn-primary" style={{ marginTop: 14, display: 'inline-block' }}>
                    모의고사 보러 가기
                  </Link>
                ) : (
                  <button className="btn btn-secondary" style={{ marginTop: 14 }} onClick={handleNewQuiz}>
                    다시 시도
                  </button>
                )}
              </div>
            )}

            {!loading && !error && quiz && (
              <>
                {/* AI's narration — mirrors the speech-bubble-above-the-robot pattern */}
                <div
                  style={{
                    background: 'var(--white)',
                    border: '1px solid var(--line)',
                    borderRadius: '18px 18px 18px 4px',
                    padding: '16px 20px',
                    boxShadow: '0 8px 24px rgba(28,32,24,0.06)',
                  }}
                >
                  <p style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.6, color: 'var(--soft)' }}>
                    최근 모의고사 기록을 보니 <b>{SESSION_STAT_LABELS[quiz.targetStatKey].label}</b> 부분을 더 연습하면 좋을 것
                    같아요.
                  </p>
                  {quiz.sourceTitle && (
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
                      📚 {quiz.sourceOrgName ?? '출처 미상'} 「{quiz.sourceTitle}」
                      {quiz.sourcePageStart
                        ? ` ${quiz.sourcePageStart}${quiz.sourcePageStart === quiz.sourcePageEnd ? '' : `-${quiz.sourcePageEnd}`}쪽`
                        : ''}
                    </p>
                  )}
                </div>

                <div
                  data-knower-seat=""
                  style={{
                    background: 'var(--white)',
                    border: '1px solid var(--line)',
                    borderRadius: 18,
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>퀴즈</p>
                    <strong style={{ fontSize: 15 }}>{quiz.question}</strong>
                    {quiz.options.map((opt) => {
                      const isSelected = opt.id === selectedOptionId;
                      const isCorrectAnswer = !!result && opt.id === result.correctOptionId;
                      const showState = !!result;
                      const borderColor = !showState ? 'var(--line)' : isCorrectAnswer ? 'var(--green)' : isSelected ? 'var(--red)' : 'var(--line)';
                      const bgColor = !showState ? 'var(--white)' : isCorrectAnswer ? 'var(--green-chip)' : isSelected ? 'var(--red-chip)' : 'var(--white)';
                      return (
                        <button
                          key={opt.id}
                          onClick={() => handleSelect(opt.id)}
                          disabled={!!result || submitting}
                          style={{
                            textAlign: 'left',
                            padding: '10px 14px',
                            borderRadius: 10,
                            border: `1px solid ${borderColor}`,
                            background: bgColor,
                            color: showState && isCorrectAnswer ? 'var(--green)' : 'var(--ink)',
                            fontWeight: showState && isCorrectAnswer ? 800 : 600,
                            fontSize: 13,
                            cursor: result ? 'default' : 'pointer',
                          }}
                        >
                          {opt.label}
                          {showState && isCorrectAnswer ? '  ✓' : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {result && (
                  <div
                    style={{
                      background: result.correct ? 'var(--green)' : 'var(--red)',
                      color: 'white',
                      borderRadius: 14,
                      padding: 16,
                      fontSize: 13,
                      lineHeight: 1.6,
                    }}
                  >
                    {result.correct ? '정답이에요! ' : '아쉬워요, 오답이에요. '}
                    {result.explanation}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={handleNewQuiz}>
                    새 문제 만들기
                  </button>
                  <Link href="/my" className="btn btn-primary" style={{ flex: 1, textAlign: 'center' }} data-knower-swing-seat="">
                    학습 완료하고 리포트 보기
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
