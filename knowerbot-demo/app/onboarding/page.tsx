export default function OnboardingIntroPage() {
  return (
    <div className="page" style={{ alignItems: 'center', textAlign: 'center' }}>
      <div className="eyebrow" style={{ justifyContent: 'center' }}>
        <span className="badge">짐</span>
        사전 조사
      </div>
      <div className="hero" style={{ alignItems: 'center', textAlign: 'center', margin: '0 auto' }}>
        <h1>어서오세요</h1>
        <p className="lede">KnowerBot이 몇 가지 질문으로 투자 성향과 리스크 감내도를 확인할게요.</p>
        <p className="survey-note">답변은 맞춤형 모의투자 코스 추천에만 사용됩니다.</p>
      </div>
      <div className="floor-note">
        오른쪽 아래 KnowerBot을 눌러서 대화를 시작해보세요. 대화가 끝나면 결과 화면으로 이동해요.
      </div>
    </div>
  );
}
