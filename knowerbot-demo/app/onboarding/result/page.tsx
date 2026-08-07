import Link from 'next/link';

export default function OnboardingResultPage() {
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
          <h3>리스크 기준을 먼저 잡으면 빠르게 성장할 수 있어요</h3>
          <p>
            현재 응답 기준으로는 기본 투자 개념은 이해하고 있지만, 포지션 크기와 손절 기준을
            명확히 정하는 훈련이 우선입니다.
          </p>
        </div>
        <div className="summary-score">B+</div>
      </div>

      <div className="result-grid" style={{ width: '100%', textAlign: 'left' }}>
        <div className="result-card">
          <span className="result-tag">성향</span>
          <h3>균형 탐색형</h3>
          <p>수익 기회에는 관심이 있지만, 손실 폭이 커지는 구간에서는 빠른 피드백이 필요한 유형입니다.</p>
        </div>
        <div className="result-card">
          <span className="result-tag">리스크</span>
          <h3>중간 민감도</h3>
          <p>레버리지와 손절 기준을 먼저 정하면 안정적으로 훈련을 이어갈 수 있습니다.</p>
        </div>
        <div className="result-card">
          <span className="result-tag">추천</span>
          <h3>초기 리스크 제어 코스</h3>
          <p>첫 세션은 포지션 크기 제한, 손절 기준 설정, 연속 손실 대응 연습으로 시작하세요.</p>
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
