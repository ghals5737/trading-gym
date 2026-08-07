'use client';

import Link from 'next/link';
import LoginButton from '../components/LoginButton';
import useLoggedIn from '../components/useLoggedIn';

const features = [
  { icon: '1', title: '투자성향 진단', desc: '리스크 감내도와 투자 목적을 먼저 파악해요.' },
  { icon: '2', title: '실시간 모의투자', desc: '실제 시세로 신용거래까지 안전하게 연습해요.' },
  { icon: '3', title: 'AI 코치 개입', desc: '위험한 매매 패턴을 즉시 짚어드려요.' },
  { icon: '4', title: '맞춤 학습', desc: '부족한 개념만 짧게, 공신력 있는 자료로.' },
];

export default function Home() {
  const loggedIn = useLoggedIn();

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div className="eyebrow">
          <span className="badge">짐</span>
          트레이딩 짐
        </div>
        {loggedIn ? (
          <Link href="/dashboard" className="btn btn-secondary btn-sm" data-knower-swing-seat="">
            홈으로
          </Link>
        ) : (
          <LoginButton className="btn btn-secondary btn-sm">로그인</LoginButton>
        )}
      </div>
      <div className="hero">
        <h1>
          실패를 안전하게 연습하는
          <br />
          AI 투자 코칭 에이전트
        </h1>
        <p className="lede">
          실제 시세 기반 모의투자로 위험을 안전하게 경험하고, AI가 투자 성향을 진단해 맞춤 학습까지
          이어주는 순환형 투자 교육 서비스예요. 반대매매도, 레버리지 청산도 — 진짜 계좌를 걸기
          전에 먼저 겪어보세요.
        </p>
        <div className="cta-row">
          {loggedIn ? (
            <Link href="/dashboard" className="btn btn-primary">
              내 대시보드로 가기
            </Link>
          ) : (
            <LoginButton className="btn btn-primary">무료로 시작하기</LoginButton>
          )}
          <a className="btn btn-secondary">서비스 둘러보기</a>
        </div>
      </div>
      <div className="card-grid">
        {features.map((f) => (
          <div className="card" key={f.title} data-knower-seat="">
            <span className="icon">{f.icon}</span>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
