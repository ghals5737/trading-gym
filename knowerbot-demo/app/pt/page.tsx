import Link from 'next/link';
import TopNav from '../../components/TopNav';
import { ptLesson } from '../../lib/mock-data';

export default function PtPage() {
  return (
    <div>
      <TopNav right="오늘의 PT · 3/4 완료" />
      <div className="page-narrow">
        {/* AI's narration — mirrors the speech-bubble-above-the-robot pattern */}
        <div
          style={{
            background: 'var(--white)',
            border: '1px solid var(--line)',
            borderRadius: '18px 18px 18px 4px',
            padding: '16px 20px',
            boxShadow: '0 8px 24px rgba(28,32,24,0.06)',
          }}
        >
          <p style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.6, color: 'var(--soft)' }}>
            {ptLesson.intro}
          </p>
          <strong style={{ display: 'block', fontSize: 16, marginBottom: 10 }}>{ptLesson.topic}</strong>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--ink)' }}>
            {ptLesson.explanation}
          </p>
        </div>

        {/* the chat log below only carries the user's turn: the quiz choice */}
        <div
          style={{
            background: 'var(--white)',
            border: '1px solid var(--line)',
            borderRadius: 18,
            overflow: 'hidden',
          }}
        >
          <div className="chat-head" style={{ position: 'static' }}>
            <span>KnowerBot 대화 · 오늘의 PT</span>
            <span>온라인</span>
          </div>
          <div style={{ borderTop: '1px solid var(--line)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
              {ptLesson.quizQuestion}
            </p>
            {ptLesson.quizOptions.map((opt) => (
              <button
                key={opt.label}
                style={{
                  textAlign: 'left',
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: `1px solid ${opt.correct ? 'var(--green)' : 'var(--line)'}`,
                  background: opt.correct ? 'var(--green-chip)' : 'var(--white)',
                  color: opt.correct ? 'var(--green)' : 'var(--ink)',
                  fontWeight: opt.correct ? 800 : 600,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {opt.label}
                {opt.correct ? '  ✓' : ''}
              </button>
            ))}
          </div>
          <div style={{ borderTop: '1px solid var(--line)', display: 'flex', gap: 8, padding: 12 }}>
            <input
              placeholder="궁금한 점 물어보기"
              style={{
                flex: 1,
                height: 46,
                border: '1px solid var(--line)',
                borderRadius: 10,
                padding: '0 12px',
                fontSize: 14,
              }}
            />
            <button className="btn btn-primary btn-sm">전송</button>
          </div>
        </div>

        <div style={{ background: 'var(--green)', color: 'white', borderRadius: 14, padding: 16, fontSize: 13, lineHeight: 1.6 }}>
          {ptLesson.feedback}
        </div>

        <Link href="/my" className="btn btn-primary btn-block">
          학습 완료하고 리포트 보기
        </Link>
      </div>
    </div>
  );
}
