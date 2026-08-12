'use client';

import { useEffect, useState } from 'react';
import TopNav from '../../components/TopNav';
import PriceChart from '../../components/PriceChart';
import { stockDetail, ranking, riskIntervention } from '../../lib/mock-data';
import {
  getActiveSession,
  getAvailableTradingDates,
  createSession,
  getQuotes,
  getStockHistory,
  getStockNews,
  recordTrade,
  listTrades,
  advanceTurn,
  completeSession,
  type SessionResponse,
  type QuoteResponse,
  type TradeResponse,
  type TradeOrderType,
  type TurnUnit,
  type PricePoint,
  type StockNewsResponse,
} from '../../lib/simulation-api';
import { getMyInvestorProfile, type InvestorProfileResponse } from '../../lib/onboarding-api';
import { warningFor } from '../../lib/onboarding-copy';

const TURN_UNIT_LABELS: Record<TurnUnit, string> = { DAY: '하루', WEEK: '일주일', MONTH: '한달' };

// KnowerBot이 채팅으로 직접 물어봄(public/knowerbot-runtime.js가 window에 노출) — 그 벡터가
// 아직 안 떠 있으면(로딩 지연 등) null을 돌려줘서 호출부가 매매를 취소하게 함.
declare global {
  interface Window {
    knowerbotAskReason?: (question: string) => Promise<string>;
  }
}
async function askReason(question: string): Promise<string | null> {
  if (typeof window === 'undefined' || typeof window.knowerbotAskReason !== 'function') {
    return null;
  }
  const answer = await window.knowerbotAskReason(question);
  return answer.trim() ? answer.trim() : null;
}

const STARTING_CASH = 10_000_000;
const MAINTENANCE_RATIO = 1.4; // 담보 유지비율 140% — 백엔드 SimulationService와 동일 기준
// 시작일~종료일 사이 최소 거래일수 — 백엔드 SimulationService.MIN_START_DATE_RANGE_DAYS(=MAX_TURNS)와 동일.
// 여긴 종료일 드롭다운 후보를 미리 걸러내는 용도일 뿐, 실제 검증은 서버가 다시 함.
const MIN_RANGE_TRADING_DAYS = 20;

interface Holding {
  stockCode: string;
  stockName: string;
  quantity: number;
  avgPrice: number;
}

// 이동평균법(weighted average cost) — 매도는 남은 수량의 평단가를 안 바꾸고 비율만 줄임.
function computeHoldings(trades: TradeResponse[]): Holding[] {
  const byStock = new Map<string, { stockName: string; quantity: number; totalCost: number }>();
  for (const t of trades) {
    if (!t.filled || t.price == null || t.stockCode == null || t.quantity == null || t.stockName == null) continue;
    const stockCode = t.stockCode;
    const quantity = t.quantity;
    const price = t.price;
    const entry = byStock.get(stockCode) ?? { stockName: t.stockName, quantity: 0, totalCost: 0 };
    if (t.side === 'BUY') {
      entry.quantity += quantity;
      entry.totalCost += quantity * price;
    } else {
      const avgPrice = entry.quantity > 0 ? entry.totalCost / entry.quantity : 0;
      entry.quantity = Math.max(0, entry.quantity - quantity);
      entry.totalCost = avgPrice * entry.quantity;
    }
    entry.stockName = t.stockName;
    byStock.set(stockCode, entry);
  }
  return [...byStock.entries()]
    .filter(([, v]) => v.quantity > 0)
    .map(([stockCode, v]) => ({
      stockCode,
      stockName: v.stockName,
      quantity: v.quantity,
      avgPrice: v.totalCost / v.quantity,
    }));
}

function Sparkline({ points, color }: { points: number[]; color: string }) {
  const w = 500;
  const h = 118;
  if (points.length < 2) {
    return <div style={{ width: '100%', height: '100%' }} />;
  }
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
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [startDateChoice, setStartDateChoice] = useState('');
  const [endDateChoice, setEndDateChoice] = useState('');
  const [turnUnitChoice, setTurnUnitChoice] = useState<TurnUnit>('DAY');
  const [needsStartDate, setNeedsStartDate] = useState(false);
  const [starting, setStarting] = useState(false);
  const [quotes, setQuotes] = useState<QuoteResponse[]>([]);
  const [trades, setTrades] = useState<TradeResponse[]>([]);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [historyPoints, setHistoryPoints] = useState<PricePoint[]>([]);
  const [stockNews, setStockNews] = useState<StockNewsResponse | null>(null);

  const [quantity, setQuantity] = useState(10);
  const [credit, setCredit] = useState(false);
  const [orderType, setOrderType] = useState<TradeOrderType>('MARKET');
  const [limitPriceInput, setLimitPriceInput] = useState('');
  const [pendingReason, setPendingReason] = useState('');
  const [asking, setAsking] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showNews, setShowNews] = useState(false);
  const [showRisk, setShowRisk] = useState(false);
  const [pendingRiskRatio, setPendingRiskRatio] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);
  const [liquidationEvent, setLiquidationEvent] = useState<TradeResponse[] | null>(null);
  const [completedSummary, setCompletedSummary] = useState<
    { startingCash: number; finalValue: number; returnPct: number; reason?: string } | null
  >(null);
  const [ending, setEnding] = useState(false);
  const [profile, setProfile] = useState<InvestorProfileResponse | null>(null);

  // 진행 중인 세션 있으면 이어가고, 없으면 시작 날짜를 고르게 함(자동 시작 안 함)
  useEffect(() => {
    (async () => {
      try {
        const [existing, dates] = await Promise.all([getActiveSession(), getAvailableTradingDates()]);
        setAvailableDates(dates);
        if (existing) {
          setSession(existing);
        } else {
          setStartDateChoice(dates[0] ?? '');
          setNeedsStartDate(true);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '세션을 불러오지 못했어요');
      } finally {
        setLoading(false);
      }
    })();
    // 온보딩 진단 결과 — 신용거래 경고 강도를 성향별로 차등하는 데 씀. 미진단이면 null(차등 없음).
    getMyInvestorProfile().then(setProfile).catch(() => setProfile(null));
  }, []);

  // 시작일부터 최소 MIN_RANGE_TRADING_DAYS 거래일 이상 떨어진 날짜만 종료일 후보로 줌 —
  // availableDates가 이미 실제 거래일만 오름차순으로 담고 있어서 인덱스 계산만으로 충분함.
  const startIndex = availableDates.indexOf(startDateChoice);
  const validEndDates = startIndex >= 0 ? availableDates.slice(startIndex + MIN_RANGE_TRADING_DAYS - 1) : [];

  // 시작일이 바뀌면(또는 처음 로드되면) 종료일 후보도 다시 계산 — 기존 선택이 여전히
  // 유효하면 유지하고, 아니면 가장 긴 구간(마지막 후보)으로 기본값을 다시 잡음.
  useEffect(() => {
    setEndDateChoice((prev) => (validEndDates.includes(prev) ? prev : validEndDates[validEndDates.length - 1] ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDateChoice, availableDates]);

  // 리스크는 크게 감수하고 싶은데 지식은 부족하거나, 정보를 SNS·리딩방에 의존하는 조합이면
  // 반대매매를 가장 겪기 쉬운 유형 — 온보딩 결과 화면(warningFor)과 같은 기준을 여기서도 재사용.
  const riskWarningText = profile ? warningFor(profile.profileType, profile.knowledgeLevel, profile.infoHabitLevel) : null;

  async function handleStartSession() {
    if (!startDateChoice || !endDateChoice) return;
    setStarting(true);
    setError(null);
    try {
      const s = await createSession(STARTING_CASH, startDateChoice, endDateChoice);
      setSession(s);
      setNeedsStartDate(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '세션을 시작하지 못했어요');
    } finally {
      setStarting(false);
    }
  }

  // 세션(턴 포함)이 바뀔 때마다 종목 시세 + 매매 내역 다시 불러옴
  useEffect(() => {
    if (!session) return;
    (async () => {
      const [q, t] = await Promise.all([getQuotes(session.id), listTrades(session.id)]);
      setQuotes(q);
      setTrades(t);
      setActiveCode((prev) => prev ?? q[0]?.stockCode ?? null);
    })();
  }, [session]);

  // 선택 종목 또는 턴이 바뀌면 차트(어제까지의 OHLC)도 다시 불러옴
  useEffect(() => {
    if (!session || !activeCode) return;
    getStockHistory(session.id, activeCode).then((h) => setHistoryPoints(h.points));
  }, [session, activeCode]);

  // 선택 종목 또는 턴이 바뀌면 그 종목의 실제 뉴스(고정 데이터)도 다시 불러옴 —
  // 뉴스가 있는 날짜는 드물어서 없을 때가 훨씬 많음(null이면 뉴스 카드 자체를 숨김).
  useEffect(() => {
    if (!session || !activeCode) {
      setStockNews(null);
      return;
    }
    getStockNews(session.id, activeCode).then(setStockNews);
  }, [session, activeCode]);

  const active = quotes.find((q) => q.stockCode === activeCode);
  const limitPrice = Number(limitPriceInput);
  const estimate = (orderType === 'LIMIT' && limitPrice > 0 ? limitPrice : active?.openPrice ?? 0) * quantity;
  const prevClose = historyPoints[historyPoints.length - 1]?.closePrice;
  const changePct = active && prevClose ? ((active.openPrice - prevClose) / prevClose) * 100 : 0;
  const sparklinePoints = active ? [...historyPoints.map((p) => p.closePrice), active.openPrice] : historyPoints.map((p) => p.closePrice);

  const holdingsList = computeHoldings(trades);
  const holdingsValue = holdingsList.reduce((sum, h) => {
    const price = quotes.find((q) => q.stockCode === h.stockCode)?.openPrice ?? h.avgPrice;
    return sum + price * h.quantity;
  }, 0);
  const portfolioValue = (session?.currentCash ?? 0) + holdingsValue;
  const borrowedAmount = session?.borrowedAmount ?? 0;
  // 담보비율 = (현금 + 보유종목 평가액) / 대출원금 — 백엔드 checkMarginCall과 동일한 계산.
  const collateralRatioPct = borrowedAmount > 0 ? (portfolioValue / borrowedAmount) * 100 : null;

  // 매매/턴진행 후 매매 내역을 다시 불러와서 새로 생긴 반대매매(FORCED_LIQUIDATION) 기록이
  // 있는지 diff — 서버가 담보비율 미달을 감지해서 강제로 판 경우 이 목록에 나타남.
  async function refreshAndDetectLiquidation(sessionId: string, prevTradeIds: Set<string>): Promise<TradeResponse[]> {
    const t = await listTrades(sessionId);
    setTrades(t);
    const newLiquidations = t.filter((tr) => tr.tradeType === 'FORCED_LIQUIDATION' && !prevTradeIds.has(tr.id));
    if (newLiquidations.length > 0) setLiquidationEvent(newLiquidations);
    return t;
  }

  async function executeTrade(side: 'BUY' | 'SELL', reason: string) {
    if (!session || !active) return;
    if (orderType === 'LIMIT' && !(limitPrice > 0)) {
      setActionResult({ type: 'error', message: '지정가를 입력해주세요' });
      return;
    }
    setActionResult(null);
    const prevTradeIds = new Set(trades.map((t) => t.id));
    try {
      const trade = await recordTrade(session.id, {
        stockCode: active.stockCode,
        side,
        orderType,
        limitPrice: orderType === 'LIMIT' ? limitPrice : undefined,
        quantity,
        isCredit: credit,
        leverageRatio: credit ? 1.5 : undefined,
        reasonText: reason,
      });
      const [s] = await Promise.all([getActiveSession(), refreshAndDetectLiquidation(session.id, prevTradeIds)]);
      if (s) setSession(s);
      setShowRisk(false);
      setPendingReason('');
      if (trade.filled) {
        setActionResult({
          type: 'success',
          message: `${active.stockName} ${quantity}주 ${side === 'BUY' ? '매수' : '매도'} 체결 · ${trade.price?.toLocaleString()}원`,
        });
      } else {
        setActionResult({
          type: 'warning',
          message: `지정가 ${limitPrice.toLocaleString()}원엔 체결되지 않았어요 — 오늘 그 가격은 오지 않았어요.`,
        });
      }
    } catch (e) {
      setActionResult({ type: 'error', message: e instanceof Error ? e.message : '매매에 실패했어요' });
      setShowRisk(false);
    }
  }

  // 매수 버튼을 누르면 먼저 KnowerBot이 채팅으로 다가와서 이유를 물어봄 — 답을 받은 뒤에야
  // 신용매수 위험도 체크(필요하면 경고 모달)로 넘어가고, 최종적으로 매매가 기록됨.
  // 온보딩에서 "위험한 조합"으로 진단된 사용자는 경고 버퍼를 더 크게 잡아 더 일찍 경고함.
  async function attemptBuy() {
    if (!session || !active || asking) return;
    if (orderType === 'LIMIT' && !(limitPrice > 0)) {
      setActionResult({ type: 'error', message: '지정가를 입력해주세요' });
      return;
    }
    setAsking(true);
    const reason = await askReason(`${active.stockName} ${quantity}주를 ${credit ? '신용으로 ' : ''}매수하려는 이유가 뭐예요?`);
    setAsking(false);
    if (!reason) {
      setActionResult({ type: 'warning', message: 'KnowerBot한테 이유를 말해줘야 매매가 진행돼요.' });
      return;
    }
    setPendingReason(reason);
    if (credit) {
      const positionValue = active.openPrice * quantity;
      const leverageRatio = 1.5;
      const marginRequired = positionValue / leverageRatio;
      const newBorrowed = borrowedAmount + (positionValue - marginRequired);
      const newEquity = session.currentCash - marginRequired + holdingsValue + positionValue;
      const expectedRatio = newBorrowed > 0 ? (newEquity / newBorrowed) * 100 : Infinity;
      const warningBufferPct = riskWarningText ? 40 : 20;
      if (expectedRatio < MAINTENANCE_RATIO * 100 + warningBufferPct) {
        setPendingRiskRatio(expectedRatio);
        setShowRisk(true);
        return;
      }
    }
    executeTrade('BUY', reason);
  }

  async function attemptSell() {
    if (!session || !active || asking) return;
    if (orderType === 'LIMIT' && !(limitPrice > 0)) {
      setActionResult({ type: 'error', message: '지정가를 입력해주세요' });
      return;
    }
    setAsking(true);
    const reason = await askReason(`${active.stockName} ${quantity}주를 매도하려는 이유가 뭐예요?`);
    setAsking(false);
    if (!reason) {
      setActionResult({ type: 'warning', message: 'KnowerBot한테 이유를 말해줘야 매매가 진행돼요.' });
      return;
    }
    executeTrade('SELL', reason);
  }

  // 이번 턴에 매매가 하나도 없었으면 KnowerBot이 관망 이유를 먼저 물어봄 — 있으면 그냥 다음 턴으로.
  async function handleAdvanceTurn() {
    if (!session || asking) return;
    const tradedThisTurn = trades.some((t) => t.turnNumber === session.turnCount);
    let holdReason: string | undefined;
    if (!tradedThisTurn) {
      setAsking(true);
      const reason = await askReason('이번 턴엔 매매가 없었네요. 왜 관망하기로 했어요?');
      setAsking(false);
      if (!reason) {
        setActionResult({ type: 'warning', message: 'KnowerBot한테 관망 이유를 말해줘야 다음 턴으로 넘어가요.' });
        return;
      }
      holdReason = reason;
    }
    setActionResult(null);
    const prevTradeIds = new Set(trades.map((t) => t.id));
    try {
      const s = await advanceTurn(session.id, turnUnitChoice, holdReason);
      await refreshAndDetectLiquidation(session.id, prevTradeIds);
      // 넘기려는 기간이 시세 데이터 범위를 벗어나면 백엔드가 에러 대신 세션을 바로
      // COMPLETED로 종료해서 돌려줌 — 이때는 다음 턴으로 안 넘어가고 종료 화면을 보여줌.
      if (s.status === 'COMPLETED') {
        setCompletedSummary({
          startingCash: s.startingCash,
          finalValue: portfolioValue,
          returnPct: ((portfolioValue - s.startingCash) / s.startingCash) * 100,
          reason: '더 이상 진행할 수 있는 시세 데이터가 없어서 스파링이 자동으로 종료됐어요.',
        });
        setSession(null);
        return;
      }
      setSession(s);
    } catch (e) {
      setActionResult({ type: 'error', message: e instanceof Error ? e.message : '더 이상 진행할 거래일이 없어요' });
    }
  }

  async function handleCompleteSession() {
    if (!session) return;
    setEnding(true);
    setActionResult(null);
    try {
      const startingCash = session.startingCash;
      const finalValue = portfolioValue;
      await completeSession(session.id);
      setCompletedSummary({
        startingCash,
        finalValue,
        returnPct: ((finalValue - startingCash) / startingCash) * 100,
      });
      setSession(null);
    } catch (e) {
      setActionResult({ type: 'error', message: e instanceof Error ? e.message : '세션을 종료하지 못했어요' });
    } finally {
      setEnding(false);
    }
  }

  function handleRestart() {
    setCompletedSummary(null);
    setNeedsStartDate(true);
    setStartDateChoice(availableDates[0] ?? '');
    setTrades([]);
    setQuotes([]);
    setActiveCode(null);
    setHistoryPoints([]);
  }

  if (loading) {
    return <div className="page">불러오는 중...</div>;
  }

  if (completedSummary) {
    const isGain = completedSummary.returnPct >= 0;
    return (
      <div style={{ maxWidth: 420, margin: '80px auto', padding: '0 24px' }}>
        <div className="result-card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h2 style={{ margin: '0 0 6px', fontSize: 19 }}>스파링이 끝났어요</h2>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>{completedSummary.reason ?? '이번 세션 결과예요.'}</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
            <strong style={{ fontSize: 30 }}>{Math.round(completedSummary.finalValue).toLocaleString()}원</strong>
            <span
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: isGain ? 'var(--red)' : 'var(--green)',
              }}
            >
              {isGain ? '+' : ''}
              {completedSummary.returnPct.toFixed(1)}%
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
            시작 자산 {completedSummary.startingCash.toLocaleString()}원 → 최종 자산{' '}
            {Math.round(completedSummary.finalValue).toLocaleString()}원 (현금 + 보유 종목 평가액)
          </p>
          <button onClick={handleRestart} className="btn btn-primary btn-block">
            새 세션 시작하기
          </button>
        </div>
      </div>
    );
  }

  if (needsStartDate) {
    return (
      <div style={{ maxWidth: 420, margin: '80px auto', padding: '0 24px' }}>
        <div className="result-card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h2 style={{ margin: '0 0 6px', fontSize: 19 }}>스파링 기간을 골라주세요</h2>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
              실제 시세 데이터 중 시작일과 종료일을 골라 그 기간 동안 모의투자를 진행해요. (최소 {MIN_RANGE_TRADING_DAYS}거래일)
            </p>
          </div>
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--red-chip)', color: 'var(--red)', fontSize: 13, fontWeight: 700 }}>
              {error}
            </div>
          )}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--soft)', marginBottom: 6 }}>시작일</label>
            <select
              value={startDateChoice}
              onChange={(e) => setStartDateChoice(e.target.value)}
              style={{ width: '100%', height: 44, borderRadius: 10, border: '1px solid var(--line)', padding: '0 12px', fontSize: 14 }}
            >
              {availableDates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--soft)', marginBottom: 6 }}>종료일</label>
            <select
              value={endDateChoice}
              onChange={(e) => setEndDateChoice(e.target.value)}
              disabled={validEndDates.length === 0}
              style={{ width: '100%', height: 44, borderRadius: 10, border: '1px solid var(--line)', padding: '0 12px', fontSize: 14 }}
            >
              {validEndDates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <button onClick={handleStartSession} disabled={starting || !startDateChoice || !endDateChoice} className="btn btn-primary btn-block">
            {starting ? '시작하는 중...' : '이 기간으로 시작하기'}
          </button>
        </div>
      </div>
    );
  }

  if (!session || !active) {
    return <div className="page">{error ?? '시세 데이터를 불러오지 못했어요'}</div>;
  }

  return (
    <div>
      <TopNav
        right={
          <>
            스파링 시즌 1 · 2020 급락장에서 살아남기
            <br />내 자산 {session.currentCash.toLocaleString()}원
          </>
        }
      />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 32px 90px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) 400px 280px', gap: 20 }}>
          {/* left: chart / news / stats */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="result-card" style={{ minHeight: 294 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <strong style={{ fontSize: 18 }}>{active.stockName}</strong>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{active.stockCode}</span>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', margin: '10px 0' }}>
                <strong style={{ fontSize: 30 }}>{active.openPrice.toLocaleString()}원</strong>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: changePct >= 0 ? 'var(--red)' : 'var(--green)',
                  }}
                >
                  {changePct >= 0 ? '+' : ''}
                  {changePct.toFixed(1)}%
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {session.turnCount}/{session.maxTurns}턴 · {session.currentTurnDate} 시가 · {session.targetEndDate}에 종료 예정
                </span>
              </div>
              <PriceChart
                points={historyPoints}
                todayOpenPrice={active.openPrice}
                todayDate={session.currentTurnDate}
                height={220}
              />
            </div>

            {stockNews && (
              <button
                onClick={() => setShowNews(true)}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  padding: '10px 12px',
                  background: 'var(--white)',
                  border: '1px solid var(--line)',
                  borderRadius: 12,
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
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
                <span style={{ fontSize: 13, color: 'var(--soft)', flex: 1 }}>{stockNews.headline}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>자세히 ›</span>
              </button>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                ['남은 현금', `${session.currentCash.toLocaleString()}원`, undefined],
                ['보유 종목', holdingsList.length > 0 ? `${holdingsList.length}종목` : '없음', undefined],
                ['빌린 돈', `${Math.round(borrowedAmount).toLocaleString()}원`, borrowedAmount > 0 ? 'var(--amber)' : undefined],
                [
                  '담보비율',
                  collateralRatioPct != null ? `${collateralRatioPct.toFixed(0)}%` : '해당 없음',
                  collateralRatioPct != null && collateralRatioPct < MAINTENANCE_RATIO * 100 + 20 ? 'var(--red)' : undefined,
                ],
              ].map(([label, value, color]) => (
                <div key={label} className="result-card" style={{ minHeight: 0, padding: 14 }}>
                  <small style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>
                    {label}
                  </small>
                  <strong style={{ fontSize: 14, color: color ?? 'var(--ink)' }}>{value}</strong>
                </div>
              ))}
            </div>

            <div className="result-card" style={{ minHeight: 0, padding: 16 }}>
              <h3 style={{ fontSize: 13, margin: '0 0 10px' }}>내 포트폴리오</h3>
              {holdingsList.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>아직 보유 중인 종목이 없어요.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', padding: '0 4px 8px', fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>
                    <span style={{ flex: 1.3 }}>종목</span>
                    <span style={{ flex: 0.8, textAlign: 'right' }}>수량</span>
                    <span style={{ flex: 1.2, textAlign: 'right' }}>평단가</span>
                    <span style={{ flex: 1.2, textAlign: 'right' }}>평가금액</span>
                    <span style={{ flex: 1, textAlign: 'right' }}>손익</span>
                  </div>
                  {holdingsList.map((h) => {
                    const currentPrice = quotes.find((q) => q.stockCode === h.stockCode)?.openPrice ?? h.avgPrice;
                    const pnlPct = ((currentPrice - h.avgPrice) / h.avgPrice) * 100;
                    return (
                      <div
                        key={h.stockCode}
                        style={{ display: 'flex', alignItems: 'center', padding: '10px 4px', borderTop: '1px solid var(--line)' }}
                      >
                        <span style={{ flex: 1.3, fontSize: 13, fontWeight: 700 }}>{h.stockName}</span>
                        <span style={{ flex: 0.8, textAlign: 'right', fontSize: 12, color: 'var(--soft)' }}>{h.quantity}주</span>
                        <span style={{ flex: 1.2, textAlign: 'right', fontSize: 12, color: 'var(--soft)' }}>
                          {Math.round(h.avgPrice).toLocaleString()}원
                        </span>
                        <span style={{ flex: 1.2, textAlign: 'right', fontSize: 12, color: 'var(--soft)' }}>
                          {Math.round(currentPrice * h.quantity).toLocaleString()}원
                        </span>
                        <span
                          style={{
                            flex: 1,
                            textAlign: 'right',
                            fontSize: 12,
                            fontWeight: 800,
                            color: pnlPct >= 0 ? 'var(--red)' : 'var(--green)',
                          }}
                        >
                          {pnlPct >= 0 ? '+' : ''}
                          {pnlPct.toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* middle: stock list / trade panel */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="result-card" style={{ minHeight: 0, padding: 14 }}>
              <h3 style={{ fontSize: 13, margin: '0 0 6px' }}>종목 리스트</h3>
              {quotes.map((q) => (
                <button
                  key={q.stockCode}
                  onClick={() => {
                    setActiveCode(q.stockCode);
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
                    background: q.stockCode === activeCode ? 'var(--green-chip)' : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13,
                      fontWeight: q.stockCode === activeCode ? 800 : 600,
                      color: q.stockCode === activeCode ? 'var(--green)' : 'var(--ink)',
                    }}
                  >
                    {q.stockName}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--soft)' }}>{q.openPrice.toLocaleString()}원</span>
                </button>
              ))}
            </div>

            <div className="result-card" style={{ minHeight: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h3 style={{ fontSize: 13, margin: 0 }}>{active.stockName} 주문</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['MARKET', 'LIMIT'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setOrderType(t)}
                    className="btn btn-sm"
                    style={{
                      flex: 1,
                      background: orderType === t ? 'var(--green-chip)' : 'var(--white)',
                      color: orderType === t ? 'var(--green)' : 'var(--soft)',
                      border: `1px solid ${orderType === t ? 'transparent' : 'var(--line)'}`,
                      fontWeight: orderType === t ? 800 : 600,
                    }}
                  >
                    {t === 'MARKET' ? '시장가' : '지정가'}
                  </button>
                ))}
              </div>
              {orderType === 'LIMIT' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>희망 가격</span>
                  <input
                    type="number"
                    value={limitPriceInput}
                    onChange={(e) => setLimitPriceInput(e.target.value)}
                    placeholder={`예: ${active.openPrice.toLocaleString()}`}
                    style={{
                      width: 160,
                      height: 36,
                      borderRadius: 8,
                      border: '1px solid var(--line)',
                      padding: '0 10px',
                      fontSize: 13,
                      textAlign: 'right',
                    }}
                  />
                </div>
              )}
              {orderType === 'LIMIT' && (
                <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>
                  오늘 저가~고가 범위 안이면 그 가격에 체결돼요. 범위는 매매를 시도하기 전엔 안 보여줘요 — 실제 지정가 주문처럼요.
                </p>
              )}
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
                예상 금액 {estimate.toLocaleString()}원 ({orderType === 'MARKET' ? '시장가 · 시가 기준' : '지정가 기준(체결 안 될 수 있음)'}) · 신용거래 시 1.5배 표기
              </p>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>
                매수·매도 버튼을 누르면 KnowerBot이 다가와서 이유를 물어봐요 — 채팅으로 답해주세요.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={attemptBuy} disabled={asking} className="btn btn-primary btn-sm" style={{ flex: 1 }}>
                  매수
                </button>
                <button
                  onClick={attemptSell}
                  disabled={asking}
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
                <select
                  value={turnUnitChoice}
                  onChange={(e) => setTurnUnitChoice(e.target.value as TurnUnit)}
                  disabled={asking || session.turnCount >= session.maxTurns}
                  style={{ height: 34, borderRadius: 8, border: '1px solid var(--line)', padding: '0 8px', fontSize: 12 }}
                  title="다음 턴까지 흐를 기간"
                >
                  {(Object.keys(TURN_UNIT_LABELS) as TurnUnit[]).map((unit) => (
                    <option key={unit} value={unit}>
                      {TURN_UNIT_LABELS[unit]}씩
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAdvanceTurn}
                  disabled={asking || session.turnCount >= session.maxTurns}
                  className="btn btn-sm btn-secondary"
                  style={{ flex: 1 }}
                >
                  다음 턴
                </button>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>
                {session.turnCount >= session.maxTurns
                  ? '최대 턴에 도달했어요 — 시뮬레이션을 종료하고 리포트를 확인해보세요.'
                  : '이번 턴에 매매 없이 다음 턴으로 넘어가면 KnowerBot이 관망 이유를 물어봐요.'}
              </p>
              <button
                onClick={handleCompleteSession}
                disabled={ending}
                className="btn btn-sm"
                style={{ background: 'transparent', color: 'var(--red)', border: '1px solid var(--red-chip)' }}
              >
                {ending ? '종료하는 중...' : '시뮬레이션 종료'}
              </button>
            </div>
          </section>

          {/* right: ranking (아직 mock — 랭킹 API 미구현) */}
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
        <StockDetailModal
          stockName={active.stockName}
          stockCode={active.stockCode}
          price={active.openPrice}
          changePct={changePct}
          chart={sparklinePoints}
          onClose={() => setShowDetail(false)}
        />
      )}
      {showNews && stockNews && <NewsDetailModal news={stockNews} onClose={() => setShowNews(false)} />}
      {showRisk && (
        <RiskInterventionModal
          quantity={`${quantity}주`}
          expectedRatioPct={pendingRiskRatio}
          diagnosisWarning={riskWarningText}
          onCancel={() => setShowRisk(false)}
          onProceed={() => executeTrade('BUY', pendingReason)}
        />
      )}
      {liquidationEvent && (
        <ForcedLiquidationModal trades={liquidationEvent} onClose={() => setLiquidationEvent(null)} />
      )}
      {actionResult && <ActionResultModal result={actionResult} onClose={() => setActionResult(null)} />}
    </div>
  );
}

function ActionResultModal({
  result,
  onClose,
}: {
  result: { type: 'success' | 'warning' | 'error'; message: string };
  onClose: () => void;
}) {
  const palette = {
    success: { bg: 'var(--green-chip)', color: 'var(--green)', icon: '✓' },
    warning: { bg: 'var(--amber-chip)', color: 'var(--amber)', icon: '!' },
    error: { bg: 'var(--red-chip)', color: 'var(--red)', icon: '✕' },
  }[result.type];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        background: 'rgba(13, 18, 10, 0.55)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(380px, 100%)',
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
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            background: palette.bg,
            color: palette.color,
            display: 'grid',
            placeItems: 'center',
            fontSize: 20,
            fontWeight: 800,
          }}
        >
          {palette.icon}
        </span>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, fontWeight: 700 }}>{result.message}</p>
        <button onClick={onClose} className="btn btn-primary btn-block">
          확인
        </button>
      </div>
    </div>
  );
}

function NewsDetailModal({ news, onClose }: { news: StockNewsResponse; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        background: 'rgba(13, 18, 10, 0.55)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(420px, 100%)',
          background: 'var(--white)',
          borderRadius: 20,
          padding: 28,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          boxShadow: '0 24px 60px rgba(13, 18, 10, 0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <span
          style={{
            alignSelf: 'flex-start',
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
        <h3 style={{ margin: 0, fontSize: 17, lineHeight: 1.4 }}>{news.headline}</h3>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: 'var(--soft)' }}>{news.summary}</p>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {news.tradeDate} · {news.source}
        </span>
        <button onClick={onClose} className="btn btn-primary btn-block">
          확인
        </button>
      </div>
    </div>
  );
}

// 가격/차트는 실제 데이터, 시가총액·PER·재무제표 등은 아직 mock (OpenDART 연동 전).
function StockDetailModal({
  stockName,
  stockCode,
  price,
  changePct,
  chart,
  onClose,
}: {
  stockName: string;
  stockCode: string;
  price: number;
  changePct: number;
  chart: number[];
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
            <h2 style={{ margin: 0, fontSize: 20 }}>{stockName}</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>{stockCode}</p>
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
          <strong style={{ fontSize: 30 }}>{price.toLocaleString()}원</strong>
          <span
            style={{
              fontSize: 13,
              fontWeight: 800,
              padding: '3px 8px',
              borderRadius: 999,
              background: changePct >= 0 ? 'var(--red-chip)' : 'var(--green-chip)',
              color: changePct >= 0 ? 'var(--red)' : 'var(--green)',
            }}
          >
            {changePct >= 0 ? '+' : ''}
            {changePct.toFixed(1)}%
          </span>
        </div>

        <div style={{ height: 110, background: 'var(--red-chip)', borderRadius: 12 }}>
          <Sparkline points={chart} color="var(--red)" />
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
  expectedRatioPct,
  diagnosisWarning,
  onCancel,
  onProceed,
}: {
  quantity: string;
  expectedRatioPct: number | null;
  diagnosisWarning: string | null;
  onCancel: () => void;
  onProceed: () => void;
}) {
  const ratioLabel = expectedRatioPct != null && Number.isFinite(expectedRatioPct) ? `${expectedRatioPct.toFixed(0)}%` : riskIntervention.expectedRatio;
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
          지금 신용매수 {quantity}를 진행하면 담보비율이 {ratioLabel}까지
          떨어져요. {riskIntervention.liquidationThreshold} 아래로 내려가면 — 내 의사와 상관없이
          반대매매가 발생할 수 있어요.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            ['예상 담보비율', ratioLabel, 'var(--red)'],
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
        {diagnosisWarning && (
          <div style={{ background: 'var(--red-chip)', borderRadius: 10, padding: '12px 14px' }}>
            <small style={{ display: 'block', fontSize: 11, color: 'var(--red)', fontWeight: 800, marginBottom: 4 }}>
              사전 조사 진단 기준
            </small>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--red)', lineHeight: 1.5, fontWeight: 600 }}>{diagnosisWarning}</p>
          </div>
        )}
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

// 담보비율이 140% 밑으로 떨어져서 서버가 보유 종목을 강제로 전부 판 경우 뜨는 모달 —
// 매수/매도 실패 알림과는 결이 달라서 별도 컴포넌트로 분리(더 무겁고 경고성 강한 톤).
function ForcedLiquidationModal({ trades, onClose }: { trades: TradeResponse[]; onClose: () => void }) {
  const totalProceeds = trades.reduce((sum, t) => sum + (t.price ?? 0) * (t.quantity ?? 0), 0);
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(80, 10, 10, 0.6)',
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
          boxShadow: '0 24px 60px rgba(80, 10, 10, 0.35)',
          border: '2px solid var(--red)',
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              background: 'var(--red)',
              color: 'var(--white)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 18,
              fontWeight: 800,
            }}
          >
            ⚠
          </span>
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--red)' }}>반대매매 발생</span>
        </div>
        <h2 style={{ margin: 0, fontSize: 22 }}>담보비율 미달로 강제 매도됐어요</h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--soft)', lineHeight: 1.6 }}>
          신용으로 빌린 돈에 비해 보유 자산 가치가 {(MAINTENANCE_RATIO * 100).toFixed(0)}% 아래로
          떨어져서, 내 의사와 상관없이 보유 종목이 전부 그날 시가로 팔렸어요. 실전 계좌였다면 똑같은
          일이 일어났을 거예요.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {trades.map((t) => (
            <div
              key={t.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 13,
                padding: '8px 12px',
                background: 'var(--red-chip)',
                borderRadius: 8,
              }}
            >
              <span style={{ fontWeight: 700 }}>{t.stockName}</span>
              <span style={{ color: 'var(--soft)' }}>
                {t.quantity}주 · {t.price?.toLocaleString()}원
              </span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800, padding: '4px 12px' }}>
            <span>총 회수 금액</span>
            <span>{Math.round(totalProceeds).toLocaleString()}원</span>
          </div>
        </div>
        <button onClick={onClose} className="btn btn-primary btn-block">
          확인했어요
        </button>
      </div>
    </div>
  );
}
