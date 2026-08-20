'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import TopNav from '../../components/TopNav';
import LoginButton from '../../components/LoginButton';
import { getLibraryDocuments, type LibraryDocumentResponse } from '../../lib/library-api';

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
  { icon: '1', title: '읽기 편한 요약 글', desc: 'AI 코치·맞춤 퀴즈가 참고하는 자료를 주제별 블로그 글처럼 다시 썼어요.' },
  { icon: '2', title: '공신력 있는 출처', desc: '금융감독원·한국은행·예금보험공사 등 공공기관 발간 자료예요.' },
  { icon: '3', title: '주제별로 정리', desc: '책 전체가 아니라 관심 있는 주제 글만 골라 읽을 수 있어요.' },
];

export default function LibraryClient() {
  const [needsLogin, setNeedsLogin] = useState(false);
  const [checkedLogin, setCheckedLogin] = useState(false);
  const [documents, setDocuments] = useState<LibraryDocumentResponse[] | null>(null);
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
            <h1>로그인하고 투자교육 자료를 읽어보세요</h1>
            <p className="lede">
              AI 코치와 맞춤 퀴즈가 근거로 삼는 공공기관 자료를 읽기 편한 글로 정리해뒀어요.
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

  const totalArticles = documents?.reduce((sum, d) => sum + d.articleCount, 0) ?? 0;

  return (
    <div>
      <TopNav right={documents ? `자료 ${documents.length}건` : '자료실'} />
      <div className="page">
        <div className="hero" style={{ gap: 14 }}>
          <div className="eyebrow">
            <span className="badge">짐</span>
            자료실
          </div>
          <h1 style={{ fontSize: 40 }}>투자교육 자료 모음</h1>
          <p className="lede" style={{ fontSize: 15 }}>
            AI 코치와 맞춤 퀴즈가 실제로 검색해서 근거로 삼는 자료예요. 책 전체가 아니라 주제별
            글로 나눠 읽기 편하게 정리했어요{totalArticles > 0 ? ` — 지금까지 ${totalArticles}개.` : '.'}
          </p>
        </div>

        {error && <p style={{ fontSize: 13, color: 'var(--red)' }}>{error}</p>}
        {!error && !documents && <p style={{ fontSize: 13, color: 'var(--muted)' }}>불러오는 중...</p>}
        {!error && documents && documents.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>아직 등록된 자료가 없어요.</p>
        )}

        <div className="lib-doc-grid">
          {documents?.map((doc) => {
            const isEmpty = doc.articleCount === 0;
            const card = (
              <>
                {doc.orgName && (
                  <span className="lib-doc-org">
                    {doc.orgName}
                    {doc.year ? ` · ${doc.year}` : ''}
                  </span>
                )}
                <p className="lib-doc-title">{doc.title}</p>
                <span className={`lib-doc-stat${isEmpty ? ' is-empty' : ''}`}>
                  {isEmpty ? '준비 중' : `글 ${doc.articleCount}개 →`}
                </span>
              </>
            );
            return isEmpty ? (
              <div key={doc.id} className="lib-doc-card is-empty" data-knower-seat="">
                {card}
              </div>
            ) : (
              <Link key={doc.id} href={`/library/${doc.id}`} className="lib-doc-card" data-knower-seat="" data-knower-swing-seat="">
                {card}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
