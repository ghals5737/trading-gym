'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { PricePoint } from '../lib/simulation-api';

type ChartMode = 'candle' | 'line';
type PeriodMode = 'DAY' | 'WEEK' | 'MONTH';

interface PriceChartProps {
  points: PricePoint[];
  todayOpenPrice?: number;
  todayDate?: string;
  height?: number;
}

function toTimestamp(dateStr: string): UTCTimestamp {
  return (Date.parse(`${dateStr}T00:00:00Z`) / 1000) as UTCTimestamp;
}

// 주 단위 묶음의 기준일 — 그 주의 월요일(ISO 기준). 월 단위는 "연-월"로 묶음.
function bucketKey(dateStr: string, period: PeriodMode): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (period === 'MONTH') return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
  const diffToMonday = (d.getUTCDay() + 6) % 7; // 0=월요일 기준으로 보정
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - diffToMonday);
  return monday.toISOString().slice(0, 10);
}

// points는 이미 날짜 오름차순 — 묶음 안에서 시가는 첫날 것, 종가는 마지막날 것,
// 고가/저가는 묶음 내 최대/최소로 합쳐서 일봉을 주/월봉으로 만듦.
function aggregateByPeriod(points: PricePoint[], period: PeriodMode): PricePoint[] {
  if (period === 'DAY') return points;
  const buckets = new Map<string, PricePoint[]>();
  for (const p of points) {
    const key = bucketKey(p.tradeDate, period);
    const group = buckets.get(key);
    if (group) group.push(p);
    else buckets.set(key, [p]);
  }
  return [...buckets.values()].map((group) => ({
    tradeDate: group[0].tradeDate,
    openPrice: group[0].openPrice,
    highPrice: Math.max(...group.map((p) => p.highPrice)),
    lowPrice: Math.min(...group.map((p) => p.lowPrice)),
    closePrice: group[group.length - 1].closePrice,
  }));
}

// 국내 관례대로 상승=빨강/하락=파랑(초록) — 나머지 UI(변동률 색 등)와 통일.
export default function PriceChart({ points, todayOpenPrice, todayDate, height = 160 }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null>(null);
  const [mode, setMode] = useState<ChartMode>('candle');
  const [period, setPeriod] = useState<PeriodMode>('DAY');
  const aggregatedPoints = aggregateByPeriod(points, period);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#8a8f80',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(0,0,0,0.05)' },
        horzLines: { color: 'rgba(0,0,0,0.05)' },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      crosshair: { mode: 0 },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;

    const resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width && rect.height) {
        chart.applyOptions({ width: rect.width, height: rect.height });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (seriesRef.current) {
      chart.removeSeries(seriesRef.current);
      seriesRef.current = null;
    }

    if (mode === 'candle') {
      const series = chart.addSeries(CandlestickSeries, {
        upColor: '#e5484d',
        downColor: '#2f9e44',
        borderVisible: false,
        wickUpColor: '#e5484d',
        wickDownColor: '#2f9e44',
      });
      series.setData(
        aggregatedPoints.map((p) => ({
          time: toTimestamp(p.tradeDate),
          open: p.openPrice,
          high: p.highPrice,
          low: p.lowPrice,
          close: p.closePrice,
        })),
      );
      seriesRef.current = series;
    } else {
      const series = chart.addSeries(LineSeries, { color: '#e5484d', lineWidth: 2 });
      const data = aggregatedPoints.map((p) => ({ time: toTimestamp(p.tradeDate), value: p.closePrice }));
      // 오늘 시가는 아직 완성 안 된 봉이라 일봉일 때만 이어붙임 — 주/월봉으로 보는
      // 중엔 진행 중인 묶음에 억지로 끼워넣지 않고 완성된 과거 봉까지만 보여줌.
      if (period === 'DAY' && todayOpenPrice != null && todayDate) {
        data.push({ time: toTimestamp(todayDate), value: todayOpenPrice });
      }
      series.setData(data);
      seriesRef.current = series;
    }

    chart.timeScale().fitContent();
  }, [aggregatedPoints, mode, period, todayOpenPrice, todayDate]);

  return (
    <div style={{ width: '100%', height }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {(
            [
              ['DAY', '일'],
              ['WEEK', '주'],
              ['MONTH', '월'],
            ] as const
          ).map(([p, label]) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 999,
                border: `1px solid ${period === p ? 'transparent' : 'var(--line)'}`,
                background: period === p ? 'var(--green-chip)' : 'var(--white)',
                color: period === p ? 'var(--green)' : 'var(--soft)',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['candle', 'line'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 999,
                border: `1px solid ${mode === m ? 'transparent' : 'var(--line)'}`,
                background: mode === m ? 'var(--green-chip)' : 'var(--white)',
                color: mode === m ? 'var(--green)' : 'var(--soft)',
                cursor: 'pointer',
              }}
            >
              {m === 'candle' ? '캔들' : '라인'}
            </button>
          ))}
        </div>
      </div>
      <div style={{ position: 'relative', width: '100%', height: height - 24 }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        {aggregatedPoints.length < 2 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              fontSize: 12,
              color: 'var(--muted)',
            }}
          >
            {period === 'DAY' ? '아직 표시할 이전 시세가 없어요 (첫 거래일)' : '아직 완성된 봉이 부족해요 — 진행하면 더 보여요'}
          </div>
        )}
      </div>
    </div>
  );
}
