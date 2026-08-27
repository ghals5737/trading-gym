'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useLoggedIn from './useLoggedIn';
import { getProductTourStatus, markProductTourSeen } from '../lib/user-api';

declare global {
  interface Window {
    knowerbotPointAt?: (selector: string) => void;
    knowerbotStopPointing?: () => void;
  }
}

// knowerbot-runtime.js는 <Script strategy="afterInteractive">라 이 컴포넌트가 먼저
// 마운트될 수 있음 — window.knowerbotPointAt이 아직 없으면 뜰 때까지 잠깐 재시도.
function notifyKnowerbotPointAt(selector: string) {
  let attempts = 0;
  const tryNotify = () => {
    if (typeof window.knowerbotPointAt === 'function') {
      window.knowerbotPointAt(selector);
      return;
    }
    attempts += 1;
    if (attempts < 20) window.setTimeout(() => tryNotify(), 200);
  };
  tryNotify();
}

interface TourStep {
  href: string;
  selector: string;
  title: string;
  description: string;
}

// TopNav의 data-tour 속성과 짝지어짐.
// 이전엔 대시보드에 머문 채로 nav 탭만 하이라이트했는데, 실제로 그 페이지가 어떻게
// 생겼는지 보여주는 게 더 도움이 될 것 같아서 각 스텝마다 실제로 그 페이지로
// 이동시킴 — 탭 하이라이트는 "지금 이 페이지 맞다"는 표시로 남겨둠.
const STEPS: TourStep[] = [
  {
    href: '/simulation',
    selector: '[data-tour="nav-simulation"]',
    title: '모의고사',
    description: '실제 시세 기반 모의투자예요. 신용거래·반대매매까지 안전하게 먼저 경험해볼 수 있어요.',
  },
  {
    href: '/my',
    selector: '[data-tour="nav-my"]',
    title: '마이 페이지',
    description: '사전 조사로 진단한 투자 성향과 계정 정보를 여기서 확인해요.',
  },
  {
    href: '/pt',
    selector: '[data-tour="nav-pt"]',
    title: '오늘의 PT',
    description: '매일 짧은 퀴즈로 위험한 매매 습관을 점검하는 코너예요.',
  },
  {
    href: '/library',
    selector: '[data-tour="nav-library"]',
    title: '자료실',
    description: '금융감독원 등 공신력 있는 투자 교육 자료를 모아뒀어요.',
  },
];

// 처음 온 사용자에게만 한 번 — 스텝마다 실제로 그 페이지로 이동시키면서 상단 탭을
// 짧게 밝혀 "이 사이트 어떻게 쓰는지" 안내함. "본 적 있는지"는 브라우저가 아니라 계정
// 단위로 서버에 저장(GET/POST /api/users/me/product-tour)해서, 다른 기기·브라우저로
// 로그인해도 한 번 본 사람에겐 안 뜨고 같은 브라우저를 여러 계정이 써도 계정마다
// 정확히 한 번만 보여줌.
export default function ProductTour() {
  const router = useRouter();
  const loggedIn = useLoggedIn();
  const [stepIndex, setStepIndex] = useState(-1);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (!loggedIn || checkedRef.current) return;
    checkedRef.current = true;
    getProductTourStatus()
      .then((status) => {
        if (!status.seen) setStepIndex(0);
      })
      .catch(() => {});
  }, [loggedIn]);

  // 스텝이 바뀔 때마다 그 스텝의 실제 페이지로 이동 — 이동 직후엔 새 페이지가 아직
  // 렌더링되기 전이라 타겟 탭이 DOM에 없을 수 있어서, 나타날 때까지 지켜보다가 잡음.
  useEffect(() => {
    if (stepIndex < 0 || stepIndex >= STEPS.length) return;
    const step = STEPS[stepIndex];
    setRect(null);
    router.push(step.href);
    notifyKnowerbotPointAt(step.selector);

    let cancelled = false;
    const updateRect = () => {
      const el = document.querySelector(step.selector);
      if (el) setRect(el.getBoundingClientRect());
      return !!el;
    };

    if (updateRect()) return;
    const observer = new MutationObserver(() => {
      if (updateRect() && !cancelled) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  useEffect(() => {
    if (stepIndex < 0 || stepIndex >= STEPS.length) return;
    const updateRect = () => {
      const el = document.querySelector(STEPS[stepIndex].selector);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    window.addEventListener('resize', updateRect);
    return () => window.removeEventListener('resize', updateRect);
  }, [stepIndex]);

  function finish() {
    setStepIndex(-1);
    window.knowerbotStopPointing?.();
    markProductTourSeen().catch(() => {});
  }

  if (stepIndex < 0 || stepIndex >= STEPS.length || !rect) return null;

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const pad = 8;
  const cardWidth = 300;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300 }}>
      {/* 대상 요소만 빼고 살짝 어둡게 — 뒤 페이지 내용이 보이도록 이전보다 옅게 함
          (예전엔 완전히 가려서 페이지를 못 보여줬음) */}
      <div
        style={{
          position: 'fixed',
          top: rect.top - pad,
          left: rect.left - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
          borderRadius: 10,
          boxShadow: '0 0 0 9999px rgba(13, 18, 10, 0.28)',
          pointerEvents: 'none',
          transition: 'top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease',
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: rect.bottom + pad + 12,
          left: Math.max(16, Math.min(rect.left, window.innerWidth - cardWidth - 16)),
          width: cardWidth,
          background: 'var(--white)',
          borderRadius: 16,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          boxShadow: '0 24px 60px rgba(13, 18, 10, 0.32)',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--green)' }}>
          {stepIndex + 1} / {STEPS.length}
        </span>
        <h3 style={{ margin: 0, fontSize: 16 }}>{step.title}</h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--soft)', lineHeight: 1.55 }}>{step.description}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <button
            type="button"
            onClick={finish}
            style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            건너뛰기
          </button>
          <button
            type="button"
            onClick={() => (isLast ? finish() : setStepIndex((i) => i + 1))}
            className="btn btn-primary btn-sm"
          >
            {isLast ? '시작하기' : '다음'}
          </button>
        </div>
      </div>
    </div>
  );
}
