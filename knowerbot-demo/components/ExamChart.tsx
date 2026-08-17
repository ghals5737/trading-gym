'use client';

// 모의고사 전용 차트. PriceChart(lightweight-charts 캔들)를 안 쓴 이유는
// 모의고사 턴 데이터가 종가만 갖고 있어서다 — 없는 시가/고가/저가를 지어내면
// 캔들이 전부 납작한 선으로 그려져 오히려 잘못된 인상을 준다.
//
// 제출 전에는 판단 시점까지만 잉크색으로 그리고, 제출 후에는 이후 흐름을
// 상승=빨강/하락=파랑으로 이어 붙이고 판단 시점에 점선을 세운다.

export interface ChartPoint {
  d: string;
  c: number;
}

const W = 640;
const H = 200;
const PAD_X = 8;
const PAD_Y = 16;

const RED = '#d64b33';
const BLUE = '#3e6fd8';
const INK = '#4a463d';

export default function ExamChart({
  points,
  outcomePoints,
  height = 200,
}: {
  points: ChartPoint[];
  outcomePoints?: ChartPoint[] | null;
  height?: number;
}) {
  const revealed = Boolean(outcomePoints && outcomePoints.length > 1);
  // outcome의 첫 점은 판단 시점과 같은 가격이라 선이 자연스럽게 이어진다.
  const all = revealed ? [...points, ...outcomePoints!.slice(1)] : points;
  if (all.length < 2) return null;

  const values = all.map((p) => p.c);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const total = all.length;

  const x = (i: number) => PAD_X + (i * (W - PAD_X * 2)) / (total - 1);
  const y = (v: number) => PAD_Y + (1 - (v - min) / span) * (H - PAD_Y * 2);
  const toPath = (slice: ChartPoint[], offset: number) =>
    slice.map((p, i) => `${x(offset + i).toFixed(1)},${y(p.c).toFixed(1)}`).join(' ');

  const splitIndex = points.length - 1;
  const outcomeUp = revealed && all[total - 1].c >= all[splitIndex].c;
  const outcomeColor = outcomeUp ? RED : BLUE;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height, display: 'block' }}
      role="img"
      aria-label="주가 차트"
    >
      {[0.25, 0.5, 0.75].map((r) => (
        <line
          key={r}
          x1={0}
          y1={PAD_Y + r * (H - PAD_Y * 2)}
          x2={W}
          y2={PAD_Y + r * (H - PAD_Y * 2)}
          stroke="var(--line)"
          strokeWidth={1}
        />
      ))}

      {/* 판단 시점까지 */}
      <polyline
        points={toPath(points, 0)}
        fill="none"
        stroke={revealed ? INK : RED}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />

      {revealed && (
        <>
          <line
            x1={x(splitIndex)}
            y1={PAD_Y}
            x2={x(splitIndex)}
            y2={H - PAD_Y}
            stroke="var(--muted)"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <polyline
            points={toPath(outcomePoints!, splitIndex)}
            fill="none"
            stroke={outcomeColor}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
        </>
      )}

      <circle cx={x(splitIndex)} cy={y(points[points.length - 1].c)} r={4} fill={revealed ? INK : RED} />
    </svg>
  );
}
