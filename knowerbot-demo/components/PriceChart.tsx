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

interface PriceChartProps {
  points: PricePoint[];
  todayOpenPrice?: number;
  todayDate?: string;
  height?: number;
}

function toTimestamp(dateStr: string): UTCTimestamp {
  return (Date.parse(`${dateStr}T00:00:00Z`) / 1000) as UTCTimestamp;
}

// 국내 관례대로 상승=빨강/하락=파랑(초록) — 나머지 UI(변동률 색 등)와 통일.
export default function PriceChart({ points, todayOpenPrice, todayDate, height = 160 }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null>(null);
  const [mode, setMode] = useState<ChartMode>('candle');

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
        points.map((p) => ({
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
      const data = points.map((p) => ({ time: toTimestamp(p.tradeDate), value: p.closePrice }));
      if (todayOpenPrice != null && todayDate) {
        data.push({ time: toTimestamp(todayDate), value: todayOpenPrice });
      }
      series.setData(data);
      seriesRef.current = series;
    }

    chart.timeScale().fitContent();
  }, [points, mode, todayOpenPrice, todayDate]);

  return (
    <div style={{ width: '100%', height }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 4 }}>
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
      <div style={{ position: 'relative', width: '100%', height: height - 24 }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        {points.length < 2 && (
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
            아직 표시할 이전 시세가 없어요 (첫 거래일)
          </div>
        )}
      </div>
    </div>
  );
}
