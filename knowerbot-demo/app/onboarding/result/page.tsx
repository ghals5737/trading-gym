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
