// waypoints(주요 변곡점) 사이를 보간+노이즈로 채워서 자연스러운 가격 흐름을 만드는 작은
// 라이브러리 — rewind 시나리오뿐 아니라 앞으로 LLM이 waypoint 숫자만 던져줘도(직접 수십
// 개를 만들 필요 없이) 같은 방식으로 자연스러운 일봉형 곡선을 그릴 수 있게 분리함.

export interface BuildSeriesOptions {
  pointsPerSegment?: number;
  noiseAmt?: number;
}

export function buildSeries(waypoints: number[], seed: number, options: BuildSeriesOptions = {}): number[] {
  const { pointsPerSegment = 5, noiseAmt = 0.008 } = options;
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const out: number[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];
    for (let j = 0; j < pointsPerSegment; j++) {
      const t = j / pointsPerSegment;
      const base = from + (to - from) * t;
      const noise = base * noiseAmt * (rand() * 2 - 1);
      out.push(Math.round(base + noise));
    }
  }
  out.push(Math.round(waypoints[waypoints.length - 1]));
  return out;
}
