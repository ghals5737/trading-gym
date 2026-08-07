// Keys must match public/knowerbot-runtime.js — that vanilla script owns the
// login flow (it's what actually calls POST /api/auth/login), this module only
// handles the logout side from React components.
const ACCESS_TOKEN_KEY = 'kg_access_token';
const REFRESH_TOKEN_KEY = 'kg_refresh_token';
const LOGGED_IN_KEY = 'kg_logged_in';

function apiBaseUrl(): string {
  // Keep in sync with API_BASE in public/knowerbot-runtime.js.
  return `${window.location.protocol}//${window.location.hostname}:8079`;
}

export async function logout(): Promise<void> {
  const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
  if (refreshToken) {
    try {
      await fetch(`${apiBaseUrl()}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // best-effort — still clear local state even if the backend is unreachable
    }
  }
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(LOGGED_IN_KEY);
  document.body.classList.remove('logged-in');
  window.location.href = '/';
}
