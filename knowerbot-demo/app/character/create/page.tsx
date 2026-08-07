import Link from 'next/link';

export default function CharacterCreatePage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 24px',
        background:
          'radial-gradient(circle at 50% 0%, var(--green-chip) 0%, var(--bg) 62%)',
      }}
    >
      <div
        style={{
          width: 'min(640px, 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          textAlign: 'center',
        }}
      >
        <div className="eyebrow">환영해요</div>
        <h1>
          나만의 AI 캐릭터가
          <br />
          태어났어요!
        </h1>

        <div style={{ position: 'relative', margin: '12px 0' }}>
          <div
            style={{
              width: 220,
              height: 220,
              borderRadius: '50%',
              background: 'var(--green-chip)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 72,
            }}
            aria-hidden
          >
            🤖
          </div>
          <div
            style={{
              position: 'absolute',
              left: '50%',
              bottom: -14,
              transform: 'translateX(-50%)',
              background: 'var(--green)',
              color: 'white',
              fontSize: 14,
              fontWeight: 800,
              padding: '8px 16px',
              borderRadius: 999,
              boxShadow: '0 8px 20px rgba(17, 30, 22, 0.18)',
            }}
          >
            Lv. 1
          </div>
        </div>

        <div
          style={{
            width: '100%',
            background: 'var(--white)',
            border: '1px solid var(--line)',
            borderRadius: 16,
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            textAlign: 'left',
          }}
        >
          <label htmlFor="char-name" style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
            캐릭터 이름을 지어주세요
          </label>
          <input
            id="char-name"
            defaultValue="KnowerBot"
            style={{
              height: 46,
              borderRadius: 10,
              border: '1px solid var(--line)',
              background: 'var(--bg)',
              padding: '0 14px',
              fontSize: 15,
              fontWeight: 800,
              color: 'var(--ink)',
            }}
          />
        </div>

        <p className="lede" style={{ fontSize: 13, textAlign: 'center' }}>
          이 캐릭터랑 같이 몇 가지 질문에 답하면서 시작해봐요. 학습·모의투자·퀴즈 활동을 먹고
          자라서, 레벨이 오를수록 새로운 모습과 기능이 열려요.
        </p>

        <Link href="/onboarding" className="btn btn-primary btn-block">
          사전 조사 시작하기
        </Link>
      </div>
    </div>
  );
}
