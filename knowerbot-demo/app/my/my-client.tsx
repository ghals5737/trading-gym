'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import TopNav from '../../components/TopNav';
import { aiCharacter, user } from '../../lib/mock-data';
import { listSessions } from '../../lib/simulation-api';
import { getSessionReport, type SessionReportResponse, type SessionStatKey, type StatTone } from '../../lib/report-api';
import { getMyInvestorProfile, type InvestorProfileResponse } from '../../lib/onboarding-api';
import { RISK_COPY, KNOWLEDGE_COPY, INFO_HABIT_COPY, headlineFor, warningFor, courseFor } from '../../lib/onboarding-copy';

const toneColor = { red: 'var(--red)', amber: 'var(--amber)', green: 'var(--green)' } as const;
const toneKey = (tone: StatTone) => tone.toLowerCase() as keyof typeof toneColor;
const toneLabel: Record<StatTone, string> = { GREEN: '좋아요', AMBER: '중간', RED: '주의 필요' };

const METRIC_LABELS: Partial<Record<SessionStatKey, string>> = {
  JUDGMENT_ACCURACY: '판단 정확도',
  DISCLOSURE_CHECK_RATE: '공시 확인율',
  RISK_MANAGEMENT_SCORE: '리스크 관리',
};
const HABIT_LABELS: Partial<Record<SessionStatKey, string>> = {
  IMPULSIVE_TRADING: '충동매매 억제',
  LOSS_AVERSION: '손절 원칙 준수',
  CONFIRMATION_BIAS: '확증편향 억제',
  DIVERSIFICATION: '분산투자',
};

export default function MyClient() {
  const [tab, setTab] = useState<'profile' | 'report' | 'diagnosis'>('report');

  return (
    <div>
      <TopNav right="체력 측정 · 스파링 시즌 1 · 리와인드 24회" />
      <div className="page-narrow">
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          {(
            [
              ['profile', '사용자 정보'],
              ['report', '나의 리포트'],
              ['diagnosis', '투자 성향 진단'],
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

        {tab === 'profile' ? <ProfileTab /> : tab === 'report' ? <ReportTab /> : <DiagnosisTab />}
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

function ReportTab() {
  const [report, setReport] = useState<SessionReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const sessions = await listSessions();
        const latest = sessions[0];
        if (!latest) {
          setLoading(false);
          return;
        }
        const r = await getSessionReport(latest.id);
        setReport(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : '리포트를 불러오지 못했어요');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <p style={{ fontSize: 13, color: 'var(--muted)' }}>불러오는 중...</p>;
  }

  if (!report) {
    return (
      <div className="result-card" style={{ padding: 24, textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          {error ?? '아직 모의투자 기록이 없어요. 스파링을 한 번 해보면 리포트가 만들어져요.'}
        </p>
      </div>
    );
  }

  const statByKey = new Map(report.stats.map((s) => [s.statKey, s]));
  const metrics = (Object.keys(METRIC_LABELS) as SessionStatKey[])
    .map((key) => ({ key, label: METRIC_LABELS[key]!, stat: statByKey.get(key) }))
    .filter((m) => m.stat);
  const habits = (Object.keys(HABIT_LABELS) as SessionStatKey[])
    .map((key) => ({ key, label: HABIT_LABELS[key]!, stat: statByKey.get(key) }))
    .filter((h) => h.stat);
  const gamblingStat = statByKey.get('GAMBLING_SIGNAL');

  const avgScore = report.stats.length
    ? Math.round(report.stats.reduce((sum, s) => sum + s.scorePct, 0) / report.stats.length)
    : 0;
  const tierName = avgScore >= 70 ? '탄탄한 투자자' : avgScore >= 40 ? '성장하는 투자자' : '습관 점검이 필요해요';

  return (
    <>
      <div className="tier-card">
        <span className="tier-label">나의 투자 습관 리포트</span>
        <span className="tier-name">{tierName}</span>
        <p className="tier-desc">
          {report.diagnosisComparison ?? '사전 조사(온보딩)를 하면 실제 매매 패턴과 비교한 진단도 볼 수 있어요.'}
        </p>
        <div className="tier-metric-row">
          {metrics.map((m) => (
            <div className="tier-metric" key={m.key}>
              <strong>{m.stat!.scorePct}%</strong>
              <span>{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: 'var(--white)', border: '1px solid var(--line)', borderRadius: 16, padding: 20 }}>
        <h3 style={{ fontSize: 15, margin: '0 0 14px' }}>투자 습관 진단</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {habits.map((h) => (
            <div key={h.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{h.label}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: toneColor[toneKey(h.stat!.tone)] }}>
                  {toneLabel[h.stat!.tone]}
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: 'var(--chip)' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${h.stat!.scorePct}%`,
                    borderRadius: 999,
                    background: toneColor[toneKey(h.stat!.tone)],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <p style={{ margin: '14px 0 0', fontSize: 12, color: 'var(--muted)' }}>
          이번 세션의 매매 빈도, 빌린 돈 비율, 종목 쏠림, 공시 확인 여부를 바탕으로 계산했어요.
        </p>
      </div>

      {gamblingStat && (
        <div
          style={{
            background: toneKey(gamblingStat.tone) === 'red' ? 'var(--red-chip)' : 'var(--green-chip)',
            borderRadius: 12,
            padding: '16px 18px',
          }}
        >
          <strong style={{ display: 'block', fontSize: 14, color: toneColor[toneKey(gamblingStat.tone)] }}>
            도박성 매매 신호 — {toneLabel[gamblingStat.tone]} ({gamblingStat.scorePct}점)
          </strong>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--soft)', lineHeight: 1.6 }}>
            {gamblingStat.note ??
              '손실 후 베팅을 키우는 패턴이 반복되면 경고와 함께 한국도박문제예방치유원 등 공식 상담 기관을 안내해 드려요.'}
          </p>
        </div>
      )}
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

      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
        {new Date(profile.createdAt).toLocaleDateString('ko-KR')}에 진단한 결과예요.
      </p>
    </>
  );
}
