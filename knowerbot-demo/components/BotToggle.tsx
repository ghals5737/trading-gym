'use client';

import { useEffect, useState } from 'react';

// 3D KnowerBot 숨기기/보이기 토글.
// 로봇이 본문 위를 돌아다녀 방해된다는 피드백이 있어 넣었다. 캔버스만 감추고
// 채팅 패널은 남겨둬서, 숨긴 상태에서도 KnowerBot 대화는 계속 쓸 수 있다.
// 선택은 localStorage에 남겨 페이지를 옮겨도 유지된다.

const STORAGE_KEY = 'kg_bot_hidden';

export default function BotToggle() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) === '1';
    setHidden(saved);
    document.body.classList.toggle('bot-hidden', saved);
  }, []);

  const toggle = () => {
    const next = !hidden;
    setHidden(next);
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    document.body.classList.toggle('bot-hidden', next);
  };

  return (
    <button
      type="button"
      className="bot-toggle"
      onClick={toggle}
      title={hidden ? 'KnowerBot을 다시 보여줍니다' : '로봇이 화면을 가리면 숨겨보세요'}
    >
      {hidden ? '🤖 로봇 보이기' : '🤖 로봇 숨기기'}
    </button>
  );
}
