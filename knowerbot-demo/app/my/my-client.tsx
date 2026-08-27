'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import TopNav from '../../components/TopNav';
import LoginButton from '../../components/LoginButton';
import { aiCharacter, user } from '../../lib/mock-data';
import { getMyInvestorProfile, type InvestorProfileResponse } from '../../lib/onboarding-api';
import { RISK_COPY, KNOWLEDGE_COPY, INFO_HABIT_COPY, headlineFor, warningFor, courseFor } from '../../lib/onboarding-copy';
import {
  getMyStatOverview,
  getMyAgeBand,
  updateMyAgeBand,
  getMyPeerComparison,
  SESSION_STAT_LABELS,
  AGE_BAND_LABELS,
  type StatOverviewResponse,
  type SessionStatKey,
  type AgeBand,
  type PeerComparisonResponse,
} from '../../lib/user-api';
import { getSessionHistory, type SessionHistoryItemResponse } from '../../lib/simulation-api';

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

// 로그인 안 한 상태로 /my에 왔을 때 보여주는 소개 카드 4개 — 랜딩 페이지의 features
// 카드 그리드와 같은 스타일(.card-grid/.card)을 재사용해서 빈 화면 대신 이 페이지에서
// 로그인하면 뭘 볼 수 있는지 미리 보여줌.
const MY_PAGE_LOGIN_FEATURES = [
  { icon: '1', title: '투자 성향 진단', desc: '사전 조사로 진단한 리스크 성향·투자 지식·정보 습관 결과를 확인해요.' },
  { icon: '2', title: 'AI 채점 히스토리', desc: '세션이 끝날 때마다 AI가 채점한 8개 지표가 쌓여서 성장 추이를 볼 수 있어요.' },
  { icon: '3', title: '나의 AI 캐릭터', desc: '모의투자·학습으로 쌓은 경험치로 캐릭터가 레벨업해요.' },
  { icon: '4', title: '계정 정보', desc: '닉네임·이메일 같은 계정 정보와 설정을 한곳에서 관리해요.' },
];

export default function MyClient() {
  const [tab, setTab] = useState<'profile' | 'diagnosis' | 'stats'>('diagnosis');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [checkedLogin, setCheckedLogin] = useState(false);

  useEffect(() => {
    // knowerbot-runtime.js가 아직 안 떠서 document.body 클래스가 안 붙어있어도 이건
    // 항상 바로 읽을 수 있음 — 로그인 안 한 상태로 API 호출들이 401→강제 리다이렉트로
    // 새는 걸 미리 막음(simulation-client.tsx와 같은 원칙).
    let loggedInNow = false;
    try {
      loggedInNow = localStorage.getItem('kg_logged_in') === '1';
    } catch (e) {}
    if (!loggedInNow) {
      setNeedsLogin(true);
      notifyKnowerbotLoginRequired();
    }
    setCheckedLogin(true);
  }, []);

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
            <h1>로그인하고 마이 페이지를 확인해보세요</h1>
            <p className="lede">
              투자 성향 진단 결과, 세션별 AI 채점 기록, 나의 캐릭터 성장 현황까지 — 전부 계정별로
              저장돼요.
            </p>
            <div className="cta-row">
              <LoginButton className="btn btn-primary">로그인</LoginButton>
            </div>
          </div>
          <div className="card-grid">
            {MY_PAGE_LOGIN_FEATURES.map((f) => (
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
      <TopNav right="체력 측정 · 모의고사 기록" />
      <div className="page-narrow">
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          {(
            [
              ['profile', '사용자 정보'],
              ['diagnosis', '사전조사 결과'],
              ['stats', '스탯'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: '8px 16px',
                borderRadius: 999,
                border: `1px solid ${tab === key ? 'transparent' : 'var(--line)'}`,
                background: tab === key ? 'var(--green-chip)' : 'var(--white)',
                color: tab === key ? 'var(--green)' : 'var(--soft)',
                fontWeight: tab === key ? 800 : 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'profile' ? <ProfileTab /> : tab === 'diagnosis' ? <DiagnosisTab /> : <StatsTab />}
      </div>
    </div>
  );
}

function ProfileTab() {
  return (
    <>
      <div
        style={{
          display: 'flex',
          gap: 18,
          alignItems: 'center',
          background: 'var(--white)',
          border: '1px solid var(--line)',
          borderRadius: 16,
          padding: 22,
        }}
      >
        <span
          style={{
            width: 56,
            height: 56,
            borderRadius: 999,
            background: 'var(--green-chip)',
            color: 'var(--green)',
            display: 'grid',
            placeItems: 'center',
            fontSize: 18,
            fontWeight: 800,
          }}
        >
          {user.nickname[0]}
        </span>
        <div style={{ flex: 1 }}>
          <strong style={{ display: 'block', fontSize: 17 }}>{user.nickname}</strong>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {user.email} · {user.joinedAt}
          </span>
        </div>
        <button className="btn btn-secondary btn-sm">정보 수정</button>
      </div>

      <div className="tier-card">
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ fontSize: 44 }} aria-hidden>
            🤖
          </span>
          <div style={{ flex: 1 }}>
            <span className="tier-label">나의 AI 캐릭터</span>
            <div className="tier-name">
              {aiCharacter.name} · Lv.{aiCharacter.level}
            </div>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)' }}>{aiCharacter.tier}</span>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
          <span>다음 레벨까지</span>
          <span>
            {aiCharacter.xp} / {aiCharacter.xpToNext} XP
          </span>
        </div>
        <div className="xp-track">
          <div className="xp-fill" style={{ width: `${(aiCharacter.xp / aiCharacter.xpToNext) * 100}%` }} />
        </div>
        <div className="tier-metric-row">
          {aiCharacter.xpSources.map((s) => (
            <div className="tier-metric" key={s.label}>
              <strong>{s.value}</strong>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <h3 style={{ fontSize: 15, margin: 0 }}>계정 설정</h3>
      <div style={{ background: 'var(--white)', border: '1px solid var(--line)', borderRadius: 14 }}>
        {['알림 설정', '비밀번호 변경', '구독 및 결제'].map((item, i, arr) => (
          <div
            key={item}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 18px',
              borderBottom: i < arr.length - 1 ? '1px solid var(--line)' : 'none',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600 }}>{item}</span>
            <span style={{ color: 'var(--muted)' }}>›</span>
          </div>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', textAlign: 'right' }}>
        로그아웃은 상단 메뉴에서 할 수 있어요.
      </p>
    </>
  );
}

function DiagnosisTab() {
  const [profile, setProfile] = useState<InvestorProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await getMyInvestorProfile();
        setProfile(p);
      } catch (e) {
        setError(e instanceof Error ? e.message : '진단 결과를 불러오지 못했어요');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <p style={{ fontSize: 13, color: 'var(--muted)' }}>불러오는 중...</p>;
  }

  if (!profile) {
    return (
      <div className="result-card" style={{ padding: 24, textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          {error ?? '아직 사전 조사를 안 했어요. KnowerBot을 불러서 몇 가지 질문에 먼저 답해주세요.'}
        </p>
        <Link href="/onboarding" className="btn btn-primary" style={{ marginTop: 14, display: 'inline-block' }}>
          사전 조사 하러가기
        </Link>
      </div>
    );
  }

  const risk = RISK_COPY[profile.profileType];
  const knowledge = KNOWLEDGE_COPY[profile.knowledgeLevel];
  const infoHabit = INFO_HABIT_COPY[profile.infoHabitLevel];
  const { course, courseDetail } = courseFor(profile.profileType, profile.knowledgeLevel);
  const warning = warningFor(profile.profileType, profile.knowledgeLevel, profile.infoHabitLevel);

  return (
    <>
      <div className="summary-card" style={{ width: '100%', textAlign: 'left' }}>
        <div>
          <span className="result-tag">사전 조사 결과</span>
          <h3>{headlineFor(profile.profileType, profile.knowledgeLevel)}</h3>
          <p>{profile.explanationText}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          <div className="summary-score" style={{ fontSize: 16 }}>
            리스크 {profile.riskTotalScore}/20
          </div>
          <div className="summary-score" style={{ fontSize: 16 }}>
            지식 {profile.knowledgeTotalScore}/12
          </div>
          <div className="summary-score" style={{ fontSize: 16 }}>
            정보습관 {profile.infoHabitTotalScore}/8
          </div>
        </div>
      </div>

      <InitialCategoryCards scores={profile.initialCategoryScores} />

      <PeerComparisonCard />

      {warning && (
        <div
          style={{
            width: '100%',
            textAlign: 'left',
            padding: '14px 18px',
            borderRadius: 12,
            background: 'var(--red-chip)',
            color: 'var(--red)',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          ⚠ {warning}
        </div>
      )}

      <div className="result-grid" style={{ width: '100%', textAlign: 'left', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        <div className="result-card">
          <span className="result-tag">리스크 성향</span>
          <h3>{risk.label}</h3>
          <p>{risk.detail}</p>
        </div>
        <div className="result-card">
          <span className="result-tag">투자 지식</span>
          <h3>{knowledge.label}</h3>
          <p>{knowledge.detail}</p>
        </div>
        <div className="result-card">
          <span className="result-tag">정보 습관</span>
          <h3>{infoHabit.label}</h3>
          <p>{infoHabit.detail}</p>
        </div>
        <div className="result-card">
          <span className="result-tag">추천</span>
          <h3>{course}</h3>
          <p>{courseDetail}</p>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
          {new Date(profile.createdAt).toLocaleDateString('ko-KR')}에 진단한 결과예요.
        </p>
        <Link href="/onboarding?retake=1" className="btn btn-secondary btn-sm">
          다시 진단받기
        </Link>
      </div>
    </>
  );
}

// "내 또래 대비 투자성향" — 나이대를 아직 안 알려줬으면 선택 UI를 먼저 보여주고,
// 선택하는 즉시 또래 비교 문구로 바뀐다. 또래 데이터가 없으면 안내 문구만 나온다.
function PeerComparisonCard() {
  const [ageBand, setAgeBand] = useState<AgeBand | null>(null);
  const [asked, setAsked] = useState(false); // age-band 조회가 끝났는지
  const [comparison, setComparison] = useState<PeerComparisonResponse | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { ageBand: band } = await getMyAgeBand();
        setAgeBand(band);
        if (band) setComparison(await getMyPeerComparison());
      } catch (e) {
        // 비교 실패는 치명적이지 않음 — 섹션만 조용히 비움
      } finally {
        setAsked(true);
      }
    })();
  }, []);

  async function chooseAgeBand(band: AgeBand) {
    setSaving(true);
    try {
      await updateMyAgeBand(band);
      setAgeBand(band);
      setComparison(await getMyPeerComparison());
    } catch (e) {
      // 저장 실패 시 선택 UI 유지
    } finally {
      setSaving(false);
    }
  }

  if (!asked) return null;

  if (!ageBand) {
    return (
      <div className="result-card" style={{ width: '100%', textAlign: 'left', padding: 18 }}>
        <span className="result-tag">또래 비교</span>
        <p style={{ margin: '8px 0 10px', fontSize: 13, color: 'var(--soft)' }}>
          나이대를 알려주시면 같은 또래 사용자들과 투자성향을 비교해드려요.
        </p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(Object.keys(AGE_BAND_LABELS) as AgeBand[]).map((band) => (
            <button
              key={band}
              onClick={() => chooseAgeBand(band)}
              disabled={saving}
              className="btn btn-secondary btn-sm"
            >
              {AGE_BAND_LABELS[band]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!comparison) return null;

  const diff = comparison.myRiskScore - comparison.peerAvgRiskScore;
  return (
    <div className="result-card" style={{ width: '100%', textAlign: 'left', padding: 18 }}>
      <span className="result-tag">또래 비교 · {AGE_BAND_LABELS[comparison.ageBand]}</span>
      <h3 style={{ margin: '8px 0 6px', fontSize: 15 }}>{comparison.comparisonText}</h3>
      {comparison.peerCount > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
          내 공격성(리스크 감수) 점수 {comparison.myRiskScore}점 · 또래 평균{' '}
          {comparison.peerAvgRiskScore.toFixed(1)}점 ({diff >= 0 ? '+' : ''}
          {diff.toFixed(1)}) · 비교 대상 {comparison.peerCount}명
        </p>
      )}
    </div>
  );
}

const STAT_KEYS = Object.keys(SESSION_STAT_LABELS) as SessionStatKey[];

// 모의투자 세션을 마칠 때마다 AI가 채점해 쌓이는 8개 지표 — 사전조사 결과(진단 탭)와
// 다르게 세션이 없으면 보여줄 게 없어서(mock 폴백 없음), 빈 상태를 그대로 안내함.
function StatsTab() {
  const [overview, setOverview] = useState<StatOverviewResponse | null>(null);
  const [history, setHistory] = useState<SessionHistoryItemResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 3개 대분류(정확성/침착성/공격성) + 세부 8개 지표를 한 번에 — 모의고사·퀴즈 결과 합산 평균.
    getMyStatOverview()
      .then(setOverview)
      .catch((e) => setError(e instanceof Error ? e.message : '스탯을 불러오지 못했어요'))
      .finally(() => setLoading(false));
    // 모의고사 기록(세션별) — 실패해도 평균 스탯은 그대로 보여줌.
    getSessionHistory().then(setHistory).catch(() => setHistory([]));
  }, []);

  const stats = overview?.stats ?? null;

  if (loading) {
    return <p style={{ fontSize: 13, color: 'var(--muted)' }}>불러오는 중...</p>;
  }

  if (error || !stats || stats.length === 0) {
    return (
      <div className="result-card" style={{ padding: 24, textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          {error ?? '아직 완료된 모의고사가 없어요. 모의고사를 한 번 끝내면 여기에 AI 채점 결과가 쌓여요.'}
        </p>
        <Link href="/simulation" className="btn btn-primary" style={{ marginTop: 14, display: 'inline-block' }}>
          모의고사 보러 가기
        </Link>
      </div>
    );
  }

  const sessionCount = Math.max(...stats.map((s) => s.sessionCount));
  const quizCount = stats.reduce((sum, s) => sum + s.quizCount, 0);

  return (
    <>
      {overview && (
        // "투자성향 간단 요약" — 카테고리 점수 기반 한 줄 (백엔드 규칙 생성).
        <div className="summary-card" style={{ width: '100%', textAlign: 'left' }}>
          <div>
            <span className="result-tag">내 투자 습관 요약</span>
            <p style={{ margin: '8px 0 0', fontSize: 14, fontWeight: 700, lineHeight: 1.6 }}>{overview.summaryText}</p>
          </div>
        </div>
      )}

      {overview && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, width: '100%' }}>
          {overview.categories.map((cat) => {
            // 정확성·침착성은 높을수록 좋음(초록↔빨강), 공격성은 좋고 나쁨이 아닌 성향(중립색).
            const tone = cat.higherIsBetter
              ? cat.scorePct >= 70
                ? 'var(--green)'
                : cat.scorePct < 40
                ? 'var(--red)'
                : 'var(--amber)'
              : 'var(--soft)';
            return (
              <div key={cat.category} className="result-card" style={{ padding: 18, textAlign: 'left' }}>
                <span className="result-tag">{cat.label}</span>
                <h3 style={{ margin: '8px 0 4px', fontSize: 26, color: tone }}>{cat.scorePct}점</h3>
                <div style={{ height: 6, borderRadius: 999, background: 'var(--chip)', overflow: 'hidden', margin: '4px 0 8px' }}>
                  <div style={{ width: `${cat.scorePct}%`, height: '100%', borderRadius: 999, background: tone }} />
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.55 }}>{cat.description}</p>
              </div>
            );
          })}
        </div>
      )}

      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
        완료한 모의고사 {sessionCount}회{quizCount > 0 ? ` · 푼 퀴즈 ${quizCount}개` : ''}의 결과를 합쳐 지표별 평균을 냈어요. 더 진행하면 계속
        업데이트돼요.
      </p>
      <div className="result-grid" style={{ width: '100%', textAlign: 'left', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        {STAT_KEYS.map((key) => {
          const { label, suffix, desc } = SESSION_STAT_LABELS[key];
          const stat = stats.find((s) => s.statKey === key);
          return (
            <div className="result-card" key={key}>
              <span className="result-tag">{label}</span>
              <h3>{stat ? `${stat.avgScorePct}${suffix}` : '-'}</h3>
              <p>{desc}</p>
              {stat && (
                <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted)' }}>
                  모의고사 {stat.sessionCount}회{stat.quizCount > 0 ? ` · 퀴즈 ${stat.quizCount}개` : ''} 기준
                </p>
              )}
              {stat?.latestNote && (
                // AI가 채점하며 남긴 판단근거 — 점수만으로는 왜 이 점수인지 알 수 없어서 근거를 같이 보여줌.
                <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.55 }}>
                  근거: {stat.latestNote}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {history.length > 0 && (
        <>
          <h3 style={{ fontSize: 15, margin: '18px 0 0' }}>모의고사 기록</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
            모의고사 한 회가 끝날 때마다 AI가 매매 기록과 판단 메모 전체를 읽고 채점한 결과예요.
          </p>
          {history.map((h) => {
            const isGain = h.returnPct >= 0;
            return (
              <div key={h.sessionId} className="result-card" style={{ width: '100%', textAlign: 'left', padding: 18 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 14 }}>
                    {h.startTurnDate} ~ {h.lastTurnDate}
                  </strong>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{h.turnCount}턴 진행</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: isGain ? 'var(--red)' : 'var(--green)' }}>
                    {isGain ? '+' : ''}
                    {Number(h.returnPct).toFixed(1)}%
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {Math.round(h.startingCash).toLocaleString()}원 → {Math.round(h.finalPortfolioValue).toLocaleString()}원
                  </span>
                </div>
                {h.stats.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                    {h.stats.map((stat) => (
                      <span
                        key={stat.statKey}
                        title={stat.note}
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '4px 9px',
                          borderRadius: 999,
                          background:
                            stat.scorePct >= 70 ? 'var(--green-chip)' : stat.scorePct < 40 ? 'var(--red-chip)' : 'var(--chip)',
                          color: stat.scorePct >= 70 ? 'var(--green)' : stat.scorePct < 40 ? 'var(--red)' : 'var(--soft)',
                        }}
                      >
                        {SESSION_STAT_LABELS[stat.statKey]?.label ?? stat.statKey} {stat.scorePct}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </>
  );
}

// 설문 기반 정확성/침착성/공격성 초기 스탯 카드 — 마이페이지 스탯 탭(행동 기반)과 같은
// 3분류 언어를 사전조사 결과에서도 미리 보여줌. 공격성은 좋고 나쁨이 아니라 성향이라 중립색.
function InitialCategoryCards({ scores }: { scores: InvestorProfileResponse['initialCategoryScores'] }) {
  if (!scores || scores.length === 0) return null;
  return (
    <div style={{ width: '100%', textAlign: 'left' }}>
      <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: 'var(--soft)' }}>
        설문으로 추정한 초기 스탯 — 모의고사를 진행하면 실제 행동 기반으로 업데이트돼요
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        {scores.map((cat) => {
          const tone = cat.higherIsBetter
            ? cat.scorePct >= 70
              ? 'var(--green)'
              : cat.scorePct < 40
              ? 'var(--red)'
              : 'var(--amber)'
            : 'var(--soft)';
          return (
            <div key={cat.category} className="result-card" style={{ padding: 16 }}>
              <span className="result-tag">{cat.label}</span>
              <h3 style={{ margin: '6px 0 4px', fontSize: 24, color: tone }}>{cat.scorePct}점</h3>
              <div style={{ height: 6, borderRadius: 999, background: 'var(--chip)', overflow: 'hidden', margin: '4px 0 8px' }}>
                <div style={{ width: `${cat.scorePct}%`, height: '100%', borderRadius: 999, background: tone }} />
              </div>
              <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.55 }}>{cat.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
