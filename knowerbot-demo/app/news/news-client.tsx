'use client';

import { useState } from 'react';
import TopNav from '../../components/TopNav';
import { news } from '../../lib/mock-data';

export default function NewsClient() {
  const [activeId, setActiveId] = useState(news[0].id);
  const active = news.find((n) => n.id === activeId)!;

  return (
    <div>
      <TopNav right="뉴스 해설" />
      <div style={{ maxWidth: 'min(1600px, 94vw)', margin: '0 auto', padding: '36px 40px 90px' }}>
        <h1 style={{ fontSize: 24 }}>뉴스 분석 어시스턴트</h1>
        <p style={{ margin: '4px 0 24px', fontSize: 13, color: 'var(--muted)' }}>
          어려운 경제 뉴스, KnowerBot이 초보자 눈높이로 풀어드려요.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20, alignItems: 'start' }}>
          <div
            style={{
              background: 'var(--white)',
              border: '1px solid var(--line)',
              borderRadius: 16,
              padding: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {news.map((n) => {
              const isActive = n.id === activeId;
              return (
                <button
                  key={n.id}
                  onClick={() => setActiveId(n.id)}
                  style={{
                    textAlign: 'left',
                    padding: 12,
                    borderRadius: 10,
                    border: 0,
                    cursor: 'pointer',
                    background: isActive ? 'var(--green-chip)' : 'transparent',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      alignSelf: 'flex-start',
                      fontSize: 10,
                      fontWeight: 800,
                      padding: '3px 8px',
                      borderRadius: 999,
                      background: n.tag === '속보' ? 'var(--red-chip)' : 'var(--chip)',
                      color: n.tag === '속보' ? 'var(--red)' : 'var(--soft)',
                    }}
                  >
                    {n.tag}
                  </span>
                  <strong
                    style={{
                      fontSize: 13,
                      lineHeight: 1.4,
                      color: isActive ? 'var(--green)' : 'var(--ink)',
                    }}
                  >
                    {n.headline}
                  </strong>
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="result-card" style={{ minHeight: 0, padding: '20px 22px' }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: 'var(--red)' }}>
                {active.tag} · {active.source}
              </p>
              <h2 style={{ margin: '4px 0 10px', fontSize: 18 }}>{active.headline}</h2>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--soft)', lineHeight: 1.6 }}>{active.body}</p>
            </div>

            <div style={{ background: 'var(--green)', borderRadius: 18, padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.2)',
                    display: 'grid',
                    placeItems: 'center',
                    color: 'white',
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  짐
                </span>
                <strong style={{ color: 'white', fontSize: 13 }}>KnowerBot의 해설</strong>
              </div>
              {active.aiPoints.map((p) => (
                <div key={p} style={{ display: 'flex', gap: 8 }}>
                  <span style={{ color: 'white', fontWeight: 800 }}>•</span>
                  <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.92)', lineHeight: 1.6 }}>{p}</p>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'white', borderRadius: 999, padding: '6px 6px 6px 14px' }}>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--muted)' }}>이 뉴스에 대해 더 물어보기</span>
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    background: 'var(--green)',
                    color: 'white',
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 800,
                  }}
                >
                  ↑
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
