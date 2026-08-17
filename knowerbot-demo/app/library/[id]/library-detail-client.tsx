'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import TopNav from '../../../components/TopNav';
import LoginButton from '../../../components/LoginButton';
import { getLibraryDocument, type LibraryDocumentDetailResponse } from '../../../lib/library-api';

declare global {
  interface Window {
    knowerbotRequireLogin?: () => void;
  }
}

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

// edu_pages는 실제 PDF 쪽 단위라 오버랩이 없음 — 책 한 권이 500쪽 넘는 것도 있어서
// 한 번에 안 불러오고 이 쪽수만큼씩 넘겨봄.
const PAGES_PER_SCREEN = 5;

export default function LibraryDetailClient({ documentId }: { documentId: number }) {
  const [needsLogin, setNeedsLogin] = useState(false);
  const [checkedLogin, setCheckedLogin] = useState(false);
  const [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<LibraryDocumentDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let loggedInNow = false;
    try {
      loggedInNow = localStorage.getItem('kg_logged_in') === '1';
    } catch (e) {}
    if (!loggedInNow) {
      setNeedsLogin(true);
      setCheckedLogin(true);
      notifyKnowerbotLoginRequired();
      return;
    }
    setCheckedLogin(true);
  }, []);

  useEffect(() => {
    if (!checkedLogin || needsLogin) return;
    setLoading(true);
    setError(null);
    getLibraryDocument(documentId, offset, PAGES_PER_SCREEN)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : '자료를 불러오지 못했어요'))
      .finally(() => setLoading(false));
  }, [checkedLogin, needsLogin, documentId, offset]);

  if (!checkedLogin) {
    return null;
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
            <h1>로그인하고 자료 원문을 읽어보세요</h1>
            <div className="cta-row">
              <LoginButton className="btn btn-primary">로그인</LoginButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const hasPrev = offset > 0;
  const hasNext = detail ? offset + detail.pages.length < detail.totalPages : false;

  return (
    <div>
      <TopNav right="자료실" />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 32px 100px' }}>
        <Link href="/library" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>
          ← 자료 목록으로
        </Link>

        {loading && !detail && <p style={{ marginTop: 24, fontSize: 13, color: 'var(--muted)' }}>불러오는 중...</p>}
        {error && <p style={{ marginTop: 24, fontSize: 13, color: 'var(--red)' }}>{error}</p>}

        {detail && (
          <>
            <div style={{ marginTop: 16, marginBottom: 8 }}>
              {detail.document.orgName && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--soft)',
                    background: 'var(--chip)',
                    borderRadius: 999,
                    padding: '3px 9px',
                  }}
                >
                  {detail.document.orgName}
                  {detail.document.year ? ` · ${detail.document.year}` : ''}
                </span>
              )}
              <h1 style={{ fontSize: 22, margin: '10px 0 0' }}>{detail.document.title}</h1>
            </div>

            <div
              style={{
                background: 'var(--white)',
                border: '1px solid var(--line)',
                borderRadius: 16,
                padding: '28px 32px',
                marginTop: 20,
                opacity: loading ? 0.5 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {detail.pages.map((page) => (
                <div key={page.pageNumber} style={{ marginBottom: 22 }}>
                  <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
                    {page.pageNumber}쪽
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 14,
                      lineHeight: 1.8,
                      color: 'var(--ink)',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {page.content}
                  </p>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16 }}>
              <button
                className="btn btn-secondary"
                disabled={!hasPrev || loading}
                onClick={() => setOffset((o) => Math.max(0, o - PAGES_PER_SCREEN))}
                style={{ opacity: !hasPrev || loading ? 0.4 : 1 }}
              >
                ← 이전
              </button>
              <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>
                {Math.floor(offset / PAGES_PER_SCREEN) + 1} / {Math.max(1, Math.ceil(detail.totalPages / PAGES_PER_SCREEN))}
              </span>
              <button
                className="btn btn-secondary"
                disabled={!hasNext || loading}
                onClick={() => setOffset((o) => o + PAGES_PER_SCREEN)}
                style={{ opacity: !hasNext || loading ? 0.4 : 1 }}
              >
                다음 →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
