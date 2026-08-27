// 3개(이상) 지표를 레이더(방사형) 차트로 보여주는 순수 SVG 컴포넌트 — 외부 차트 라이브러리
// 없이 직접 그림(포인트가 3개뿐이라 라이브러리를 새로 붙일 만큼의 복잡도가 아님).
// 다크/라이트 테마는 currentColor + CSS 변수로 자동 대응됨.

export interface StatTrianglePoint {
  key: string;
  label: string;
  value: number; // 0~100
}

const SIZE = 260;
const CENTER = SIZE / 2;
const MAX_RADIUS = 78;
const RING_FRACTIONS = [0.25, 0.5, 0.75, 1];

function pointAt(index: number, total: number, radius: number) {
  const angle = ((index * 360) / total) * (Math.PI / 180);
  return {
    x: CENTER + radius * Math.sin(angle),
    y: CENTER - radius * Math.cos(angle),
  };
}

function polygonPoints(total: number, radius: number) {
  return Array.from({ length: total }, (_, i) => {
    const p = pointAt(i, total, radius);
    return `${p.x},${p.y}`;
  }).join(' ');
}

export default function StatTriangleChart({ points }: { points: StatTrianglePoint[] }) {
  const total = points.length;

  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width="100%"
        height="auto"
        style={{ maxWidth: 320, display: 'block', margin: '0 auto' }}
        role="img"
        aria-label={points.map((p) => `${p.label} ${p.value}점`).join(', ')}
      >
        {/* 배경 그리드 — 25/50/75/100% 기준선 */}
        {RING_FRACTIONS.map((frac) => (
          <polygon
            key={frac}
            points={polygonPoints(total, MAX_RADIUS * frac)}
            fill="none"
            stroke="var(--line)"
            strokeWidth={1}
          />
        ))}

        {/* 중심에서 각 꼭짓점으로 뻗는 축선 */}
        {points.map((p, i) => {
          const end = pointAt(i, total, MAX_RADIUS);
          return (
            <line
              key={p.key}
              x1={CENTER}
              y1={CENTER}
              x2={end.x}
              y2={end.y}
              stroke="var(--line)"
              strokeWidth={1}
            />
          );
        })}

        {/* 실제 데이터 다각형 */}
        <polygon
          points={points
            .map((p, i) => {
              const v = pointAt(i, total, (Math.max(0, Math.min(100, p.value)) / 100) * MAX_RADIUS);
              return `${v.x},${v.y}`;
            })
            .join(' ')}
          fill="var(--green)"
          fillOpacity={0.22}
          stroke="var(--green)"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* 데이터 포인트 점 */}
        {points.map((p, i) => {
          const v = pointAt(i, total, (Math.max(0, Math.min(100, p.value)) / 100) * MAX_RADIUS);
          return <circle key={p.key} cx={v.x} cy={v.y} r={3.5} fill="var(--green)" />;
        })}

        {/* 라벨 + 점수 */}
        {points.map((p, i) => {
          const labelPos = pointAt(i, total, MAX_RADIUS + 30);
          return (
            <text
              key={p.key}
              x={labelPos.x}
              y={labelPos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fontSize: 12, fontWeight: 700, fill: 'var(--ink)' }}
            >
              <tspan x={labelPos.x} dy="-0.3em">{p.label}</tspan>
              <tspan x={labelPos.x} dy="1.3em" style={{ fontSize: 13, fontWeight: 800, fill: 'var(--green)' }}>
                {p.value}점
              </tspan>
            </text>
          );
        })}
      </svg>
    </figure>
  );
}
