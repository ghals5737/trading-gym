'use client';

// Global, route-independent UI: the login gate and the 3D KnowerBot overlay
// (canvas + chat panel). knowerbot-runtime.js queries these elements by
// id/attribute once on load, so they must exist in the DOM on every route.
export default function KnowerBotOverlay() {
  return (
    <>
      <div id="login-overlay">
        <div className="login-modal">
          <h2>트레이딩 짐 로그인</h2>
          <p>백엔드 서버의 계정으로 로그인해요. (데모 계정: demo / password1234)</p>
          <form className="login-form" id="login-form">
            <input id="login-id" autoComplete="username" placeholder="아이디" />
            <input
              id="login-password"
              autoComplete="current-password"
              placeholder="비밀번호"
              type="password"
            />
            <p className="login-error" id="login-error" role="alert" />
            <button type="submit" id="login-submit">입장하기</button>
          </form>
        </div>
      </div>

      <canvas id="stage" />
      <div id="seat-shadow" />
      <div id="bot-bubble" />
      <button id="bot-hitbox" type="button" aria-label="KnowerBot과 대화하기" />
      <button id="bot-close" type="button" aria-label="대화 닫기">
        ✕
      </button>
      <section id="chat-panel" aria-label="KnowerBot 채팅">
        <div className="chat-head" id="chat-toggle">
          <span>KnowerBot 대화</span>
          <span>온라인</span>
        </div>
        <div className="chat-log" id="chat-log">
          <div className="chat-msg bot">필요하면 저를 눌러서 불러주세요.</div>
        </div>
        <form className="chat-form" id="chat-form">
          <input id="chat-input" autoComplete="off" placeholder="메시지 입력" />
          <button type="submit">전송</button>
        </form>
      </section>
    </>
  );
}
