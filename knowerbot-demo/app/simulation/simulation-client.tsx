'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import TopNav from '../../components/TopNav';
import PriceChart from '../../components/PriceChart';
import RewindChart from '../../components/RewindChart';
import LoginButton from '../../components/LoginButton';
import { stockDetail, riskIntervention } from '../../lib/mock-data';
import {
  getActiveSession,
  getAvailableTradingDates,
  createSession,
  getQuotes,
  getStockHistory,
  getSessionNews,
  getStockDisclosures,
  recordTrade,
  listTrades,
  advanceTurn,
  completeSession,
  repayDebt,
  getSessionStats,
  generateRiskWarning,
  type SessionResponse,
  type QuoteResponse,
  type TradeResponse,
  type TurnUnit,
  type PricePoint,
  type StockNewsItemResponse,
  type StockDisclosureResponse,
  type SessionStatScoreResponse,
} from '../../lib/simulation-api';
import { SESSION_STAT_LABELS } from '../../lib/user-api';
import { getMyInvestorProfile, type InvestorProfileResponse } from '../../lib/onboarding-api';
import { warningFor } from '../../lib/onboarding-copy';
import {
  generateQuizForSession,
  submitQuizAnswer,
  type PersonalizedQuizResponse,
  type QuizAnswerResponse,
} from '../../lib/quiz-api';

const TURN_UNIT_LABELS: Record<TurnUnit, string> = { DAY: '하루', WEEK: '일주일', MONTH: '한달' };

// 이유 메모 최소 길이. 한두 글자짜리 메모는 행동 리포트에서 쓸 수가 없어서 최소한만 강제한다.
const MIN_REASON_LENGTH = 5;

// 받침 유무에 따라 이/가를 고름 — "하루가 지났어요" / "일주일이 지났어요".
// 턴 단위 라벨이 3개뿐이라 표로 박아도 되지만, 라벨이 늘어나도 안 깨지게 계산으로 둔다.
function subjectParticle(word: string): string {
  const last = word.charCodeAt(word.length - 1);
  const isHangul = last >= 0xac00 && last <= 0xd7a3;
  if (!isHangul) return '가';
  return (last - 0xac00) % 28 > 0 ? '이' : '가';
}

// 턴 전환 애니메이션(아래 playTurnTransition 참고) 관련 상수 — 이번 턴에 새로 늘어난 구간이
// 세션 시작부터의 전체 히스토리 축척에 묻히지 않도록, 최근 구간만 잘라서 보여줌.
const TURN_TRANSITION_MS = 900;
const TURN_TRANSITION_WINDOW = 20;

// 선택적 신용거래(useCredit) 시 매수금액의 최소 이 비율을 미수로 돌림 — 백엔드
// CREDIT_MIN_BORROW_RATIO와 동일(현금 60%+미수 40%, 회의 결정).
const CREDIT_MIN_BORROW_RATIO = 0.4;

// 미수금 상환 기한(발생 턴 + 이 턴 수) — 백엔드 SimulationService.DEBT_REPAY_TURN_LIMIT과 동일.
const DEBT_REPAY_TURN_LIMIT = 3;

declare global {
  interface Window {
    knowerbotAskReason?: (question: string) => Promise<string>;
    knowerbotRequireLogin?: () => void;
  }
}

// 매매 이유는 이 화면 안의 메모창으로 받는다.
// 예전엔 KnowerBot이 채팅으로 물어보고 답을 기다렸는데(window.knowerbotAskReason),
// 매매할 때마다 3D 로봇이 걸어와 채팅으로 대화해야 해서 흐름이 끊긴다는 피드백이 있었다.
// 그 자리에서 메모로 바로 입력하는 방식이다.
// 이유를 남기는 것 자체는 그대로다 — 행동 리포트가 이 텍스트를 재료로 쓴다.

// knowerbot-runtime.js는 <Script strategy="afterInteractive">라 이 컴포넌트가 먼저
// 마운트될 수 있음 — window.knowerbotRequireLogin이 아직 없으면 뜰 때까지 잠깐 재시도.
function notifyKnowerbotLoginRequired() {
  let attempts = 0;
  const tryNotify = () => {
    if (typeof window.knowerbotRequireLogin === 'function') {
      window.knowerbotRequireLogin();
      return;
    }
    attempts += 1;
    if (attempts < 20) window.setTimeout(tryNotify, 200);
  };
  tryNotify();
}

// 로그인 안 한 상태로 /simulation에 왔을 때 보여주는 소개 카드 4개 — 랜딩 페이지의
// features 카드 그리드와 같은 스타일(.card-grid/.card)을 재사용해서 빈 화면 대신
// 이 페이지에서 실제로 뭘 할 수 있는지 미리 보여줌.
const EXAM_LOGIN_FEATURES = [
  { icon: '1', title: '실제 시세 연동', desc: '삼성전자·SK하이닉스 등 실제 종목의 최근 1년 시세로 진짜 같은 매매를 연습해요.' },
  { icon: '2', title: '공시·뉴스·차트로 판단', desc: 'DART 공시 요약과 종목 뉴스, 차트를 근거로 매매를 판단하는 습관을 길러요.' },
  { icon: '3', title: '미수거래 체험', desc: '현금보다 큰 매수(미수)와 반대매매를 모의로 먼저 겪어보고, 진짜 계좌에서 무너지지 않는 법을 배워요.' },
  { icon: '4', title: 'AI 코치 채점', desc: '세션이 끝나면 AI가 판단 정확도·리스크 관리 등 8개 지표를 직접 채점해줘요.' },
];

const STARTING_CASH = 100_000_000; // 회의 결정: 1억으로 시작
const MAINTENANCE_RATIO = 1.4; // 담보 유지비율 140% — 백엔드 SimulationService와 동일 기준
// 시작일~종료일 사이 최소 거래일수 — 백엔드 SimulationService.MIN_START_DATE_RANGE_DAYS(=MAX_TURNS)와 동일.
// 여긴 종료일 드롭다운 후보를 미리 걸러내는 용도일 뿐, 실제 검증은 서버가 다시 함.
const MIN_RANGE_TRADING_DAYS = 10; // 백엔드 MIN_START_DATE_RANGE_DAYS(= MAX_TURNS)와 동일하게 유지

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
  const [turnAnimation, setTurnAnimation] = useState<{ prices: number[]; visibleCount: number } | null>(null);
  // 턴 넘기기 직전 종가를 담아두는 ref — historyPoints 재조회 effect가 이 값이 채워져 있으면
  // "턴 전환으로 새로 불러온 것"으로 판단해 playTurnTransition 애니메이션을 튼다.
  const pendingTurnPrevCloseRef = useRef<number[] | null>(null);
  // 지금 보는 종목 하나가 아니라 세션의 모든 종목을 통틀어 최근 뉴스를 모은 "뉴스 섹터".
  const [sessionNews, setSessionNews] = useState<StockNewsItemResponse[]>([]);
  const [selectedNews, setSelectedNews] = useState<StockNewsItemResponse | null>(null);

  const [quantity, setQuantity] = useState(10);
  // 켜두면 현금이 충분해도 이번 매수금액의 최소 CREDIT_MIN_BORROW_RATIO(40%)를 미수(빌린 돈)로
  // 돌림 — 현금 60%+미수 40%로 같은 현금으로 더 살 수 있는 선택적 신용거래.
  // 꺼두면 기존처럼 현금 초과분만 자동으로 미수가 됨.
  const [useCredit, setUseCredit] = useState(false);
  // 턴 전환 연출("하루가 지났어요") — 잠깐 떴다가 스스로 사라지는 팝업.
  const [turnFlash, setTurnFlash] = useState<{ turn: number; date: string; unit: TurnUnit } | null>(null);
  const [pendingReason, setPendingReason] = useState('');
  const [asking, setAsking] = useState(false);
  // 메모창 상태 — resolve를 들고 있다가 사용자가 확인/취소하면 askReason의 프라미스를 푼다.
  const [reasonPrompt, setReasonPrompt] = useState<{
    question: string;
    resolve: (value: string | null) => void;
  } | null>(null);
  const [reasonDraft, setReasonDraft] = useState('');
  const [showRisk, setShowRisk] = useState(false);
  const [pendingRiskRatio, setPendingRiskRatio] = useState<number | null>(null);
  // AI가 만드는 위험 경고 문구 — 담보비율 계산이 끝나자마자(모달을 띄우는 시점에) 같이
  // 요청함. 로딩 중이거나 실패하면 모달 쪽에서 원래 있던 고정 문구로 대체함.
  const [riskWarningMessage, setRiskWarningMessage] = useState<string | null>(null);
  const [riskWarningLoading, setRiskWarningLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);
  const [liquidationEvent, setLiquidationEvent] = useState<TradeResponse[] | null>(null);
  const [completedSummary, setCompletedSummary] = useState<
    { sessionId: string; startingCash: number; finalValue: number; returnPct: number; reason?: string; stats?: SessionStatScoreResponse[] } | null
  >(null);
  const [ending, setEnding] = useState(false);
  const [repaying, setRepaying] = useState(false);
  // 세션이 끝나자마자 그 세션 "단독" 스탯 결과로만 문제 하나를 뽑아서 종료 화면에 바로 보여줌
  // (오늘의 PT처럼 유저 전체 평균이 아니라 방금 끝난 세션 결과만 봄).
  const [sessionQuiz, setSessionQuiz] = useState<PersonalizedQuizResponse | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [quizSelectedOptionId, setQuizSelectedOptionId] = useState<string | null>(null);
  const [quizResult, setQuizResult] = useState<QuizAnswerResponse | null>(null);
  const [quizSubmitting, setQuizSubmitting] = useState(false);

  async function loadSessionQuiz(sessionId: string) {
    setQuizLoading(true);
    setQuizError(null);
    setSessionQuiz(null);
    setQuizSelectedOptionId(null);
    setQuizResult(null);
    try {
      setSessionQuiz(await generateQuizForSession(sessionId));
    } catch (e) {
      setQuizError(e instanceof Error ? e.message : '문제를 만들지 못했어요');
    } finally {
      setQuizLoading(false);
    }
  }

  async function handleQuizSelect(optionId: string) {
    if (!sessionQuiz || quizResult || quizSubmitting) return;
    setQuizSelectedOptionId(optionId);
    setQuizSubmitting(true);
    try {
      setQuizResult(await submitQuizAnswer(sessionQuiz.id, optionId));
    } catch (e) {
      setQuizError(e instanceof Error ? e.message : '채점하지 못했어요');
    } finally {
      setQuizSubmitting(false);
    }
  }
  const [profile, setProfile] = useState<InvestorProfileResponse | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  // 공시 요약 패널 — "열어본" 행동 자체가 공시 확인율 스탯의 원천이라, 자동으로 펼쳐두지
  // 않고 사용자가 직접 열게 한다. 연 기록은 종목+턴 단위로 남겨서 매매 기록에 붙는다.
  const [disclosure, setDisclosure] = useState<StockDisclosureResponse | null>(null);
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [viewedDisclosureKeys, setViewedDisclosureKeys] = useState<Set<string>>(new Set());

  // 진행 중인 세션 있으면 이어가고, 없으면 시작 날짜를 고르게 함(자동 시작 안 함)
  useEffect(() => {
    // knowerbot-runtime.js가 아직 안 떠서 document.body 클래스가 안 붙어있어도 이건 항상
    // 바로 읽을 수 있음(로그인 처리 자체가 이 localStorage 키를 기준으로 이뤄져서) — 로그인
    // 안 한 상태로 이 API 호출들을 시도해서 401→강제 리다이렉트로 새는 걸 미리 막음.
    let loggedInNow = false;
    try {
      loggedInNow = localStorage.getItem('kg_logged_in') === '1';
    } catch (e) {}
    if (!loggedInNow) {
      setLoading(false);
      setNeedsLogin(true);
      notifyKnowerbotLoginRequired();
      return;
    }
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
    // 온보딩 진단 결과 — 미수 매수 경고 강도를 성향별로 차등하는 데 씀. 미진단이면 null(차등 없음).
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

  // 선택 종목 또는 턴이 바뀌면 차트(어제까지의 OHLC)도 다시 불러옴 — 턴 전환으로 불러온
  // 거면(pendingTurnPrevCloseRef가 채워져있으면) 새로 늘어난 구간만 애니메이션으로 보여줌.
  useEffect(() => {
    if (!session || !activeCode) return;
    getStockHistory(session.id, activeCode).then((h) => {
      const prevClosePrices = pendingTurnPrevCloseRef.current;
      pendingTurnPrevCloseRef.current = null;
      setHistoryPoints(h.points);
      if (prevClosePrices && h.points.length > prevClosePrices.length) {
        playTurnTransition(
          prevClosePrices,
          h.points.map((p) => p.closePrice),
        );
      }
    });
  }, [session, activeCode]);

  // 턴을 넘기면 그 사이 건너뛴 거래일들의 종가가 한 번에 화면에 나타나는데, 그걸 순간이동처럼
  // 뚝 바뀌는 대신 RewindChart로 이어그려서 보여줌. 세션 시작부터의 전체 히스토리를 다 넣으면
  // 축척상 이번 턴 구간이 너무 작아 보이므로, 직전 맥락 TURN_TRANSITION_WINDOW개 + 새로
  // 늘어난 구간만 잘라서 씀.
  function playTurnTransition(prevClosePrices: number[], newClosePrices: number[]) {
    const startIdx = Math.max(0, prevClosePrices.length - TURN_TRANSITION_WINDOW);
    const windowPrices = newClosePrices.slice(startIdx);
    const startCount = prevClosePrices.length - startIdx;
    const totalCount = windowPrices.length;
    setTurnAnimation({ prices: windowPrices, visibleCount: startCount });
    let i = startCount;
    const stepMs = TURN_TRANSITION_MS / Math.max(1, totalCount - startCount);
    const timer = window.setInterval(() => {
      i += 1;
      setTurnAnimation({ prices: windowPrices, visibleCount: Math.min(i, totalCount) });
      if (i >= totalCount) {
        window.clearInterval(timer);
        window.setTimeout(() => setTurnAnimation(null), 500);
      }
    }, stepMs);
  }

  // 턴이 바뀌면 세션의 모든 종목을 통틀어 최근 뉴스(고정 데이터)도 다시 불러옴 — 종목
  // 하나로 한정하면 뉴스가 있는 날을 만나기가 너무 드물어서, 지금 보는 종목과 상관없이
  // 세션 전체 기준으로 모음(뉴스 섹터).
  useEffect(() => {
    if (!session) {
      setSessionNews([]);
      return;
    }
    getSessionNews(session.id).then(setSessionNews);
  }, [session]);

  // 턴 전환 연출은 잠깐만 띄우고 스스로 사라진다.
  useEffect(() => {
    if (!turnFlash) return;
    const timer = window.setTimeout(() => setTurnFlash(null), 1300);
    return () => window.clearTimeout(timer);
  }, [turnFlash]);

  // 종목이나 턴이 바뀌면 공시 패널을 다시 접는다 — "이 종목의 공시를 이번 턴에 확인했는지"를
  // 매번 새로 판단하게 하려는 것. 이미 열어본 종목+턴이면 내용은 캐시 없이 다시 불러온다.
  useEffect(() => {
    setDisclosure(null);
    setDisclosureOpen(false);
  }, [session?.turnCount, activeCode]);

  async function openDisclosure() {
    if (!session || !activeCode) return;
    setDisclosureOpen(true);
    setViewedDisclosureKeys((prev) => new Set(prev).add(`${activeCode}:${session.turnCount}`));
    try {
      setDisclosure(await getStockDisclosures(session.id, activeCode));
    } catch (e) {
      setDisclosure({ stockCode: activeCode, items: [] });
    }
  }

  const active = quotes.find((q) => q.stockCode === activeCode);
  const estimate = (active?.openPrice ?? 0) * quantity;
  // 주문 패널에 미리 보여줄 현금/미수 분담 미리보기 — attemptBuy의 실제 계산과 동일한 규칙.
  const shortfallPreview = useCredit
    ? Math.max(estimate * CREDIT_MIN_BORROW_RATIO, Math.max(0, estimate - (session?.currentCash ?? 0)))
    : Math.max(0, estimate - (session?.currentCash ?? 0));
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
  // 주문 도우미 — 현재 종목 기준 "얼마나 살 수 있고, 얼마나 들고 있는지".
  // 신용 최대치는 서버 검증과 같은 식: 매수 직후 담보비율 (보유평가+현금잔여+포지션)/(미수)가
  // 140% 아래로 떨어지지 않는 최대 금액. V ≤ (H + 1.4·현금 − 1.4·미수) / 0.4
  const activePrice = active?.openPrice ?? 0;
  const cashOnlyQty = activePrice > 0 && session ? Math.floor(session.currentCash / activePrice) : 0;
  const maxBuyValue = session
    ? Math.max(session.currentCash, (holdingsValue + 1.4 * session.currentCash - 1.4 * borrowedAmount) / 0.4)
    : 0;
  const maxBuyQty = activePrice > 0 ? Math.floor(maxBuyValue / activePrice) : 0;
  const ownedQty = holdingsList.find((h) => h.stockCode === activeCode)?.quantity ?? 0;

  // 미수금 상환 기한 — 백엔드가 내려준 기한 턴 기준. 남은 턴이 음수면 이미 기한 초과.
  const debtTurnsLeft =
    session && session.debtDeadlineTurn != null && borrowedAmount > 0 ? session.debtDeadlineTurn - session.turnCount : null;

  // 진행률 프로그래스바용 — 모의고사는 "턴"과 "기간(종료 예정일)" 중 먼저 끝나는 쪽에서
  // 종료됨(일주일/한달씩 건너뛰면 턴이 남아도 기간이 먼저 바닥날 수 있음). 둘 다 보여줘서
  // "턴이 남았는데 왜 못 넘기지?"라는 혼란을 없앰.
  const DAY_MS = 24 * 60 * 60 * 1000;
  const periodTotalDays = session
    ? Math.max(1, Math.round((Date.parse(session.targetEndDate) - Date.parse(session.startTurnDate)) / DAY_MS))
    : 0;
  const periodPassedDays = session
    ? Math.min(periodTotalDays, Math.max(0, Math.round((Date.parse(session.currentTurnDate) - Date.parse(session.startTurnDate)) / DAY_MS)))
    : 0;
  const periodLeftDays = periodTotalDays - periodPassedDays;
  const turnPct = session ? (session.turnCount / session.maxTurns) * 100 : 0;
  const periodPct = session ? (periodPassedDays / periodTotalDays) * 100 : 0;

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
    setActionResult(null);
    const prevTradeIds = new Set(trades.map((t) => t.id));
    try {
      const trade = await recordTrade(session.id, {
        stockCode: active.stockCode,
        side,
        quantity,
        // 이번 턴에 이 종목의 공시 요약 패널을 열어봤는지 — 공시 확인율 스탯의 원천.
        viewedDisclosure: viewedDisclosureKeys.has(`${active.stockCode}:${session.turnCount}`),
        useCredit: side === 'BUY' ? useCredit : undefined,
        reasonText: reason,
      });
      const [s] = await Promise.all([getActiveSession(), refreshAndDetectLiquidation(session.id, prevTradeIds)]);
      if (s) setSession(s);
      setShowRisk(false);
      setPendingReason('');
      setActionResult({
        type: 'success',
        message: `${active.stockName} ${quantity}주 ${side === 'BUY' ? '매수' : '매도'} 체결 · ${trade.price?.toLocaleString()}원`,
      });
    } catch (e) {
      setActionResult({ type: 'error', message: e instanceof Error ? e.message : '매매에 실패했어요' });
      setShowRisk(false);
    }
  }

  // 메모창을 띄우고 사용자가 확인할 때까지 기다린다. 호출부는 예전 채팅 버전과 똑같이
  // `const reason = await askReason(...)`로 쓰면 되고, 취소하면 null이 온다.
  function askReason(question: string): Promise<string | null> {
    setReasonDraft('');
    return new Promise((resolve) => setReasonPrompt({ question, resolve }));
  }

  function submitReason() {
    if (reasonDraft.trim().length < MIN_REASON_LENGTH) return;
    reasonPrompt?.resolve(reasonDraft.trim());
    setReasonPrompt(null);
  }

  function cancelReason() {
    reasonPrompt?.resolve(null);
    setReasonPrompt(null);
  }

  // 매수 버튼을 누르면 먼저 이유를 적는 메모창이 뜸 — 이유를 남긴 뒤에야
  // 미수 매수 위험도 체크(필요하면 경고 모달)로 넘어가고, 최종적으로 매매가 기록됨.
  // 온보딩에서 "위험한 조합"으로 진단된 사용자는 경고 버퍼를 더 크게 잡아 더 일찍 경고함.
  async function attemptBuy() {
    if (!session || !active || asking) return;
    if (quantity < 1) {
      setActionResult({ type: 'warning', message: '수량을 1주 이상 입력해주세요.' });
      return;
    }
    // 매수 한도 — 신용거래를 안 켰으면 현금까지만, 켰으면 담보비율(140%) 한도까지.
    if (!useCredit && quantity > cashOnlyQty) {
      setActionResult({
        type: 'warning',
        message: `현금으로는 ${cashOnlyQty.toLocaleString()}주까지 살 수 있어요. 더 사려면 신용거래를 켜주세요 (신용 포함 최대 ${maxBuyQty.toLocaleString()}주).`,
      });
      return;
    }
    if (useCredit && quantity > maxBuyQty) {
      setActionResult({
        type: 'warning',
        message: `신용을 포함해도 최대 ${maxBuyQty.toLocaleString()}주까지예요 — 담보비율 140% 아래로 내려가는 매수는 안 돼요.`,
      });
      return;
    }
    setAsking(true);
    const shortfall = shortfallPreview;
    const reason = await askReason(
      `${active.stockName} ${quantity}주를 ${shortfall > 0 ? '미수(빌린 돈)까지 써서 ' : ''}매수하려는 이유가 뭐예요?`,
    );
    setAsking(false);
    if (!reason) {
      setActionResult({ type: 'warning', message: '이유를 남겨야 매매가 진행돼요.' });
      return;
    }
    setPendingReason(reason);
    // 현금보다 큰 매수 = 부족분이 자동으로 미수(빌린 돈)로 잡힘(서버와 같은 계산).
    // 매수 직후 예상 담보비율이 유지비율에 가까우면 위험 개입 모달을 먼저 보여줌 —
    // 온보딩에서 "위험한 조합"으로 진단된 사용자는 경고 버퍼를 더 크게 잡아 더 일찍 경고함.
    if (shortfall > 0) {
      const cashPaid = estimate - shortfall;
      const cashAfter = Math.max(0, session.currentCash - cashPaid);
      const newBorrowed = borrowedAmount + shortfall;
      const newEquity = cashAfter + holdingsValue + estimate;
      const expectedRatio = newBorrowed > 0 ? (newEquity / newBorrowed) * 100 : Infinity;
      const warningBufferPct = riskWarningText ? 40 : 20;
      if (expectedRatio < MAINTENANCE_RATIO * 100 + warningBufferPct) {
        setPendingRiskRatio(expectedRatio);
        setShowRisk(true);
        // 미수 자동발생 구조라 고정 레버리지 배수가 없음 — 포지션 금액/자기자본 비율을 실효 배수로 넘김.
        const effectiveLeverage = estimate / Math.max(1, estimate - shortfall);
        loadRiskWarning(active.stockName, quantity, Number(effectiveLeverage.toFixed(2)), expectedRatio, reason);
        return;
      }
    }
    executeTrade('BUY', reason);
  }

  // 담보비율 계산이 끝나 경고 모달을 띄우는 시점에 같이 호출 — 실패하면 null로 남겨서
  // 모달이 원래 있던 고정 문구로 대체하게 함(RiskInterventionModal 참고).
  async function loadRiskWarning(
    stockName: string,
    qty: number,
    leverageRatio: number,
    expectedRatio: number,
    reasonText: string,
  ) {
    if (!session) return;
    setRiskWarningMessage(null);
    setRiskWarningLoading(true);
    try {
      const res = await generateRiskWarning(session.id, {
        stockName,
        quantity: qty,
        leverageRatio,
        expectedCollateralRatioPct: Math.round(expectedRatio),
        liquidationThresholdPct: MAINTENANCE_RATIO * 100,
        reasonText,
        diagnosisWarning: riskWarningText,
      });
      setRiskWarningMessage(res.message);
    } catch (e) {
      setRiskWarningMessage(null);
    } finally {
      setRiskWarningLoading(false);
    }
  }

  async function attemptSell() {
    if (!session || !active || asking) return;
    if (quantity < 1) {
      setActionResult({ type: 'warning', message: '수량을 1주 이상 입력해주세요.' });
      return;
    }
    // 매도 한도 — 이 종목 보유 수량까지만.
    if (quantity > ownedQty) {
      setActionResult({
        type: 'warning',
        message: ownedQty > 0
          ? `${active.stockName}은(는) ${ownedQty.toLocaleString()}주 보유 중이에요 — 그만큼만 팔 수 있어요.`
          : `${active.stockName}을(를) 보유하고 있지 않아 매도할 수 없어요.`,
      });
      return;
    }
    setAsking(true);
    const reason = await askReason(`${active.stockName} ${quantity}주를 매도하려는 이유가 뭐예요?`);
    setAsking(false);
    if (!reason) {
      setActionResult({ type: 'warning', message: '이유를 남겨야 매매가 진행돼요.' });
      return;
    }
    executeTrade('SELL', reason);
  }

  // 이번 턴에 매매가 하나도 없었으면 관망 이유를 먼저 물어봄 — 있으면 그냥 다음 턴으로.
  async function handleAdvanceTurn() {
    if (!session || asking) return;
    const tradedThisTurn = trades.some((t) => t.turnNumber === session.turnCount);
    let holdReason: string | undefined;
    if (!tradedThisTurn) {
      setAsking(true);
      const reason = await askReason('이번 턴엔 매매가 없었네요. 왜 관망하기로 했어요?');
      setAsking(false);
      if (!reason) {
        setActionResult({ type: 'warning', message: '관망한 이유를 남겨야 다음 턴으로 넘어가요.' });
        return;
      }
      holdReason = reason;
    }
    setActionResult(null);
    const prevTradeIds = new Set(trades.map((t) => t.id));
    // 턴 넘기기 직전 종가를 미리 저장해둠 — 성공하면 이 값을 히스토리 재조회 effect가
    // 새 종가와 비교해서 이번 턴에 새로 늘어난 구간만 애니메이션으로 보여줌(playTurnTransition).
    pendingTurnPrevCloseRef.current = historyPoints.map((p) => p.closePrice);
    try {
      const s = await advanceTurn(session.id, turnUnitChoice, holdReason);
      await refreshAndDetectLiquidation(session.id, prevTradeIds);
      // 넘기려는 기간이 시세 데이터 범위를 벗어나면 백엔드가 에러 대신 세션을 바로
      // COMPLETED로 종료해서 돌려줌 — 이때는 다음 턴으로 안 넘어가고 종료 화면을 보여줌.
      if (s.status === 'COMPLETED') {
        pendingTurnPrevCloseRef.current = null;
        // 자동 종료도 서버가 AI 채점을 이미 끝낸 상태 — 결과 화면에 채점을 같이 보여줌.
        const stats = await getSessionStats(s.id).catch(() => undefined);
        setCompletedSummary({
          sessionId: s.id,
          startingCash: s.startingCash,
          finalValue: portfolioValue,
          returnPct: ((portfolioValue - s.startingCash) / s.startingCash) * 100,
          reason: '더 이상 진행할 수 있는 시세 데이터가 없어서 모의고사가 자동으로 종료됐어요.',
          stats,
        });
        loadSessionQuiz(s.id);
        setSession(null);
        return;
      }
      setSession(s);
      // 턴 전환 연출 — 며칠이 흘렀고 지금 몇 턴인지 잠깐 보여줌.
      setTurnFlash({ turn: s.turnCount, date: s.currentTurnDate, unit: turnUnitChoice });
    } catch (e) {
      pendingTurnPrevCloseRef.current = null;
      setActionResult({ type: 'error', message: e instanceof Error ? e.message : '더 이상 진행할 거래일이 없어요' });
    }
  }

  async function handleCompleteSession() {
    if (!session) return;
    setEnding(true); // 이 동안 "투자 성향 분석 중" 오버레이가 뜸 — 서버가 AI 채점까지 끝내고 응답함
    setActionResult(null);
    try {
      const sessionId = session.id;
      const startingCash = session.startingCash;
      const finalValue = portfolioValue;
      await completeSession(sessionId); // 서버에서 턴 기록+메모 전체를 AI가 읽고 8개 지표 채점
      const stats = await getSessionStats(sessionId).catch(() => undefined);
      setCompletedSummary({
        sessionId,
        startingCash,
        finalValue,
        returnPct: ((finalValue - startingCash) / startingCash) * 100,
        stats,
      });
      loadSessionQuiz(sessionId);
      setSession(null);
    } catch (e) {
      setActionResult({ type: 'error', message: e instanceof Error ? e.message : '세션을 종료하지 못했어요' });
    } finally {
      setEnding(false);
    }
  }

  // 미수금 갚기 — 현금부터, 모자라면 보유 종목을 필요한 만큼만 시가 매도해서 상환(서버 처리).
  async function handleRepayDebt() {
    if (!session || repaying) return;
    setRepaying(true);
    setActionResult(null);
    const before = session.borrowedAmount;
    const prevTradeIds = new Set(trades.map((t) => t.id));
    try {
      const s = await repayDebt(session.id);
      setSession(s);
      await refreshAndDetectLiquidation(session.id, prevTradeIds);
      const repaid = before - s.borrowedAmount;
      setActionResult({
        type: 'success',
        message: `미수금 ${Math.round(repaid).toLocaleString()}원을 갚았어요${s.borrowedAmount > 0 ? ` (남은 미수금 ${Math.round(s.borrowedAmount).toLocaleString()}원)` : ' — 전액 상환 완료!'}`,
      });
    } catch (e) {
      setActionResult({ type: 'error', message: e instanceof Error ? e.message : '미수금을 갚지 못했어요' });
    } finally {
      setRepaying(false);
    }
  }

  function handleRestart() {
    setCompletedSummary(null);
    setSessionQuiz(null);
    setQuizError(null);
    setQuizSelectedOptionId(null);
    setQuizResult(null);
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

  if (needsLogin) {
    return (
      <div>
        <TopNav />
        <div className="page">
          <div className="hero">
            <div className="eyebrow">
              <span className="badge">짐</span>
              로그인이 필요해요
            </div>
            <h1>로그인하고 모의고사를 시작해보세요</h1>
            <p className="lede">
              실제 시세 기반 모의투자로 미수거래·반대매매까지 안전하게 연습할 수 있어요. 계정별로
              진행 상황과 AI 채점 기록이 그대로 저장돼요.
            </p>
            <div className="cta-row">
              <LoginButton className="btn btn-primary">로그인</LoginButton>
            </div>
          </div>
          <div className="card-grid">
            {EXAM_LOGIN_FEATURES.map((f) => (
              <div className="card" key={f.title}>
                <span className="icon">{f.icon}</span>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (completedSummary) {
    const isGain = completedSummary.returnPct >= 0;
    return (
      <div style={{ maxWidth: 560, margin: '60px auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="result-card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h2 style={{ margin: '0 0 6px', fontSize: 19 }}>모의고사가 끝났어요</h2>
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

          {completedSummary.stats && completedSummary.stats.length > 0 && (
            // 세션 종료 시 서버가 턴 기록+매매 메모 전체를 AI에 넘겨 채점한 8개 지표.
            <div>
              <h3 style={{ margin: '4px 0 10px', fontSize: 14 }}>AI 투자 성향 분석</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                {completedSummary.stats.map((stat) => {
                  const meta = SESSION_STAT_LABELS[stat.statKey];
                  return (
                    <div key={stat.statKey} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--soft)' }}>{meta?.label ?? stat.statKey}</span>
                        <strong style={{ fontSize: 14, color: stat.scorePct >= 70 ? 'var(--green)' : stat.scorePct < 40 ? 'var(--red)' : 'var(--amber)' }}>
                          {stat.scorePct}점
                        </strong>
                      </div>
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{stat.note}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/my" className="btn btn-secondary" style={{ flex: 1, textAlign: 'center' }}>
              마이페이지에서 기록 보기
            </Link>
            <button onClick={handleRestart} className="btn btn-primary" style={{ flex: 1 }}>
              새 세션 시작하기
            </button>
          </div>
        </div>

        {/* 이번 세션 단독 스탯으로 뽑은 문제 하나 — 유저 전체 평균이 아니라 방금 끝난
            세션의 약점만 보고 만든 문제라 오늘의 PT랑 다름. */}
        {quizLoading && (
          <div className="result-card" style={{ padding: 24, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
              이번 세션 기록을 보고 약점 지표를 찾아 문제를 만드는 중이에요...
            </p>
          </div>
        )}

        {!quizLoading && quizError && (
          <div className="result-card" style={{ padding: 24, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>{quizError}</p>
          </div>
        )}

        {!quizLoading && !quizError && sessionQuiz && (
          <div
            style={{
              background: 'var(--white)',
              border: '1px solid var(--line)',
              borderRadius: 18,
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
                이번 세션에서 뽑은 문제 · {SESSION_STAT_LABELS[sessionQuiz.targetStatKey].label}
              </p>
              <strong style={{ fontSize: 15 }}>{sessionQuiz.question}</strong>
              {sessionQuiz.options.map((opt) => {
                const isSelected = opt.id === quizSelectedOptionId;
                const isCorrectAnswer = !!quizResult && opt.id === quizResult.correctOptionId;
                const showState = !!quizResult;
                const borderColor = !showState ? 'var(--line)' : isCorrectAnswer ? 'var(--green)' : isSelected ? 'var(--red)' : 'var(--line)';
                const bgColor = !showState ? 'var(--white)' : isCorrectAnswer ? 'var(--green-chip)' : isSelected ? 'var(--red-chip)' : 'var(--white)';
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleQuizSelect(opt.id)}
                    disabled={!!quizResult || quizSubmitting}
                    style={{
                      textAlign: 'left',
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: `1px solid ${borderColor}`,
                      background: bgColor,
                      color: showState && isCorrectAnswer ? 'var(--green)' : 'var(--ink)',
                      fontWeight: showState && isCorrectAnswer ? 800 : 600,
                      fontSize: 13,
                      cursor: quizResult ? 'default' : 'pointer',
                    }}
                  >
                    {opt.label}
                    {showState && isCorrectAnswer ? '  ✓' : ''}
                  </button>
                );
              })}
              {quizResult && (
                <div
                  style={{
                    background: quizResult.correct ? 'var(--green)' : 'var(--red)',
                    color: 'white',
                    borderRadius: 12,
                    padding: 14,
                    fontSize: 13,
                    lineHeight: 1.6,
                  }}
                >
                  {quizResult.correct ? '정답이에요! ' : '아쉬워요, 오답이에요. '}
                  {quizResult.explanation}
                </div>
              )}
            </div>
          </div>
        )}

        <button onClick={handleRestart} className="btn btn-primary btn-block">
          새 세션 시작하기
        </button>
      </div>
    );
  }

  if (needsStartDate) {
    return (
      <div>
        <TopNav />
        <div className="page">
          <div className="hero">
            <div className="eyebrow">
              <span className="badge">짐</span>
              모의고사 준비 중
            </div>
            <h1>모의고사 기간을 고르면 바로 시작해요</h1>
            <p className="lede">
              실제 시세 데이터 중 원하는 구간을 골라 그 기간 동안 모의투자를 진행해요. 미수거래와
              반대매매까지 안전하게 연습할 수 있어요.
            </p>
          </div>
        </div>
        <div className="modal-overlay">
          <div className="modal-card">
            <Link href="/dashboard" className="modal-close" aria-label="닫기">
              ✕
            </Link>
            <div>
              <h2 style={{ margin: '0 0 6px', fontSize: 19 }}>모의고사 기간을 골라주세요</h2>
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
            모의고사 · 최대 {session.maxTurns}턴
            <br />내 자산 {session.currentCash.toLocaleString()}원
          </>
        }
      />
      <div style={{ maxWidth: 'min(1600px, 94vw)', margin: '0 auto', padding: '32px 40px 90px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) 440px 340px', gap: 24 }}>
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
              {turnAnimation ? (
                <RewindChart prices={turnAnimation.prices} visibleCount={turnAnimation.visibleCount} />
              ) : (
                <PriceChart
                  points={historyPoints}
                  todayOpenPrice={active.openPrice}
                  todayDate={session.currentTurnDate}
                  height={220}
                />
              )}
            </div>

            {sessionNews.length > 0 && (
              <div className="result-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 style={{ fontSize: 13, margin: 0 }}>이번 턴 뉴스</h3>
                {sessionNews.map((news, i) => (
                  <button
                    key={`${news.stockCode}-${news.tradeDate}-${i}`}
                    onClick={() => setSelectedNews(news)}
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      padding: '10px 12px',
                      background: 'var(--bg)',
                      border: 0,
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
                      {news.stockName ?? '뉴스'}
                    </span>
                    {/* 며칠 전 뉴스인지 — 오래된 뉴스가 방금 나온 것처럼 보이지 않게 (최근 3일이면 초록) */}
                    <span
                      style={{
                        flexShrink: 0,
                        background: news.daysAgo <= 3 ? 'var(--green-chip)' : 'var(--chip)',
                        color: news.daysAgo <= 3 ? 'var(--green)' : 'var(--soft)',
                        fontSize: 11,
                        fontWeight: 700,
                        borderRadius: 999,
                        padding: '3px 8px',
                      }}
                    >
                      {news.daysAgo <= 0 ? '오늘' : `${news.daysAgo}일 전`}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--soft)', flex: 1 }}>{news.headline}</span>
                    <span style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>자세히 ›</span>
                  </button>
                ))}
              </div>
            )}

            {/* 턴·기간 진행률 — 둘 중 먼저 끝나는 쪽에서 모의고사가 종료됨 */}
            <div className="result-card" style={{ minHeight: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--soft)' }}>
                    턴 진행 · {session.turnCount}/{session.maxTurns}턴
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: session.maxTurns - session.turnCount <= 2 ? 'var(--amber)' : 'var(--muted)' }}>
                    {session.maxTurns - session.turnCount > 0 ? `${session.maxTurns - session.turnCount}턴 남음` : '마지막 턴이에요'}
                  </span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: 'var(--chip)', overflow: 'hidden' }}>
                  <div style={{ width: `${turnPct}%`, height: '100%', borderRadius: 999, background: 'var(--green)', transition: 'width 0.4s' }} />
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--soft)' }}>
                    기간 진행 · {session.startTurnDate} ~ {session.targetEndDate}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: periodLeftDays <= 7 ? 'var(--amber)' : 'var(--muted)' }}>
                    {periodLeftDays > 0 ? `${periodLeftDays}일 남음` : '종료일이에요'}
                  </span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: 'var(--chip)', overflow: 'hidden' }}>
                  <div style={{ width: `${periodPct}%`, height: '100%', borderRadius: 999, background: periodPct >= turnPct ? 'var(--amber)' : 'var(--green)', transition: 'width 0.4s' }} />
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>
                턴과 기간 중 <b>먼저 끝나는 쪽</b>에서 모의고사가 종료돼요 — 일주일·한달씩 건너뛰면 턴이 남아도 기간이 먼저 끝날 수 있어요.
              </p>
            </div>

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

            {borrowedAmount > 0 && (
              // 미수금 상환 기한 경고 — 발생 턴+3턴 안에 못 갚으면 투자성향 평가에 부정적으로
              // 반영됨(회의 결정, 백엔드 DEBT_REPAY_TURN_LIMIT과 동일).
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: session.debtOverdue || (debtTurnsLeft != null && debtTurnsLeft <= 0) ? 'var(--red-chip)' : 'var(--amber-chip)',
                  color: session.debtOverdue || (debtTurnsLeft != null && debtTurnsLeft <= 0) ? 'var(--red)' : 'var(--amber)',
                  fontSize: 12.5,
                  fontWeight: 700,
                  lineHeight: 1.6,
                }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ flex: 1 }}>
                    {session.debtOverdue || (debtTurnsLeft != null && debtTurnsLeft <= 0) ? (
                      <>미수금 {Math.round(borrowedAmount).toLocaleString()}원의 상환 기한이 지났어요 — 이 기록은 투자성향 평가에 부정적으로 반영돼요. 지금이라도 갚아보세요.</>
                    ) : (
                      <>
                        미수금 {Math.round(borrowedAmount).toLocaleString()}원 · {session.debtDeadlineTurn}턴까지 갚아야 해요 (남은 {debtTurnsLeft}턴).
                        기한 안에 못 갚으면 투자성향 평가에 부정적으로 반영돼요.
                      </>
                    )}
                  </span>
                  {/* 현금부터 갚고, 모자라면 보유 종목을 필요한 만큼만 시가 매도해서 갚음(서버 처리) */}
                  <button
                    onClick={handleRepayDebt}
                    disabled={repaying}
                    className="btn btn-sm"
                    style={{ flexShrink: 0, background: 'var(--white)', color: 'var(--ink)', border: '1px solid var(--line)', fontWeight: 800 }}
                  >
                    {repaying ? '갚는 중...' : '지금 갚기'}
                  </button>
                </div>
              </div>
            )}

            <div className="result-card" style={{ minHeight: 0, padding: 16 }} data-knower-seat="">
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
                  onClick={() => setActiveCode(q.stockCode)}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>수량</span>
                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--chip)', borderRadius: 10 }}>
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    style={{ width: 34, height: 34, border: 0, background: 'transparent', fontSize: 16, cursor: 'pointer' }}
                  >
                    −
                  </button>
                  {/* 직접 입력 — 빈 값/0은 입력 중일 수 있으니 그대로 두고, blur 때 1로 보정 */}
                  <input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      setQuantity(Number.isNaN(n) ? 0 : Math.max(0, n));
                    }}
                    onBlur={() => setQuantity((q) => Math.max(1, q))}
                    style={{
                      width: 64,
                      height: 34,
                      textAlign: 'center',
                      fontSize: 13,
                      fontWeight: 800,
                      border: 0,
                      background: 'transparent',
                      color: 'var(--ink)',
                      MozAppearance: 'textfield',
                    }}
                  />
                  <button
                    onClick={() => setQuantity((q) => q + 1)}
                    style={{ width: 34, height: 34, border: 0, background: 'transparent', fontSize: 16, cursor: 'pointer' }}
                  >
                    +
                  </button>
                </div>
              </div>
              {/* 보유 중인 주식은 결제에 못 쓰고 매수는 오직 현금(또는 미수)으로만 되기 때문에,
                  총 자산(현금+보유평가) 기준으로 수량을 맞추면 실제로는 현금이 부족해서 신용거래
                  토글을 안 켰는데도 자동으로 미수가 잡히는 문제가 있었음 — 그래서 현금 기준으로
                  변경. 100%를 눌러도 현금 전액이라 자동 미수는 안 생기고, 신용거래 토글을
                  켜야만 그보다 더 살 수 있음. */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, flexShrink: 0 }}>현금 대비</span>
                <div style={{ display: 'flex', gap: 6, flex: 1, justifyContent: 'flex-end' }}>
                  {[10, 25, 50, 100].map((pct) => {
                    const pctQuantity = Math.max(1, Math.floor((session.currentCash * pct) / 100 / active.openPrice));
                    const isActive = quantity === pctQuantity;
                    return (
                      <button
                        key={pct}
                        onClick={() => setQuantity(pctQuantity)}
                        className="btn btn-sm"
                        title={`약 ${Math.round((session.currentCash * pct) / 100).toLocaleString()}원어치 (${pctQuantity}주)`}
                        style={{
                          padding: '4px 10px',
                          fontSize: 12,
                          background: isActive ? 'var(--green-chip)' : 'var(--white)',
                          color: isActive ? 'var(--green)' : 'var(--soft)',
                          border: `1px solid ${isActive ? 'transparent' : 'var(--line)'}`,
                          fontWeight: isActive ? 800 : 600,
                        }}
                      >
                        {pct}%
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* 매수/매도 판단에 필요한 수량 정보 — 누르면 그 수량으로 바로 세팅됨.
                  신용 최대치는 담보비율 140% 한도 역산(서버 거부선과 동일) — 신용거래 토글을
                  켰을 때만 그 수량으로 실제 매수가 가능함. */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setQuantity(Math.max(1, cashOnlyQty))}
                  disabled={cashOnlyQty <= 0}
                  className="btn btn-sm"
                  title="현금만으로 살 수 있는 최대 수량"
                  style={{ padding: '4px 10px', fontSize: 11.5, background: 'var(--white)', color: 'var(--soft)', border: '1px solid var(--line)' }}
                >
                  현금으로 {cashOnlyQty.toLocaleString()}주
                </button>
                <button
                  onClick={() => setQuantity(Math.max(1, maxBuyQty))}
                  disabled={maxBuyQty <= 0}
                  className="btn btn-sm"
                  title="신용(미수)까지 써서 살 수 있는 최대 수량 — 담보비율 140% 한도"
                  style={{ padding: '4px 10px', fontSize: 11.5, background: 'var(--white)', color: 'var(--amber)', border: '1px solid var(--amber)' }}
                >
                  신용까지 최대 {maxBuyQty.toLocaleString()}주
                </button>
                <button
                  onClick={() => setQuantity(Math.max(1, ownedQty))}
                  disabled={ownedQty <= 0}
                  className="btn btn-sm"
                  title="이 종목 보유 수량 — 누르면 전량 매도 수량으로 세팅"
                  style={{ padding: '4px 10px', fontSize: 11.5, background: 'var(--white)', color: ownedQty > 0 ? 'var(--green)' : 'var(--muted)', border: '1px solid var(--line)' }}
                >
                  보유 {ownedQty.toLocaleString()}주
                </button>
              </div>
              {/* 기본은 현금 초과분만 자동으로 미수가 되지만, 켜두면 현금이 남아있어도 이번
                  매수금액의 최소 40%(CREDIT_MIN_BORROW_RATIO)를 일부러 미수로 돌림 — 현금
                  60%+미수 40%로 같은 현금으로 더 살 수 있게. 현금이 그보다 부족하면 기존처럼
                  부족분 전체가 미수로 잡힘(40%는 최솟값). */}
              <button
                onClick={() => setUseCredit((v) => !v)}
                className="btn btn-sm"
                style={{
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 800,
                  background: useCredit ? 'var(--amber-chip)' : 'var(--white)',
                  color: useCredit ? 'var(--amber)' : 'var(--soft)',
                  border: `1px solid ${useCredit ? 'transparent' : 'var(--line)'}`,
                }}
              >
                {useCredit ? '✓ ' : ''}신용거래로 매수 (증거금 60% · 미수 40%)
              </button>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>
                예상 금액 {estimate.toLocaleString()}원 (시장가 · 시가 기준) · 총 자산의{' '}
                {portfolioValue > 0 ? Math.round((estimate / portfolioValue) * 100) : 0}%
              </p>
              {useCredit ? (
                <p style={{ margin: 0, fontSize: 11, color: 'var(--amber)', fontWeight: 700 }}>
                  현금 {Math.round(estimate - shortfallPreview).toLocaleString()}원 + 미수(빌린 돈){' '}
                  {Math.round(shortfallPreview).toLocaleString()}원으로 매수해요 — 미수는 {DEBT_REPAY_TURN_LIMIT}턴 안에 갚아야 해요.
                </p>
              ) : (
                estimate > session.currentCash && (
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--amber)', fontWeight: 700 }}>
                    현금을 {Math.round(estimate - session.currentCash).toLocaleString()}원 넘는 매수예요 — 부족분은
                    미수(빌린 돈)로 잡히고 {DEBT_REPAY_TURN_LIMIT}턴 안에 갚아야 해요.
                  </p>
                )
              )}
              <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)' }}>
                매수·매도 버튼을 누르면 판단한 이유를 적는 메모창이 떠요.
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
                  : '이번 턴에 매매 없이 다음 턴으로 넘어가면 관망한 이유를 적게 돼요.'}
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

          {/* right: DART 공시 요약 — 매수 전 확인해야 할 판단요소. "열어본" 행동이
              viewedDisclosure로 매매 기록에 남아 공시 확인율 스탯의 원천이 된다. */}
          <aside className="result-card" style={{ minHeight: 0, padding: 20, alignSelf: 'start', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <h3 style={{ fontSize: 15, margin: '0 0 4px' }}>DART 공시 요약</h3>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
                {active.stockName} · 전자공시시스템 기준
              </p>
            </div>
            {!disclosureOpen ? (
              <>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--soft)', lineHeight: 1.6 }}>
                  매수 전에 이 종목의 최근 공시를 확인해보세요. 열어본 기록은 공시 확인율 스탯에
                  반영돼요.
                </p>
                <button onClick={openDisclosure} className="btn btn-secondary btn-sm btn-block">
                  공시 요약 열어보기
                </button>
              </>
            ) : disclosure == null ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>불러오는 중...</p>
            ) : disclosure.items.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
                이 시점까지 등록된 공시가 없어요.
              </p>
            ) : (
              disclosure.items.map((item) => (
                <div key={`${item.disclosedDate}-${item.title}`} style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginBottom: 4 }}>
                    <strong style={{ fontSize: 12.5, flex: 1 }}>{item.title}</strong>
                    <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{item.disclosedDate}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--soft)', lineHeight: 1.6 }}>{item.summary}</p>
                </div>
              ))
            )}

            {/* 종목 상세 — 예전엔 종목을 누를 때 뜨는 모달이었는데, DART 공시 아래 상시
                패널로 변경. 종목 리스트에서 종목을 누르면 공시·상세가 즉시 같이 바뀐다. */}
            <StockDetailPanel
              stockName={active.stockName}
              stockCode={active.stockCode}
              price={active.openPrice}
              changePct={changePct}
              chart={sparklinePoints}
            />
          </aside>
        </div>
      </div>

      {/* 턴 전환 연출 — 며칠이 흘렀고 지금 몇 턴인지 잠깐 띄웠다가 스스로 사라진다.
          pointerEvents: none 이라 뜨는 동안에도 화면 조작을 막지 않는다. */}
      <AnimatePresence>
        {turnFlash && (
          <motion.div
            key={turnFlash.turn}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 25,
              display: 'grid',
              placeItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -14, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              style={{
                background: 'var(--white)',
                border: '1px solid var(--line)',
                borderRadius: 18,
                padding: '18px 26px',
                boxShadow: '0 20px 50px rgba(28, 32, 24, 0.22)',
                textAlign: 'center',
              }}
            >
              <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: 'var(--green)' }}>
                {TURN_UNIT_LABELS[turnFlash.unit]}
                {subjectParticle(TURN_UNIT_LABELS[turnFlash.unit])} 지났어요
              </p>
              <strong style={{ display: 'block', margin: '6px 0 2px', fontSize: 22 }}>{turnFlash.date}</strong>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{turnFlash.turn}턴째</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {selectedNews && <NewsDetailModal news={selectedNews} onClose={() => setSelectedNews(null)} />}
      {reasonPrompt && (
        <div className="modal-overlay">
          <div className="modal-card">
            <button type="button" className="modal-close" aria-label="닫기" onClick={cancelReason}>
              ✕
            </button>
            <div>
              <h2 style={{ margin: '0 0 6px', fontSize: 19 }}>{reasonPrompt.question}</h2>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
                지금 판단한 이유를 적어두면, 나중에 결과와 대조해서 어떤 근거가 맞고 틀렸는지 알 수 있어요.
              </p>
            </div>
            <textarea
              autoFocus
              rows={3}
              value={reasonDraft}
              onChange={(e) => setReasonDraft(e.target.value)}
              onKeyDown={(e) => {
                // 줄바꿈은 그대로 두고, ⌘/Ctrl+Enter로 빠르게 제출.
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitReason();
              }}
              placeholder="예: 실적이 개선되고 있어서 지금 가격이 싸다고 봤어요"
              style={{
                width: '100%',
                borderRadius: 10,
                border: '1px solid var(--line)',
                background: 'var(--white)',
                color: 'var(--ink)',
                padding: '10px 12px',
                fontSize: 14,
                lineHeight: 1.6,
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {reasonDraft.trim().length < MIN_REASON_LENGTH
                ? `${MIN_REASON_LENGTH}자 이상 적어주세요 (${reasonDraft.trim().length}/${MIN_REASON_LENGTH})`
                : '좋아요. ⌘/Ctrl+Enter로도 제출할 수 있어요.'}
            </div>
            <div className="cta-row">
              <button type="button" className="btn btn-secondary" onClick={cancelReason}>
                취소
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={reasonDraft.trim().length < MIN_REASON_LENGTH}
                onClick={submitReason}
              >
                이유 남기고 계속
              </button>
            </div>
          </div>
        </div>
      )}
      {showRisk && (
        <RiskInterventionModal
          quantity={`${quantity}주`}
          expectedRatioPct={pendingRiskRatio}
          diagnosisWarning={riskWarningText}
          aiMessage={riskWarningMessage}
          aiLoading={riskWarningLoading}
          onCancel={() => {
            setShowRisk(false);
            setRiskWarningMessage(null);
          }}
          onProceed={() => {
            executeTrade('BUY', pendingReason);
            setRiskWarningMessage(null);
          }}
        />
      )}
      {liquidationEvent && (
        <ForcedLiquidationModal trades={liquidationEvent} onClose={() => setLiquidationEvent(null)} />
      )}
      {actionResult && <ActionResultModal result={actionResult} onClose={() => setActionResult(null)} />}
      {ending && (
        // 종료 요청 동안 서버가 AI 채점(턴 기록+메모 전체 분석)을 돌리는 중 — 몇 초~수십 초 걸릴 수 있음.
        <div className="modal-overlay">
          <div className="modal-card" style={{ textAlign: 'center', alignItems: 'center', gap: 14 }}>
            <span
              aria-hidden
              style={{
                width: 42,
                height: 42,
                borderRadius: 999,
                border: '4px solid var(--green-chip)',
                borderTopColor: 'var(--green)',
                animation: 'kb-spin 0.9s linear infinite',
              }}
            />
            <h2 style={{ margin: 0, fontSize: 17 }}>이번 모의고사 기록으로 투자 성향을 분석 중이에요</h2>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
              턴마다 남긴 매매 이유까지 AI가 전부 읽고 8개 지표를 채점해요.
              <br />조금만 기다려주세요.
            </p>
            <style>{`@keyframes kb-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      )}
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

function NewsDetailModal({ news, onClose }: { news: StockNewsItemResponse; onClose: () => void }) {
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
          {news.stockName ?? '뉴스'}
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

// 가격/차트는 실제 데이터, 시가총액·PER 등은 아직 mock (OpenDART 연동 전) — 재무제표 요약은
// DART 공시 요약 패널과 중복돼서 뺐음(공시 쪽이 실제 데이터라 그쪽이 우선).

// 종목 상세 — 예전엔 종목을 누를 때 뜨는 모달이었는데, 오른쪽 DART 공시 패널 아래에
// 항상 떠 있는 패널로 바꿨다. 공시(무슨 일이 있었나)와 종목 기본정보(어떤 회사인가)를
// 한 열에서 위아래로 같이 보게 하려는 것. 종목 리스트를 누르면 즉시 전환된다.
// 가격/차트는 실제 데이터, 시가총액·PER 등 지표는 아직 mock (OpenDART 연동 전).
function StockDetailPanel({
  stockName,
  stockCode,
  price,
  changePct,
  chart,
}: {
  stockName: string;
  stockCode: string;
  price: number;
  changePct: number;
  chart: number[];
}) {
  return (
    <div className="result-card" style={{ minHeight: 0, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
      <div>
        <h3 style={{ fontSize: 15, margin: '0 0 4px' }}>종목 상세</h3>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
          {stockName} · {stockCode}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
        <strong style={{ fontSize: 24 }}>{price.toLocaleString()}원</strong>
        <span
          style={{
            fontSize: 12,
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

      <div style={{ height: 84, background: 'var(--red-chip)', borderRadius: 12 }}>
        <Sparkline points={chart} color="var(--red)" />
      </div>

      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {[
            ['시가총액', stockDetail.marketCap],
            ['거래량', stockDetail.volume],
            ['52주 최고', stockDetail.high52w],
            ['52주 최저', stockDetail.low52w],
            ['PER', stockDetail.per],
            ['PBR', stockDetail.pbr],
            ['ROE', stockDetail.roe],
            ['배당수익률', stockDetail.dividendYield],
          ].map(([label, value]) => (
            <div key={label} style={{ background: 'var(--bg)', borderRadius: 10, padding: '9px 11px' }}>
              <small style={{ display: 'block', fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>
                {label}
              </small>
              <strong style={{ fontSize: 13 }}>{value}</strong>
            </div>
          ))}
        </div>
        {/* 아직 종목별 실제 값이 아니라 예시값이라, 그렇다고 화면에 밝혀둔다 —
            바로 위 DART 공시는 실제 시드 데이터라 둘을 구분해줘야 오해가 없다. */}
        <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
          위 지표는 아직 종목별 실제 값이 아닌 <b>예시값</b>이에요. 실제 재무·공시 정보는 위 DART 공시 요약을 봐주세요.
        </p>
      </div>
    </div>
  );
}

function RiskInterventionModal({
  quantity,
  expectedRatioPct,
  diagnosisWarning,
  aiMessage,
  aiLoading,
  onCancel,
  onProceed,
}: {
  quantity: string;
  expectedRatioPct: number | null;
  diagnosisWarning: string | null;
  aiMessage: string | null;
  aiLoading: boolean;
  onCancel: () => void;
  onProceed: () => void;
}) {
  const ratioLabel = expectedRatioPct != null && Number.isFinite(expectedRatioPct) ? `${expectedRatioPct.toFixed(0)}%` : riskIntervention.expectedRatio;
  // AI가 만든 메시지가 오면 그걸 쓰고, 로딩 중이거나 실패했으면(aiMessage=null) 원래 있던
  // 고정 문구로 대체 — 경고 자체가 안 뜨는 것보다는 낫다는 원칙(SessionStatAnalysisPrompt의
  // fallbackResult와 같은 결).
  const warningText =
    aiMessage ??
    `지금 신용매수 ${quantity}를 진행하면 담보비율이 ${ratioLabel}까지 떨어져요. ` +
      `${riskIntervention.liquidationThreshold} 아래로 내려가면 — 내 의사와 상관없이 반대매매가 발생할 수 있어요.`;
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
          {aiLoading ? 'AI 코치가 지금 상황을 살펴보고 있어요...' : warningText}
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
          미수로 빌린 돈에 비해 보유 자산 가치가 {(MAINTENANCE_RATIO * 100).toFixed(0)}% 아래로
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
