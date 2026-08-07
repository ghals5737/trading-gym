'use client';

import { useState } from 'react';
import TopNav from '../../components/TopNav';
import { report, aiCharacter, user } from '../../lib/mock-data';

const toneColor = { red: 'var(--red)', amber: 'var(--amber)', green: 'var(--green)' } as const;

export default function MyClient() {
  const [tab, setTab] = useState<'profile' | 'report'>('report');

  return (
    <div>
      <TopNav right="체력 측정 · 스파링 시즌 1 · 리와인드 24회" />
      <div className="page-narrow">
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          {(
            [
              ['profile', '사용자 정보'],
              ['report', '나의 리포트'],
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

        {tab === 'profile' ? <ProfileTab /> : <ReportTab />}
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
  return (
    <>
      <div className="tier-card">
        <span className="tier-label">나의 투자 체급</span>
        <span className="tier-name">{report.tier}</span>
        <p className="tier-desc">{report.summary}</p>
        <div className="tier-metric-row">
          {report.metrics.map((m) => (
            <div className="tier-metric" key={m.label}>
              <strong>{m.value}</strong>
              <span>{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      <h3 style={{ fontSize: 15, margin: 0 }}>지난주보다 이만큼 자랐어요 🌱</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {report.growth.map((g) => (
          <div key={g.label} className="result-card" style={{ minHeight: 0, padding: 16 }}>
            <small style={{ display: 'block', fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
              {g.label}
            </small>
            <strong style={{ fontSize: 15, color: 'var(--green)' }}>
              {g.before} → {g.after}
            </strong>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--white)', border: '1px solid var(--line)', borderRadius: 16, padding: 20 }}>
        <h3 style={{ fontSize: 15, margin: '0 0 14px' }}>투자 습관 진단</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {report.habits.map((h) => (
            <div key={h.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{h.label}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: toneColor[h.tone] }}>{h.level}</span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: 'var(--chip)' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${h.pct}%`,
                    borderRadius: 999,
                    background: toneColor[h.tone],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <p style={{ margin: '14px 0 0', fontSize: 12, color: 'var(--muted)' }}>{report.habitsNote}</p>
      </div>

      <div style={{ background: 'var(--green-chip)', borderRadius: 12, padding: '16px 18px' }}>
        <strong style={{ display: 'block', fontSize: 14, color: 'var(--green)' }}>
          도박성 매매 신호 — {report.gamblingSignal.level}
        </strong>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#266b52', lineHeight: 1.6 }}>
          {report.gamblingSignal.note}
        </p>
      </div>
    </>
  );
}
