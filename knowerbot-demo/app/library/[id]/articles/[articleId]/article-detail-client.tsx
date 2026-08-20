'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import TopNav from '../../../../../components/TopNav';
import LoginButton from '../../../../../components/LoginButton';
import {
  getLibraryArticle,
  getLibraryArticles,
  type LibraryArticleDetailResponse,
  type LibraryArticleSummaryResponse,
} from '../../../../../lib/library-api';

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

// articlegen.py가 본문 맨 끝에 "출처: ..." 줄을 붙여서 저장해둠 — 본문이랑 섞어서
// 그냥 텍스트로 보여주는 대신 따로 떼어내서 인용 박스로 보여줌.
function splitCitation(body: string): { text: string; citation: string | null } {
  const marker = '출처:';
  const index = body.lastIndexOf(marker);
  if (index === -1) return { text: body, citation: null };
  return { text: body.slice(0, index).trim(), citation: body.slice(index).trim() };
}

export default function ArticleDetailClient({ documentId, articleId }: { documentId: number; articleId: number }) {
  const [needsLogin, setNeedsLogin] = useState(false);
  const [checkedLogin, setCheckedLogin] = useState(false);
  const [article, setArticle] = useState<LibraryArticleDetailResponse | null>(null);
  const [siblings, setSiblings] = useState<LibraryArticleSummaryResponse[] | null>(null);
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
    setArticle(null);
    // prev/next는 문서 전체 순서 기준 — 필터 없이 큰 limit으로 한 번에 불러옴(제목만이라
    // 가벼움).
    Promise.all([getLibraryArticle(articleId), getLibraryArticles(documentId, { limit: 1000 })])
      .then(([art, list]) => {
        setArticle(art);
        setSiblings(list.articles);
      })
      .catch((e) => setError(e instanceof Error ? e.message : '글을 불러오지 못했어요'));
  }, [checkedLogin, needsLogin, documentId, articleId]);

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
            <h1>로그인하고 글을 읽어보세요</h1>
            <div className="cta-row">
              <LoginButton className="btn btn-primary">로그인</LoginButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { text, citation } = article ? splitCitation(article.body) : { text: '', citation: null };
  const currentIndex = siblings?.findIndex((s) => s.id === articleId) ?? -1;
  const prev = siblings && currentIndex > 0 ? siblings[currentIndex - 1] : null;
  const next = siblings && currentIndex >= 0 && currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;

  return (
    <div>
      <TopNav right="자료실" />
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 32px 100px' }}>
        <Link href={`/library/${documentId}`} style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
          ← 목록으로
        </Link>

        {error && <p style={{ marginTop: 24, fontSize: 13, color: 'var(--red)' }}>{error}</p>}
        {!error && !article && <p style={{ marginTop: 24, fontSize: 13, color: 'var(--muted)' }}>불러오는 중...</p>}

        {article && (
          <>
            <div style={{ marginTop: 20, marginBottom: 28 }}>
              {article.orgName && (
                <span className="lib-doc-org">
                  {article.orgName} 「{article.documentTitle}」
                </span>
              )}
              <h1 style={{ fontSize: 32, margin: '14px 0 0', lineHeight: 1.35 }}>{article.title}</h1>
            </div>

            <p className="lib-article-body">{text}</p>

            {citation && <p className="lib-citation">📚 {citation.replace(/^출처:\s*/, '')}</p>}

            {(prev || next) && (
              <div className="lib-article-nav">
                {prev ? (
                  <Link href={`/library/${documentId}/articles/${prev.id}`} className="lib-article-nav-link">
                    <span className="lib-article-nav-label">← 이전 글</span>
                    <span className="lib-article-nav-title">{prev.title}</span>
                  </Link>
                ) : (
                  <span />
                )}
                {next ? (
                  <Link href={`/library/${documentId}/articles/${next.id}`} className="lib-article-nav-link next">
                    <span className="lib-article-nav-label">다음 글 →</span>
                    <span className="lib-article-nav-title">{next.title}</span>
                  </Link>
                ) : (
                  <span />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
