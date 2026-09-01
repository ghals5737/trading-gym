// 리와인드 전용 라인 차트 — PriceChart(TradingView lightweight-charts)를 안 쓰고 순수
// SVG로 직접 그림. 이유: 이 화면의 핵심은 "문제가 뜰 때 차트가 그려지고, 선택하면 이어서
// 더 그려지는" 애니메이션 자체라서, 매 프레임 몇 개 포인트까지 그릴지(visibleCount)를
// 직접 제어할 수 있어야 함 — 캔들/기간 토글 같은 PriceChart의 다른 기능은 이 화면엔
// 필요 없어서 오히려 간단한 전용 컴포넌트가 나음.
const WIDTH = 600;
const HEIGHT = 220;
const PAD_Y = 18;

export default function RewindChart({ prices, visibleCount }: { prices: number[]; visibleCount: number }) {
  const shown = prices.slice(0, Math.max(1, Math.min(visibleCount, prices.length)));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = Math.max(1, max - min);

  const toXY = (i: number, total: number) => {
    const x = total > 1 ? (i / (total - 1)) * WIDTH : 0;
    const y = HEIGHT - PAD_Y - ((shown[i] - min) / range) * (HEIGHT - PAD_Y * 2);
    return [x, y] as const;
  };

  const points = shown.map((_, i) => toXY(i, shown.length));
  const pathD = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lastX, lastY] = points[points.length - 1] ?? [0, 0];
  const rising = shown[shown.length - 1] >= shown[0];

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      height={HEIGHT}
      style={{ display: 'block', overflow: 'visible' }}
      role="img"
      aria-label={`가격 흐름 차트, 현재 ${shown[shown.length - 1]?.toLocaleString()}원`}
    >
      <path d={pathD} fill="none" stroke={rising ? '#e5484d' : '#2f9e44'} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={5} fill={rising ? '#e5484d' : '#2f9e44'} />
      <circle cx={lastX} cy={lastY} r={9} fill={rising ? '#e5484d' : '#2f9e44'} opacity={0.18} />
    </svg>
  );
}
