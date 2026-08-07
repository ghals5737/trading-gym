import Link from 'next/link';
import { levelUp, aiCharacter } from '../../../lib/mock-data';

export default function LevelUpPage() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(13, 18, 10, 0.55)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: 'min(520px, 100%)',
          background: 'var(--white)',
          borderRadius: 24,
          padding: '40px 40px 36px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          textAlign: 'center',
          boxShadow: '0 24px 60px rgba(13, 18, 10, 0.3)',
        }}
      >
        <div className="eyebrow" style={{ justifyContent: 'center' }}>
          레벨 업!
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span
            style={{
              padding: '10px 14px',
              borderRadius: 999,
              background: 'var(--chip)',
              color: 'var(--muted)',
              fontSize: 16,
              fontWeight: 800,
            }}
          >
            Lv.{levelUp.fromLevel}
          </span>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--muted)' }}>→</span>
          <span
            style={{
              padding: '11px 16px',
              borderRadius: 999,
              background: 'var(--green)',
              color: 'white',
              fontSize: 18,
              fontWeight: 800,
            }}
          >
            Lv.{levelUp.toLevel}
          </span>
        </div>

        <div style={{ fontSize: 72 }} aria-hidden>
          🤖
        </div>

        <h2 style={{ margin: 0, fontSize: 20 }}>
          {levelUp.fromTier} → {levelUp.toTier}
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--soft)', lineHeight: 1.6 }}>
          {levelUp.message}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, width: '100%' }}>
          {aiCharacter.xpSources.map((s) => (
            <div key={s.label} style={{ background: 'var(--bg)', borderRadius: 10, padding: 12 }}>
              <small style={{ display: 'block', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                {s.label}
              </small>
              <strong style={{ fontSize: 13, color: 'var(--green)' }}>{s.value}</strong>
            </div>
          ))}
        </div>

        <Link href="/simulation" className="btn btn-primary btn-block">
          계속 훈련하기
        </Link>
      </div>
    </div>
  );
}
