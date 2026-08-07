'use client';

import { useState } from 'react';
import TopNav from '../../components/TopNav';
import {
  stocks,
  watchlist,
  stockDetail,
  ranking,
  portfolio,
  riskIntervention,
} from '../../lib/mock-data';

function Sparkline({ points, color }: { points: number[]; color: string }) {
  const w = 500;
  const h = 118;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coords = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * (w - 20) + 10;
      const y = h - 14 - ((p - min) / range) * (h - 28);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" preserveAspectRatio="none">
      <polyline points={coords} fill="none" stroke={color} strokeWidth={2.5} />
    </svg>
  );
}

export default function SimulationClient() {
  const [activeSymbol, setActiveSymbol] = useState(stocks[0].symbol);
  const [quantity, setQuantity] = useState(10);
  const [showDetail, setShowDetail] = useState(false);
  const [showRisk, setShowRisk] = useState(false);
  const [credit, setCredit] = useState(false);

  const active = stocks.find((s) => s.symbol === activeSymbol)!;
  const estimate = active.price * quantity;

  function attemptBuy() {
    if (credit && quantity >= 40) {
      setShowRisk(true);
    }
  }

  return (
    <div>
      <TopNav
        right={
          <>
            스파링 시즌 1 · 2020 급락장에서 살아남기
            <br />내 자산 {portfolio.cash.toLocaleString()}원
          </>
        }
      />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 32px 90px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) 400px 280px', gap: 20 }}>
          {/* left: chart / news / stats */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="result-card" style={{ minHeight: 294 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <strong style={{ fontSize: 18 }}>{active.name}</strong>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{active.market}</span>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', margin: '10px 0' }}>
                <strong style={{ fontSize: 30 }}>{active.price.toLocaleString()}원</strong>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: active.changePct >= 0 ? 'var(--red)' : 'var(--green)',
                  }}
                >
                  {active.changePct >= 0 ? '+' : ''}
                  {active.changePct}%
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>1 / 10 턴 · 2020년 3월 2일 주간</span>
              </div>
              <div style={{ height: 160, background: 'var(--red-chip)', borderRadius: 8 }}>
                <Sparkline points={active.chart} color="var(--red)" />
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                padding: '0 12px',
                height: 51,
                background: 'var(--white)',
                border: '1px solid var(--line)',
                borderRadius: 12,
              }}
            >
              <span
                style={{
                  background: 'var(--green-chip)',
                  color: 'var(--green)',
                  fontSize: 11,
                  fontWeight: 800,
                  borderRadius: 999,
                  padding: '3px 9px',
                }}
              >
                뉴스
              </span>
              <span style={{ fontSize: 13, color: 'var(--soft)' }}>
                감염병 확산 공포… 글로벌 증시 동반 급락 시작
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                ['남은 현금', `${portfolio.cash.toLocaleString()}원`],
                ['보유 주식', portfolio.holdings],
                ['빌린 돈', `${portfolio.borrowed}원`],
                ['위험 온도', portfolio.riskLevel],
              ].map(([label, value]) => (
                <div key={label} className="result-card" style={{ minHeight: 0, padding: 14 }}>
                  <small style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>
                    {label}
                  </small>
                  <strong style={{ fontSize: 14 }}>{value}</strong>
                </div>
              ))}
            </div>
          </section>

          {/* middle: stock list / watchlist / trade panel */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="result-card" style={{ minHeight: 0, padding: 14 }}>
              <h3 style={{ fontSize: 13, margin: '0 0 6px' }}>종목 리스트</h3>
              {stocks.map((s) => (
                <button
                  key={s.symbol}
                  onClick={() => {
                    setActiveSymbol(s.symbol);
                    setShowDetail(true);
                  }}
                  style={{
                    display: 'flex',
                    width: '100%',
                    gap: 8,
                    alignItems: 'center',
                    padding: '8px',
                    borderRadius: 8,
                    border: 0,
                    background: s.symbol === activeSymbol ? 'var(--green-chip)' : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13,
                      fontWeight: s.symbol === activeSymbol ? 800 : 600,
                      color: s.symbol === activeSymbol ? 'var(--green)' : 'var(--ink)',
                    }}
                  >
                    {s.name}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--soft)' }}>{s.price.toLocaleString()}원</span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: s.changePct >= 0 ? 'var(--red)' : '#2969d9',
                    }}
                  >
                    {s.changePct >= 0 ? '+' : ''}
                    {s.changePct}%
                  </span>
                </button>
              ))}
            </div>

            <div className="result-card" style={{ minHeight: 0, padding: 14 }}>
              <h3 style={{ fontSize: 13, margin: '0 0 6px' }}>관심 종목 ⭐</h3>
              {stocks
                .filter((s) => watchlist.includes(s.symbol))
                .map((s) => (
                  <div key={s.symbol} style={{ display: 'flex', gap: 8, padding: '8px', alignItems: 'center' }}>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--soft)' }}>{s.price.toLocaleString()}원</span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: s.changePct >= 0 ? 'var(--red)' : '#2969d9',
                      }}
                    >
                      {s.changePct >= 0 ? '+' : ''}
                      {s.changePct}%
                    </span>
                  </div>
                ))}
            </div>

            <div className="result-card" style={{ minHeight: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h3 style={{ fontSize: 13, margin: 0 }}>{active.name} 주문</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>수량</span>
                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--chip)', borderRadius: 10 }}>
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    style={{ width: 34, height: 34, border: 0, background: 'transparent', fontSize: 16, cursor: 'pointer' }}
                  >
                    −
                  </button>
                  <span style={{ width: 56, textAlign: 'center', fontSize: 13, fontWeight: 800 }}>{quantity}주</span>
                  <button
                    onClick={() => setQuantity((q) => q + 1)}
                    style={{ width: 34, height: 34, border: 0, background: 'transparent', fontSize: 16, cursor: 'pointer' }}
                  >
                    +
                  </button>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>
                예상 금액 {estimate.toLocaleString()}원 · 신용거래 시 1.5배까지 가능
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={attemptBuy} className="btn btn-primary btn-sm" style={{ flex: 1 }}>
                  매수
                </button>
                <button
                  className="btn btn-sm"
                  style={{ flex: 1, background: 'var(--red-chip)', color: 'var(--red)', border: 0 }}
                >
                  매도
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setCredit((c) => !c)}
                  className="btn btn-sm"
                  style={{
                    flex: 1,
                    background: credit ? 'var(--amber-chip)' : 'var(--white)',
                    color: 'var(--amber)',
                    border: '1px solid var(--amber)',
                  }}
                >
                  신용거래 (1.5배)
                </button>
                <button className="btn btn-sm btn-secondary" style={{ flex: 1 }}>
                  관망 → 다음 턴
                </button>
              </div>
            </div>
          </section>

          {/* right: ranking */}
          <aside className="result-card" style={{ minHeight: 0, padding: 20 }}>
            <h3 style={{ fontSize: 15, margin: '0 0 4px' }}>이번 시즌 랭킹</h3>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--muted)' }}>
              스파링 시즌 1 · 수익률 기준
            </p>
            {ranking.map((r) => (
              <div
                key={r.rank}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  padding: '10px',
                  borderRadius: 10,
                  background: r.isMe ? 'var(--green-chip)' : 'transparent',
                }}
              >
                <span style={{ width: 16, fontSize: 13, fontWeight: 800, color: r.isMe ? 'var(--green)' : 'var(--muted)' }}>
                  {r.rank}
                </span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: r.isMe ? 800 : 600, color: r.isMe ? 'var(--green)' : 'var(--ink)' }}>
                  {r.name}
                </span>
                <span style={{ fontSize: 13, fontWeight: 800, color: r.isMe ? 'var(--green)' : 'var(--soft)' }}>
                  {r.returnPct}
                </span>
              </div>
            ))}
          </aside>
        </div>
      </div>

      {showDetail && (
        <StockDetailModal stock={active} onClose={() => setShowDetail(false)} />
      )}
      {showRisk && (
        <RiskInterventionModal
          quantity={`${quantity}주`}
          onCancel={() => setShowRisk(false)}
          onProceed={() => setShowRisk(false)}
        />
      )}
    </div>
  );
}

function StockDetailModal({
  stock,
  onClose,
}: {
  stock: (typeof stocks)[number];
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 30,
        background: 'rgba(13, 18, 10, 0.55)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(520px, 100%)',
          maxHeight: '86vh',
          overflowY: 'auto',
          background: 'var(--white)',
          borderRadius: 20,
          padding: 28,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: '0 24px 60px rgba(13, 18, 10, 0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>{stock.name}</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>{stock.market}</p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              borderRadius: 999,
              border: 0,
              background: 'var(--chip)',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
          <strong style={{ fontSize: 30 }}>{stock.price.toLocaleString()}원</strong>
          <span
            style={{
              fontSize: 13,
              fontWeight: 800,
              padding: '3px 8px',
              borderRadius: 999,
              background: 'var(--red-chip)',
              color: 'var(--red)',
            }}
          >
            {stock.changePct}%
          </span>
        </div>

        <div style={{ height: 110, background: 'var(--red-chip)', borderRadius: 12 }}>
          <Sparkline points={stock.chart} color="var(--red)" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            ['시가총액', stockDetail.marketCap],
            ['거래량', stockDetail.volume],
            ['52주 최고', stockDetail.high52w],
            ['52주 최저', stockDetail.low52w],
          ].map(([label, value]) => (
            <div key={label} style={{ background: 'var(--bg)', borderRadius: 10, padding: 12 }}>
              <small style={{ display: 'block', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                {label}
              </small>
              <strong style={{ fontSize: 14 }}>{value}</strong>
            </div>
          ))}
        </div>

        <div>
          <h3 style={{ fontSize: 13, margin: '0 0 8px' }}>투자 지표</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {[
              ['PER', stockDetail.per],
              ['PBR', stockDetail.pbr],
              ['ROE', stockDetail.roe],
              ['배당수익률', stockDetail.dividendYield],
            ].map(([label, value]) => (
              <div key={label} style={{ background: 'var(--bg)', borderRadius: 10, padding: 12 }}>
                <small style={{ display: 'block', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                  {label}
                </small>
                <strong style={{ fontSize: 14 }}>{value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: 13, margin: '0 0 8px' }}>
            재무제표 요약 (최근 3개년, 연결 기준)
          </h3>
          <div style={{ background: 'var(--bg)', borderRadius: 12, padding: 14 }}>
            <div style={{ display: 'flex' }}>
              <span style={{ flex: 1 }} />
              {stockDetail.financials.years.map((y) => (
                <span key={y} style={{ width: 70, textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>
                  {y}
                </span>
              ))}
            </div>
            {stockDetail.financials.rows.map((row) => (
              <div key={row.label} style={{ display: 'flex', padding: '4px 0' }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{row.label}</span>
                {row.values.map((v, i) => (
                  <span key={i} style={{ width: 70, textAlign: 'right', fontSize: 13, color: 'var(--soft)' }}>
                    {v}
                  </span>
                ))}
              </div>
            ))}
            <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--red)' }}>
              {stockDetail.financials.note}
            </p>
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: 13, margin: '0 0 8px' }}>이 종목은요</h3>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--soft)', lineHeight: 1.6 }}>
            {stockDetail.about}
          </p>
        </div>

        <button onClick={onClose} className="btn btn-primary btn-block">
          이 종목 주문하러 가기
        </button>
      </div>
    </div>
  );
}

function RiskInterventionModal({
  quantity,
  onCancel,
  onProceed,
}: {
  quantity: string;
  onCancel: () => void;
  onProceed: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 30,
        background: 'rgba(13, 18, 10, 0.55)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: 'min(480px, 100%)',
          background: 'var(--white)',
          borderRadius: 22,
          padding: 32,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          boxShadow: '0 24px 60px rgba(13, 18, 10, 0.3)',
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              background: 'var(--red-chip)',
              color: 'var(--red)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 18,
              fontWeight: 800,
            }}
          >
            !
          </span>
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--red)' }}>AI 코치 실시간 개입</span>
        </div>
        <h2 style={{ margin: 0, fontSize: 22 }}>잠깐, 이 매매는 위험해요</h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--soft)', lineHeight: 1.6 }}>
          지금 신용매수 {quantity}를 진행하면 담보비율이 {riskIntervention.expectedRatio}까지
          떨어져요. {riskIntervention.liquidationThreshold} 아래로 내려가면 — 내 의사와 상관없이
          반대매매가 발생할 수 있어요.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            ['예상 담보비율', riskIntervention.expectedRatio, 'var(--red)'],
            ['반대매매 기준', riskIntervention.liquidationThreshold, 'var(--muted)'],
            ['매수 후 위험온도', riskIntervention.riskLevel, 'var(--red)'],
          ].map(([label, value, color]) => (
            <div key={label} style={{ background: 'var(--amber-chip)', borderRadius: 10, padding: 12 }}>
              <small style={{ display: 'block', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                {label}
              </small>
              <strong style={{ fontSize: 15, color }}>{value}</strong>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} className="btn btn-primary" style={{ flex: 1 }}>
            다시 생각해볼게요
          </button>
          <button onClick={onProceed} className="btn btn-secondary" style={{ flex: 1 }}>
            그래도 진행할게요
          </button>
        </div>
      </div>
    </div>
  );
}
