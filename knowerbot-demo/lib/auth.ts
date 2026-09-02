// Keys must match public/knowerbot-runtime.js — that vanilla script owns the
// login flow (it's what actually calls POST /api/auth/login), this module only
// handles the logout side from React components.
const ACCESS_TOKEN_KEY = 'kg_access_token';
const REFRESH_TOKEN_KEY = 'kg_refresh_token';
const LOGGED_IN_KEY = 'kg_logged_in';

export function apiBaseUrl(): string {
  // Keep in sync with API_BASE in public/knowerbot-runtime.js.
  // 배포에서는 빌드 시 NEXT_PUBLIC_API_BASE로 백엔드 주소를 주입함.
  //  - 통짜 EC2(nginx가 /api를 백엔드로 프록시): 빈 문자열("")로 주입 → 상대경로(/api/...) 호출
  //  - 분리 배포: 절대주소(예: https://api.example.com)로 주입
  // 아예 미설정이면 로컬 개발 가정(같은 호스트의 :8079). ||가 아니라 undefined 체크인 이유:
  // 빈 문자열("")도 "같은 오리진"이라는 유효한 설정값이라서.
  const base = process.env.NEXT_PUBLIC_API_BASE;
  return base !== undefined ? base : `${window.location.protocol}//${window.location.hostname}:8079`;
}

export function getAccessToken(): string | null {
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

function clearAuthState() {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(LOGGED_IN_KEY);
  document.body.classList.remove('logged-in');
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
  clearAuthState();
  window.location.href = '/';
}

class ApiError extends Error {}

// access token은 15분마다 만료됨(백엔드 JwtProperties 기준) — 이 토큰 갱신 없이는 15분마다
// 강제 로그아웃되는 셈이라, 401을 맞으면 refresh token으로 한 번 자동 갱신 후 재시도함.
// 여러 요청이 동시에 401을 맞아도 refresh는 한 번만 나가도록 in-flight 프라미스를 공유.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return false;
  try {
    const response = await fetch(`${apiBaseUrl()}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) return false;
    const data = await response.json();
    window.localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
    window.localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

// 이 앱의 인증 필요 API 호출은 전부 이 함수를 거침(lib/*-api.ts 공용) — access token
// 만료(401)를 투명하게 처리해서 호출하는 쪽은 만료를 신경 쓸 필요가 없게 함.
// refresh token까지 만료/무효면 로그아웃 처리 후 에러를 던짐.
//
// 이 앱엔 authFetch 구현이 두 벌 있음(여기 React 번들용, public/knowerbot-runtime.js에
// vanilla-JS용) — 둘이 같은 JS 실행 컨텍스트가 아니라서 refreshInFlight를 공유할 수 없음.
// 페이지 로드 시 두 쪽이 거의 동시에 401을 맞으면 둘 다 같은(1회용) refresh token으로
// 갱신을 시도하는데, 하나는 성공(토큰 교체)하고 다른 하나는 이미 소모된 토큰이라 실패함 —
// 그 실패한 쪽이 그대로 로그아웃돼버렸던 실제 버그(라이브로 재현·확인함). 그래서 refresh
// 시도 전후로 localStorage의 access token이 이미 바뀌어 있는지 먼저 확인해서, "누군가 이미
// 갱신했으면 그 결과로 재시도"하도록 함 — in-flight 프라미스 공유만으론 다른 실행 컨텍스트의
// 동시 시도까지는 못 막아서 이 보강이 필요함.
export async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const doFetch = () => {
    const token = getAccessToken();
    return fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  };

  const tokenAtStart = getAccessToken();
  let response = await doFetch();
  if (response.status === 401) {
    if (getAccessToken() !== tokenAtStart) {
      // 다른 곳(vanilla runtime.js 쪽 등)에서 그 사이 이미 갱신함 — 새 토큰으로 재시도.
      response = await doFetch();
    } else {
      if (!refreshInFlight) {
        refreshInFlight = refreshAccessToken().finally(() => {
          refreshInFlight = null;
        });
      }
      const refreshed = await refreshInFlight;
      if (refreshed || getAccessToken() !== tokenAtStart) {
        response = await doFetch();
      } else {
        clearAuthState();
        window.location.href = '/';
        throw new ApiError('세션이 만료됐어요. 다시 로그인해주세요.');
      }
    }
  }

  if (response.status === 204) return null as T;
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.error || `요청이 실패했어요 (${response.status})`);
  }
  return response.json() as Promise<T>;
}
