'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import TopNav from '../../components/TopNav';
import LoginButton from '../../components/LoginButton';
import { aiCharacter, user } from '../../lib/mock-data';
import { getMyInvestorProfile, type InvestorProfileResponse } from '../../lib/onboarding-api';
import { RISK_COPY, KNOWLEDGE_COPY, INFO_HABIT_COPY, headlineFor, warningFor, courseFor } from '../../lib/onboarding-copy';
import { getMyAggregateStats, SESSION_STAT_LABELS, type AggregateStatResponse, type SessionStatKey } from '../../lib/user-api';

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
      <TopNav right="체력 측정 · 스파링 시즌 1 · 리와인드 24회" />
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

const STAT_KEYS = Object.keys(SESSION_STAT_LABELS) as SessionStatKey[];

// 모의투자 세션을 마칠 때마다 AI가 채점해 쌓이는 8개 지표 — 사전조사 결과(진단 탭)와
// 다르게 세션이 없으면 보여줄 게 없어서(mock 폴백 없음), 빈 상태를 그대로 안내함.
function StatsTab() {
  const [stats, setStats] = useState<AggregateStatResponse[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyAggregateStats()
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : '스탯을 불러오지 못했어요'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p style={{ fontSize: 13, color: 'var(--muted)' }}>불러오는 중...</p>;
  }

  if (error || !stats || stats.length === 0) {
    return (
      <div className="result-card" style={{ padding: 24, textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          {error ?? '아직 완료된 모의투자 세션이 없어요. 스파링을 한 번 끝내면 여기에 AI 채점 결과가 쌓여요.'}
        </p>
        <Link href="/simulation" className="btn btn-primary" style={{ marginTop: 14, display: 'inline-block' }}>
          스파링 시작하러 가기
        </Link>
      </div>
    );
  }

  const sessionCount = Math.max(...stats.map((s) => s.sessionCount));

  return (
    <>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
        완료한 세션 {sessionCount}개를 기준으로 지표별 평균을 냈어요. 세션을 더 진행하면 계속 업데이트돼요.
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
            </div>
          );
        })}
      </div>
    </>
  );
}
