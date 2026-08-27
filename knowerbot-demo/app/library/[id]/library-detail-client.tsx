'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import TopNav from '../../../components/TopNav';
import LoginButton from '../../../components/LoginButton';
import {
  getLibraryArticleStatCounts,
  getLibraryArticles,
  getLibraryDocuments,
  type LibraryArticleListResponse,
  type LibraryDocumentResponse,
} from '../../../lib/library-api';
import { SESSION_STAT_LABELS, type SessionStatKey } from '../../../lib/user-api';

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

const PAGE_SIZE = 20;

export default function LibraryDetailClient({ documentId }: { documentId: number }) {
  const [needsLogin, setNeedsLogin] = useState(false);
  const [checkedLogin, setCheckedLogin] = useState(false);
  const [document, setDocument] = useState<LibraryDocumentResponse | null>(null);
  const [statCounts, setStatCounts] = useState<Partial<Record<SessionStatKey, number>>>({});
  const [selectedStat, setSelectedStat] = useState<SessionStatKey | null>(null);
  const [page, setPage] = useState(0);
  const [list, setList] = useState<LibraryArticleListResponse | null>(null);
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

  // 문서 메타·지표별 개수는 필터 바뀔 때마다 다시 부를 필요 없어서 한 번만 불러옴.
  useEffect(() => {
    if (!checkedLogin || needsLogin) return;
    Promise.all([getLibraryDocuments(), getLibraryArticleStatCounts(documentId)])
      .then(([docs, counts]) => {
        setDocument(docs.find((d) => d.id === documentId) ?? null);
        setStatCounts(counts);
      })
      .catch((e) => setError(e instanceof Error ? e.message : '자료를 불러오지 못했어요'));
  }, [checkedLogin, needsLogin, documentId]);

  useEffect(() => {
    if (!checkedLogin || needsLogin) return;
    getLibraryArticles(documentId, { statKey: selectedStat ?? undefined, offset: page * PAGE_SIZE, limit: PAGE_SIZE })
      .then(setList)
      .catch((e) => setError(e instanceof Error ? e.message : '글 목록을 불러오지 못했어요'));
  }, [checkedLogin, needsLogin, documentId, selectedStat, page]);

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
            <h1>로그인하고 이 자료의 글을 읽어보세요</h1>
            <div className="cta-row">
              <LoginButton className="btn btn-primary">로그인</LoginButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const totalCount = document?.articleCount ?? 0;
  const totalPages = list ? Math.max(1, Math.ceil(list.total / PAGE_SIZE)) : 1;
  const statKeys = Object.keys(SESSION_STAT_LABELS) as SessionStatKey[];

  function selectStat(key: SessionStatKey | null) {
    setSelectedStat(key);
    setPage(0);
  }

  return (
    <div>
      <TopNav right="자료실" />
      <div className="page-narrow">
        <Link href="/library" style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
          ← 자료 목록으로
        </Link>

        {error && <p style={{ fontSize: 13, color: 'var(--red)' }}>{error}</p>}

        {document && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {document.orgName && (
              <span className="lib-doc-org" style={{ alignSelf: 'flex-start' }}>
                {document.orgName}
                {document.year ? ` · ${document.year}` : ''}
              </span>
            )}
            <h1 style={{ fontSize: 30 }}>{document.title}</h1>
            {totalCount > 0 && <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>주제별 글 {totalCount}개</p>}
          </div>
        )}

        {totalCount > 0 && (
          <div className="lib-filter-row">
            <button
              className={`lib-filter-chip${selectedStat === null ? ' active' : ''}`}
              onClick={() => selectStat(null)}
            >
              전체 {totalCount}
            </button>
            {statKeys.map((key) => {
              const count = statCounts[key] ?? 0;
              if (count === 0) return null;
              return (
                <button
                  key={key}
                  className={`lib-filter-chip${selectedStat === key ? ' active' : ''}`}
                  onClick={() => selectStat(key)}
                >
                  {SESSION_STAT_LABELS[key].label} {count}
                </button>
              );
            })}
          </div>
        )}

        {!error && !list && <p style={{ fontSize: 13, color: 'var(--muted)' }}>불러오는 중...</p>}
        {list && list.articles.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            {totalCount === 0 ? '아직 정리된 글이 없어요. 곧 준비할게요.' : '이 지표에 해당하는 글이 아직 없어요.'}
          </p>
        )}

        <div className="lib-article-list">
          {list?.articles.map((article) => (
            <Link key={article.id} href={`/library/${documentId}/articles/${article.id}`} className="lib-article-card">
              <div style={{ flex: 1, minWidth: 0 }}>
                {article.targetStatKey && (
                  <span
                    style={{
                      display: 'inline-block',
                      marginBottom: 6,
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--green)',
                      background: 'var(--green-chip)',
                      borderRadius: 999,
                      padding: '2px 8px',
                    }}
                  >
                    {SESSION_STAT_LABELS[article.targetStatKey].label}
                  </span>
                )}
                <p className="lib-article-title">{article.title}</p>
                {article.topicSummary && <p className="lib-article-summary">{article.topicSummary}</p>}
              </div>
              <span className="lib-article-page">
                {article.pageStart === article.pageEnd
                  ? `${article.pageStart}쪽`
                  : `${article.pageStart}~${article.pageEnd}쪽`}
              </span>
            </Link>
          ))}
        </div>

        {list && list.total > PAGE_SIZE && (
          <div className="lib-pagination">
            <button
              className="lib-pagination-btn"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ← 이전
            </button>
            <span className="lib-pagination-status">
              {page + 1} / {totalPages}
            </span>
            <button
              className="lib-pagination-btn"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              다음 →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
