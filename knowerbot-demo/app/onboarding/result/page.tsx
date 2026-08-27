'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getMyInvestorProfile, type InvestorProfileResponse } from '../../../lib/onboarding-api';
import { RISK_COPY, KNOWLEDGE_COPY, INFO_HABIT_COPY, headlineFor, warningFor, courseFor } from '../../../lib/onboarding-copy';

export default function OnboardingResultPage() {
  const [profile, setProfile] = useState<InvestorProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await getMyInvestorProfile();
        setProfile(p);
      } catch (e) {
        setError(e instanceof Error ? e.message : '결과를 불러오지 못했어요');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="page">불러오는 중...</div>;
  }

  if (!profile) {
    return (
      <div className="page-narrow" style={{ alignItems: 'center', textAlign: 'center' }}>
        <h1 style={{ fontSize: 30 }}>아직 사전 조사를 안 했어요</h1>
        <p className="lede">{error ?? 'KnowerBot을 불러서 몇 가지 질문에 먼저 답해주세요.'}</p>
        <Link href="/onboarding" className="btn btn-primary">
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
    <div className="page-narrow" style={{ alignItems: 'center', textAlign: 'center' }}>
      <div className="eyebrow" style={{ justifyContent: 'center' }}>
        <span className="badge">짐</span>
        사전 조사 결과
      </div>
      <h1 style={{ fontSize: 38 }}>맞춤 연습 코스가 준비됐어요</h1>
      <p className="lede">대화 내용을 바탕으로 첫 모의투자 훈련 방향을 정리했습니다.</p>

      <div className="summary-card" style={{ width: '100%', textAlign: 'left' }}>
        <div>
          <span className="result-tag">요약</span>
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

      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <Link href="/simulation" className="btn btn-primary">
          모의투자 하러가기
        </Link>
        <Link href="/library" className="btn btn-secondary">
          맞춤 교육 받으러가기
        </Link>
      </div>
    </div>
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
