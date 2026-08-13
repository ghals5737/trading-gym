'use client';

import { useState } from 'react';
import TopNav from '../../components/TopNav';
import { educationCategories, educationItems } from '../../lib/mock-data';

export default function LibraryClient() {
  const [category, setCategory] = useState('전체');
  const [query, setQuery] = useState('');

  const filtered = educationItems.filter((item) => {
    const matchesCategory = category === '전체' || item.category === category;
    const matchesQuery = query.trim() === '' || item.title.includes(query.trim());
    return matchesCategory && matchesQuery;
  });

  return (
    <div>
      <TopNav right={`자료 ${educationItems.length}건`} />
      <div style={{ maxWidth: 'min(1600px, 94vw)', margin: '0 auto', padding: '40px 40px 100px' }}>
        <h1 style={{ fontSize: 26 }}>투자교육 자료 모음</h1>
        <div style={{ display: 'flex', gap: 10, margin: '20px 0 24px' }}>
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 46,
              padding: '0 16px',
              background: 'var(--white)',
              border: '1px solid var(--line)',
              borderRadius: 12,
            }}
          >
            <span>🔍</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="자료 검색 (예: 반대매매, 손절선)"
              style={{ flex: 1, border: 0, outline: 'none', fontSize: 13, background: 'transparent' }}
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              height: 46,
              padding: '0 14px',
              background: 'var(--white)',
              border: '1px solid var(--line)',
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 600,
              minWidth: 180,
            }}
          >
            {educationCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24, alignItems: 'start' }}>
          <div
            style={{
              background: 'var(--white)',
              border: '1px solid var(--line)',
              borderRadius: 16,
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {educationCategories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: 0,
                  cursor: 'pointer',
                  background: category === c ? 'var(--green-chip)' : 'transparent',
                  color: category === c ? 'var(--green)' : 'var(--soft)',
                  fontWeight: category === c ? 800 : 600,
                  fontSize: 13,
                }}
              >
                {c}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {filtered.length === 0 && (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>조건에 맞는 자료가 없어요.</p>
            )}
            {filtered.map((item) => (
              <div
                key={item.title}
                style={{
                  display: 'flex',
                  gap: 16,
                  alignItems: 'center',
                  padding: '18px 20px',
                  background: 'var(--white)',
                  border: '1px solid var(--line)',
                  borderRadius: 14,
                }}
              >
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span
                    style={{
                      alignSelf: 'flex-start',
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--soft)',
                      background: 'var(--chip)',
                      borderRadius: 999,
                      padding: '3px 9px',
                    }}
                  >
                    {item.category}
                  </span>
                  <strong style={{ fontSize: 15 }}>{item.title}</strong>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{item.source}</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>{item.meta}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
