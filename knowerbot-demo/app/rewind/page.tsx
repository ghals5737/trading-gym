import TopNav from '../../components/TopNav';

export default function RewindPage() {
  return (
    <div>
      <TopNav right="준비 중" />
      <div className="page-narrow" style={{ alignItems: 'center', textAlign: 'center' }}>
        <div className="eyebrow" style={{ justifyContent: 'center' }}>
          리와인드
        </div>
        <h1 style={{ fontSize: 28 }}>차트 리플레이는 준비 중이에요</h1>
        <p className="lede">
          실제 급락장 데이터를 턴 단위로 다시 살아보는 리와인드 모드는 곧 만나보실 수 있어요.
        </p>
      </div>
    </div>
  );
}
