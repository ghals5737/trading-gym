import Link from 'next/link';
import TopNav from '../../components/TopNav';
import { scenarioQuiz } from '../../lib/mock-data';

export default function QuizPage() {
  return (
    <div>
      <TopNav right={`+${scenarioQuiz.xpGain} XP 획득 중`} />
      <div className="page-narrow">
        <div className="eyebrow">⚡ 상황 퀴즈</div>
        <h1 style={{ fontSize: 30 }}>
          이런 상황이라면,
          <br />
          당신의 선택은?
        </h1>

        <div style={{ background: 'var(--red-chip)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span
              style={{
                background: 'var(--red)',
                color: 'white',
                fontSize: 11,
                fontWeight: 800,
                borderRadius: 999,
                padding: '3px 9px',
              }}
            >
              {scenarioQuiz.tag}
            </span>
            <strong style={{ fontSize: 14 }}>{scenarioQuiz.headline}</strong>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--soft)', lineHeight: 1.6 }}>
            {scenarioQuiz.context}
          </p>
        </div>

        <h3 style={{ fontSize: 15, margin: 0 }}>당신의 선택은?</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {scenarioQuiz.options.map((opt) => (
            <div
              key={opt.label}
              style={{
                padding: '14px 18px',
                borderRadius: 14,
                background: opt.selected ? 'var(--green-chip)' : 'var(--white)',
                border: `${opt.selected ? 2 : 1}px solid ${opt.selected ? 'var(--green)' : 'var(--line)'}`,
              }}
            >
              <strong style={{ display: 'block', fontSize: 14, color: opt.selected ? 'var(--green)' : 'var(--ink)' }}>
                {opt.label}
              </strong>
              <span style={{ fontSize: 12, color: opt.selected ? '#266b52' : 'var(--muted)' }}>
                {opt.hint}
              </span>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--green)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong style={{ color: 'white', fontSize: 13 }}>KnowerBot의 코멘트</strong>
            <strong style={{ color: 'white', fontSize: 13 }}>+{scenarioQuiz.xpGain} XP</strong>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.92)', lineHeight: 1.6 }}>
            {scenarioQuiz.feedback}
          </p>
        </div>

        <Link href="/dashboard" className="btn btn-primary btn-block">
          다음 상황 보기
        </Link>
      </div>
    </div>
  );
}
