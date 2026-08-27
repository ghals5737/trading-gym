'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import TopNav from '../../components/TopNav';
import { report, user } from '../../lib/mock-data';
import {
  getMyAggregateStatCategories,
  SESSION_STAT_CATEGORY_LABELS,
  type AggregateStatCategoryResponse,
  type SessionStatCategory,
} from '../../lib/user-api';

// tier-card의 3개 지표 자리 = 정확성/침착성/공격성 그대로.
const TIER_CATEGORY_KEYS: SessionStatCategory[] = ['ACCURACY', 'COMPOSURE', 'AGGRESSIVENESS'];

const TIER_STAGES = ['새싹', '성장', '숙련', '고수', '마스터'];

// "체급"(예: "성장 2단계 · 관찰형") = 단계(종합 점수 + 세션 수 상한) + 유형(가장 약한 축)
// 조합 — 세션이 하나도 없으면(신규 계정) mock 문구로 대체(report.tier, 빈 화면보다 예시가 나음).
// 종합 점수는 공격성을 (100-공격성)으로 뒤집어서(낮을수록 좋은 지표라) 셋 다 "높을수록
// 좋다" 방향으로 맞춘 뒤 평균 냄 — SessionStatCategoryMapper의 역전 규칙과 같은 이유.
function computeTier(stats: AggregateStatCategoryResponse[] | null, sessionCount: number): string {
  if (!stats || stats.length === 0 || sessionCount === 0) return report.tier;
  const acc = stats.find((s) => s.categoryKey === 'ACCURACY')?.avgScorePct ?? 50;
  const comp = stats.find((s) => s.categoryKey === 'COMPOSURE')?.avgScorePct ?? 50;
  const stability = 100 - (stats.find((s) => s.categoryKey === 'AGGRESSIVENESS')?.avgScorePct ?? 50);
  const overall = (acc + comp + stability) / 3;

  // 점수만으로 정하면 세션 1번에 운 좋게 잘하면 바로 "고수"가 되는 게 이상해서 — 완료한
  // 세션 수로 올라갈 수 있는 단계 상한을 따로 걸고, 점수 기준 단계와 상한 중 낮은 쪽을 씀.
  const scoreStageIndex = overall >= 90 ? 4 : overall >= 75 ? 3 : overall >= 60 ? 2 : overall >= 40 ? 1 : 0;
  const sessionCap = sessionCount <= 1 ? 0 : sessionCount <= 3 ? 1 : sessionCount <= 6 ? 2 : sessionCount <= 10 ? 3 : 4;
  const stageName = TIER_STAGES[Math.min(scoreStageIndex, sessionCap)];
  // 같은 단계 안의 세부 단계(1~3)도 세션 수로 매김 — 세션을 더 진행할수록 올라감.
  const subStage = Math.min(3, Math.max(1, Math.ceil(sessionCount / 2)));

  // 셋 중 가장 약한 축으로 유형을 정함 — 다 웬만큼 괜찮으면(70점 이상) "균형형".
  const weakest = Math.min(acc, comp, stability);
  const type = weakest >= 70 ? '균형형' : weakest === acc ? '관찰형' : weakest === comp ? '동요형' : '저돌형';

  return `${stageName} ${subStage}단계 · ${type}`;
}

export default function DashboardClient() {
  const [aggregateStats, setAggregateStats] = useState<AggregateStatCategoryResponse[] | null>(null);

  useEffect(() => {
    let loggedInNow = false;
    try {
      loggedInNow = localStorage.getItem('kg_logged_in') === '1';
    } catch (e) {}
    if (!loggedInNow) return;
    getMyAggregateStatCategories()
      .then(setAggregateStats)
      .catch(() => setAggregateStats([]));
  }, []);

  // 세션이 하나도 없으면(신규 계정) mock 값으로 대체 — 빈 대시보드보다 예시가 나음.
  const metrics = TIER_CATEGORY_KEYS.map((categoryKey) => {
    const { label } = SESSION_STAT_CATEGORY_LABELS[categoryKey];
    const stat = aggregateStats?.find((s) => s.categoryKey === categoryKey);
    const mockFallback = report.metrics.find((m) => m.label === label)?.value ?? '-';
    return { label, value: stat ? `${stat.avgScorePct}점` : mockFallback };
  });
  const sessionCount = aggregateStats && aggregateStats.length > 0 ? Math.max(...aggregateStats.map((s) => s.sessionCount)) : 0;
  const tier = computeTier(aggregateStats, sessionCount);

  return (
    <div>
      <TopNav right={`${user.nickname}님 · ${tier.split(' · ')[0]}`} />
      <div className="page" style={{ paddingTop: 56, gap: 40 }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="eyebrow">다시 오신 것을 환영해요</div>
            <h1 style={{ fontSize: 32 }}>안녕하세요, {user.nickname}님</h1>
            <p className="lede" style={{ fontSize: 15 }}>
              모의고사 1턴까지 진행하셨어요. 오늘도 이어서 훈련해볼까요?
            </p>
          </div>
        </div>

        <div className="tier-card">
          <span className="tier-label">나의 투자 체급</span>
          <span className="tier-name">{tier}</span>
          <div className="tier-metric-row">
            {metrics.map((m) => (
              <div className="tier-metric" key={m.label}>
                <strong>{m.value}</strong>
                <span>{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 800 }}>오늘 이어서 할 일</h3>
          <div className="card-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <Link
              href="/simulation"
              className="card"
              style={{ background: 'var(--green)', color: 'white', border: 0 }}
              data-knower-seat=""
              data-knower-swing-seat=""
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
                모의고사 · 1 / 10턴
              </span>
              <h3 style={{ color: 'white' }}>모의투자 이어하기</h3>
              <p style={{ color: 'rgba(255,255,255,0.9)' }}>지난번 멈춘 곳부터 바로 이어가요.</p>
              <span style={{ fontSize: 13, fontWeight: 800 }}>계속하기 →</span>
            </Link>
            <Link href="/my" className="card" data-knower-seat="">
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>
                지난주 대비 판단 정확도 +14%
              </span>
              <h3>나의 리포트 보기</h3>
              <p>습관 진단과 성장 그래프를 확인해요.</p>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--green)' }}>리포트 열기 →</span>
            </Link>
            <Link href="/pt" className="card" data-knower-seat="">
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>
                반대매매, 내 주식이 강제로 팔리는 순간
              </span>
              <h3>오늘의 PT</h3>
              <p>3분 · 퀴즈 2개 · 금융감독원 자료</p>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--green)' }}>학습 시작 →</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
