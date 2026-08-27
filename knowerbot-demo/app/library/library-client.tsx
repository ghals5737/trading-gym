'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import TopNav from '../../components/TopNav';
import LoginButton from '../../components/LoginButton';
import {
  getLibraryDocuments,
  getLibraryRecommendations,
  type LibraryDocumentResponse,
  type LibraryRecommendationsResponse,
} from '../../lib/library-api';

declare global {
  interface Window {
    knowerbotRequireLogin?: () => void;
  }
}

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

const LIBRARY_LOGIN_FEATURES = [
  { icon: '1', title: '실제 원문', desc: 'AI 코치·맞춤 퀴즈가 참고하는 자료의 원문을 그대로 볼 수 있어요.' },
  { icon: '2', title: '공신력 있는 출처', desc: '금융감독원·한국은행·예금보험공사 등 공공기관 발간 자료예요.' },
  { icon: '3', title: '페이지 단위 읽기', desc: '책 전체를 한 번에 안 불러오고 페이지 넘기듯 읽을 수 있어요.' },
];

export default function LibraryClient() {
  const [needsLogin, setNeedsLogin] = useState(false);
  const [checkedLogin, setCheckedLogin] = useState(false);
  const [documents, setDocuments] = useState<LibraryDocumentResponse[] | null>(null);
  const [recommendations, setRecommendations] = useState<LibraryRecommendationsResponse | null>(null);
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
    getLibraryDocuments()
      .then(setDocuments)
      .catch((e) => setError(e instanceof Error ? e.message : '자료 목록을 불러오지 못했어요'));
    // 추천 실패는 치명적이지 않음 — 섹션만 조용히 숨김(전체 목록은 그대로).
    getLibraryRecommendations().then(setRecommendations).catch(() => setRecommendations(null));
  }, []);

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
            <h1>로그인하고 투자교육 자료 원문을 읽어보세요</h1>
            <p className="lede">
              AI 코치와 맞춤 퀴즈가 근거로 삼는 공공기관 자료의 실제 본문을 볼 수 있어요.
            </p>
            <div className="cta-row">
              <LoginButton className="btn btn-primary">로그인</LoginButton>
            </div>
          </div>
          <div className="card-grid">
            {LIBRARY_LOGIN_FEATURES.map((f) => (
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

  return (
    <div>
      <TopNav right={documents ? `자료 ${documents.length}건` : '자료실'} />
      <div style={{ maxWidth: 'min(1600px, 94vw)', margin: '0 auto', padding: '40px 40px 100px' }}>
        <h1 style={{ fontSize: 26 }}>투자교육 자료 모음</h1>
        <p style={{ margin: '8px 0 24px', fontSize: 13, color: 'var(--muted)' }}>
          AI 코치와 맞춤 퀴즈가 실제로 검색해서 근거로 삼는 자료예요. 원문을 그대로 읽어볼 수 있어요.
        </p>

        {recommendations && (
          // 내 약점 스탯 기반 RAG 추천 — 오늘의 PT와 같은 원리(가장 약한 지표 → 벡터 검색)를 자료 추천에 적용.
          <div className="result-card" style={{ padding: 20, marginBottom: 24 }}>
            <span
              style={{
                display: 'inline-block',
                fontSize: 11,
                fontWeight: 800,
                color: 'var(--green)',
                background: 'var(--green-chip)',
                borderRadius: 999,
                padding: '3px 10px',
                marginBottom: 8,
              }}
            >
              맞춤 추천 · {recommendations.targetStatLabel} 보완
            </span>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--soft)' }}>{recommendations.reason}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recommendations.items.map((item, i) => {
                const pages =
                  item.pageStart != null
                    ? item.pageStart === item.pageEnd
                      ? ` · ${item.pageStart}쪽`
                      : ` · ${item.pageStart}~${item.pageEnd}쪽`
                    : '';
                const body = (
                  <>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <strong style={{ fontSize: 13.5, flex: 1 }}>
                        {item.title}
                        <span style={{ fontWeight: 600, color: 'var(--muted)' }}>{pages}</span>
                      </strong>
                      {item.orgName && <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{item.orgName}</span>}
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                      {item.excerpt}…
                    </p>
                  </>
                );
                const style = {
                  display: 'block',
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--line)',
                  textDecoration: 'none',
                  color: 'inherit',
                } as const;
                return item.documentId != null ? (
                  <Link key={i} href={`/library/${item.documentId}`} style={style}>
                    {body}
                  </Link>
                ) : (
                  <div key={i} style={style}>
                    {body}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {error && <p style={{ fontSize: 13, color: 'var(--red)' }}>{error}</p>}
        {!error && !documents && <p style={{ fontSize: 13, color: 'var(--muted)' }}>불러오는 중...</p>}
        {!error && documents && documents.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>아직 등록된 자료가 없어요.</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {documents?.map((doc) => (
            <Link
              key={doc.id}
              href={`/library/${doc.id}`}
              style={{
                display: 'flex',
                gap: 16,
                alignItems: 'center',
                padding: '18px 20px',
                background: 'var(--white)',
                border: '1px solid var(--line)',
                borderRadius: 14,
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {doc.orgName && (
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
                    {doc.orgName}
                    {doc.year ? ` · ${doc.year}` : ''}
                  </span>
                )}
                <strong style={{ fontSize: 15 }}>{doc.title}</strong>
                {doc.target && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{doc.target}</span>}
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>
                {doc.minPage && doc.maxPage ? `${doc.minPage}~${doc.maxPage}쪽` : `${doc.pageCount}쪽`}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
