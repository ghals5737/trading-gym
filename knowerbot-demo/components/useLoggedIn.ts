'use client';

import { useEffect, useState } from 'react';

// Login state lives as a plain body class (set by knowerbot-runtime.js),
// not React state, so components that need to react to it poll once
// mounted and watch for class changes.
export default function useLoggedIn() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const check = () => setLoggedIn(document.body.classList.contains('logged-in'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return loggedIn;
}
