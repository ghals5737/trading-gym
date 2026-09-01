// 세션을 거듭할수록 3개 대분류(정확성/침착성/공격성) 점수가 어떻게 바뀌는지 보여주는
// 라인 차트 — 순수 SVG로 직접 그림(포인트 몇 개짜리 꺾은선이라 라이브러리 없이 충분).
// StatTriangleChart와 같은 방식으로 다크/라이트는 CSS 변수로 자동 대응됨.

export interface StatTrendSeries {
  key: string;
  label: string;
  color: string;
  values: (number | null)[]; // 세션 순서대로, 0~100. 그 세션에 값이 없으면 null.
}

const WIDTH = 640;
const HEIGHT = 240;
const PAD_LEFT = 34;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;
const GRID_FRACTIONS = [0, 25, 50, 75, 100];
// x축에 라벨을 최대 이만큼만 — 회차가 많아지면 다 찍었을 때 숫자끼리 겹쳐서 오히려 안 읽힘.
const MAX_X_LABELS = 8;

export default function StatTrendChart({ series, xLabels }: { series: StatTrendSeries[]; xLabels: string[] }) {
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const count = xLabels.length;

  const toX = (i: number) => PAD_LEFT + (count > 1 ? (i / (count - 1)) * plotWidth : plotWidth / 2);
  const toY = (v: number) => PAD_TOP + plotHeight - (Math.max(0, Math.min(100, v)) / 100) * plotHeight;

  // 라벨은 일정 간격으로 건너뛰어 찍되, 마지막(가장 최근) 회차는 항상 보여줌.
  const labelStep = Math.max(1, Math.ceil(count / MAX_X_LABELS));
  const visibleLabelIndexes = new Set<number>();
  for (let i = 0; i < count; i += labelStep) visibleLabelIndexes.add(i);
  if (count > 0) visibleLabelIndexes.add(count - 1);

  // 점(circle)도 회차가 많아지면 촘촘히 겹쳐 지저분해지니 자동으로 줄이거나 뺌 —
  // 대신 각 선의 마지막(최신) 값은 항상 점으로 강조해서 "지금 어디인지"는 always 보이게.
  const dotRadius = count > 25 ? 0 : count > 12 ? 2 : 3;

  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height="auto"
        style={{ display: 'block' }}
        role="img"
        aria-label={series.map((s) => `${s.label} 추이`).join(', ')}
      >
        {/* 배경 가로 기준선 — 0/25/50/75/100점 */}
        {GRID_FRACTIONS.map((pct) => (
          <g key={pct}>
            <line x1={PAD_LEFT} y1={toY(pct)} x2={WIDTH - PAD_RIGHT} y2={toY(pct)} stroke="var(--line)" strokeWidth={1} />
            <text x={PAD_LEFT - 8} y={toY(pct)} textAnchor="end" dominantBaseline="middle" style={{ fontSize: 10, fill: 'var(--muted)' }}>
              {pct}
            </text>
          </g>
        ))}

        {/* x축 라벨 — 회차가 많으면 MAX_X_LABELS개로만 건너뛰어 찍음(안 그러면 숫자끼리 겹침) */}
        {xLabels.map((label, i) =>
          visibleLabelIndexes.has(i) ? (
            <text key={i} x={toX(i)} y={HEIGHT - 8} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--muted)' }}>
              {label}
            </text>
          ) : null,
        )}

        {/* 지표별 꺾은선 — 값이 없는 세션(null)은 건너뛰고 있는 구간만 이어그림 */}
        {series.map((s) => {
          const segments: { x: number; y: number }[][] = [];
          let current: { x: number; y: number }[] = [];
          s.values.forEach((v, i) => {
            if (v == null) {
              if (current.length) segments.push(current);
              current = [];
              return;
            }
            current.push({ x: toX(i), y: toY(v) });
          });
          if (current.length) segments.push(current);

          return (
            <g key={s.key}>
              {segments.map((seg, i) => (
                <polyline
                  key={i}
                  points={seg.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
              {dotRadius > 0 &&
                s.values.map((v, i) => (v == null ? null : <circle key={i} cx={toX(i)} cy={toY(v)} r={dotRadius} fill={s.color} />))}
              {/* 가장 최근 값은 점 크기와 상관없이 항상 강조 */}
              {(() => {
                const lastIdx = s.values.map((v) => v != null).lastIndexOf(true);
                if (lastIdx < 0) return null;
                return <circle cx={toX(lastIdx)} cy={toY(s.values[lastIdx] as number)} r={4} fill={s.color} />;
              })()}
            </g>
          );
        })}
      </svg>

      {/* 범례 */}
      <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
        {series.map((s) => (
          <span key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--soft)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: s.color, display: 'inline-block' }} />
            {s.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
