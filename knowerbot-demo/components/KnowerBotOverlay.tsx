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
        {/* 닫기 버튼이 채팅창 안에 있다는 게 핵심 —
            기존 #bot-close는 3D 로봇 머리 위를 따라다녀서(runtime의 updateClosePosition)
            채팅창은 화면 아래 가운데, 닫기 버튼은 로봇이 서 있는 아무 데나에 있었다.
            "닫는 창이 너무 멀리 있다"는 피드백이 이것. 로봇을 따라다니는 버튼은 그대로 두고,
            채팅창 자체에도 항상 같은 자리에 있는 닫기를 추가한다. */}
        <div className="chat-head" id="chat-toggle">
          <span>KnowerBot 대화</span>
          <span className="chat-head-right">
            <span className="chat-online">온라인</span>
            <button type="button" id="chat-close" aria-label="대화 닫기" title="대화 닫기">
              ✕
            </button>
          </span>
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
