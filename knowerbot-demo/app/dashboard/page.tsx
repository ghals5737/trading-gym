import Link from 'next/link';
import TopNav from '../../components/TopNav';
import { report, user } from '../../lib/mock-data';

export default function DashboardPage() {
  return (
    <div>
      <TopNav right={`${user.nickname}님 · ${report.tier.split(' · ')[0]}`} />
      <div className="page" style={{ paddingTop: 56, gap: 40 }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="eyebrow">다시 오신 것을 환영해요</div>
            <h1 style={{ fontSize: 32 }}>안녕하세요, {user.nickname}님</h1>
            <p className="lede" style={{ fontSize: 15 }}>
              스파링 시즌 1, 1턴까지 진행하셨어요. 오늘도 이어서 훈련해볼까요?
            </p>
          </div>
        </div>

        <div className="tier-card">
          <span className="tier-label">나의 투자 체급</span>
          <span className="tier-name">{report.tier}</span>
          <div className="tier-metric-row">
            {report.metrics.map((m) => (
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
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
                스파링 시즌 1 · 1 / 10턴
              </span>
              <h3 style={{ color: 'white' }}>모의투자 이어하기</h3>
              <p style={{ color: 'rgba(255,255,255,0.9)' }}>지난번 멈춘 곳부터 바로 이어가요.</p>
              <span style={{ fontSize: 13, fontWeight: 800 }}>계속하기 →</span>
            </Link>
            <Link href="/my" className="card">
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>
                지난주 대비 판단 정확도 +14%
              </span>
              <h3>나의 리포트 보기</h3>
              <p>습관 진단과 성장 그래프를 확인해요.</p>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--green)' }}>리포트 열기 →</span>
            </Link>
            <Link href="/pt" className="card">
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
