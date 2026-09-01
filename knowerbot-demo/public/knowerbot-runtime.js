(function bootKnowerBot(){
  if (window.__knowerbotRuntimeStarted) return;
  if (!window.THREE || !window.THREE.GLTFLoader) { window.setTimeout(bootKnowerBot, 30); return; }
  window.__knowerbotRuntimeStarted = true;
const THREE = window.THREE;
const GLTFLoader = THREE.GLTFLoader;

const MODEL_URL = "/assets/swimming_knowerbot.glb";
const TEXTURE_URLS = {
  map: "/assets/KnowerBot_Albedo.png",
  normalMap: "/assets/KnowerBot_Normal.png",
  metalnessMap: "/assets/KnowerBot_Metalness.png",
  roughnessMap: "/assets/KnowerBot_Roughness.png",
  emissiveMap: "/assets/KnowerBot_Emission.png",
};
const ANIMATION_URLS = {
  idle: "/assets/idle.glb",
  walking: "/assets/walking.glb",
  jump: "/assets/jump.glb",
  jumpDown: "/assets/jump_down.glb",
  sitting: "/assets/sitting.glb",
  flair: "/assets/flair.glb",
  flying: "/assets/flying.glb",
  swingStart: "/assets/start_swinging.glb",
  swingLand: "/assets/swing_to_land.glb",
  fallFlat: "/assets/falling_flat.glb",
};

// Backend lives on :8079 on whatever host served this page (8079, not the Spring
// default 8080 — 8080/8081/8090 are already taken by other local projects on this
// machine). This lets phone/LAN access (see reference_knowerbot_demo_location
// memory) keep working without a hardcoded IP, as long as the backend also
// listens on 0.0.0.0.
// 배포에서는 layout.tsx가 window.KNOWERBOT_API_BASE(=NEXT_PUBLIC_API_BASE)를 먼저 심어줌 —
// 정적 파일이라 process.env를 직접 못 읽어서 window 전역으로 전달받는다. 미설정이면 로컬 가정.
const API_BASE = window.KNOWERBOT_API_BASE || `${window.location.protocol}//${window.location.hostname}:8079`;
const ACCESS_TOKEN_KEY = 'kg_access_token';
const REFRESH_TOKEN_KEY = 'kg_refresh_token';

function authHeaders() {
  let token = null;
  try { token = window.localStorage.getItem(ACCESS_TOKEN_KEY); } catch (e) {}
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// access token은 15분마다 만료됨(백엔드 JwtProperties 기준) — 온보딩 채팅처럼 오래 걸리는
// 세션 도중 만료돼도 끊기지 않게, 401을 맞으면 refresh token으로 한 번 자동 갱신하고 재시도함.
// lib/auth.ts의 authFetch와 같은 목적(별도 vanilla-JS 번들이라 로직은 중복 구현).
let refreshInFlight = null;
function refreshAccessToken() {
  let refreshToken = null;
  try { refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY); } catch (e) {}
  if (!refreshToken) return Promise.resolve(false);
  return fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data) return false;
      try {
        window.localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
        window.localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
      } catch (e) {}
      return true;
    })
    .catch(() => false);
}

function currentAccessToken() {
  try { return window.localStorage.getItem(ACCESS_TOKEN_KEY); } catch (e) { return null; }
}

// fetch를 그대로 대체 — headers에 authHeaders()를 미리 합쳐 넣고, 401이면 refresh 후 한 번만 재시도.
// refresh까지 실패하면(리프레시 토큰도 만료) 로그인 화면으로 돌려보냄.
//
// 이 vanilla-JS 쪽과 lib/auth.ts(React 번들) 쪽에 authFetch가 각각 따로 있음 — 같은 JS
// 실행 컨텍스트가 아니라 refreshInFlight를 공유 못 함. 페이지 로드 시 두 쪽이 거의 동시에
// 401을 맞으면 둘 다 같은(1회용) refresh token으로 갱신을 시도해서 하나는 성공하고 하나는
// 이미 소모된 토큰이라 실패하는 게 실제로 발생함(라이브로 재현·확인함) — 그 실패한 쪽이
// 그대로 로그아웃되지 않도록, 시도 전후로 access token이 이미 바뀌어 있으면(다른 쪽이 이미
// 갱신 성공) 새 토큰으로 재시도함.
function authFetch(url, options) {
  const opts = options || {};
  const withAuth = () =>
    fetch(url, Object.assign({}, opts, { headers: Object.assign({}, opts.headers, authHeaders()) }));
  const tokenAtStart = currentAccessToken();
  return withAuth().then((res) => {
    if (res.status !== 401) return res;
    if (currentAccessToken() !== tokenAtStart) {
      // 다른 곳(React 쪽 authFetch 등)에서 그 사이 이미 갱신함 — 새 토큰으로 재시도.
      return withAuth();
    }
    if (!refreshInFlight) {
      refreshInFlight = refreshAccessToken().finally(() => { refreshInFlight = null; });
    }
    return refreshInFlight.then((refreshed) => {
      if (refreshed || currentAccessToken() !== tokenAtStart) {
        return withAuth();
      }
      try {
        window.localStorage.removeItem(ACCESS_TOKEN_KEY);
        window.localStorage.removeItem(REFRESH_TOKEN_KEY);
        window.localStorage.removeItem('kg_logged_in');
      } catch (e) {}
      window.location.href = '/';
      return Promise.reject(new Error('세션이 만료됐어요'));
    });
  });
}

const canvas = document.getElementById('stage');
const loginFormEl = document.getElementById('login-form');
const loginIdEl = document.getElementById('login-id');
const loginPasswordEl = document.getElementById('login-password');
const loginErrorEl = document.getElementById('login-error');
const loginSubmitEl = document.getElementById('login-submit');
const seatShadowEl = document.getElementById('seat-shadow');
const bubbleEl = document.getElementById('bot-bubble');
const hitboxEl = document.getElementById('bot-hitbox');
const closeEl = document.getElementById('bot-close');
// 채팅창 헤더 안의 닫기 버튼 — 로봇을 따라다니는 #bot-close와 달리 항상 같은 자리에 있다.
const chatCloseEl = document.getElementById('chat-close');
const chatPanelEl = document.getElementById('chat-panel');
const chatToggleEl = document.getElementById('chat-toggle');
const chatLogEl = document.getElementById('chat-log');
const chatFormEl = document.getElementById('chat-form');
const chatInputEl = document.getElementById('chat-input');
const goSimEl = document.getElementById('go-sim');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();

const FOV = 32;
const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 100);
const CAM_DIST = 9;
camera.position.set(0, 1.15, CAM_DIST);
camera.lookAt(0, 0.15, 0);

// ---------- lighting ----------
const hemi = new THREE.HemisphereLight(0xffffff, 0x3a3226, 1.15);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xfff3df, 2.1);
key.position.set(4, 6, 5);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 1;
key.shadow.camera.far = 20;
key.shadow.camera.left = -4;
key.shadow.camera.right = 4;
key.shadow.camera.top = 4;
key.shadow.camera.bottom = -4;
key.shadow.bias = -0.001;
scene.add(key);

const rim = new THREE.DirectionalLight(0x4fceac, 0.9);
rim.position.set(-5, 3, -4);
scene.add(rim);

const MODEL_FACE_RIGHT = Math.PI / 2;
const MODEL_FACE_SEATED = 0;

// ---------- contact shadow (grounds the character on the page) ----------
function makeShadowTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(20,20,15,0.38)');
  g.addColorStop(0.7, 'rgba(20,20,15,0.14)');
  g.addColorStop(1, 'rgba(20,20,15,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
const shadowMat = new THREE.MeshBasicMaterial({
  map: makeShadowTexture(),
  transparent: true,
  depthWrite: false,
});
const shadowDecal = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), shadowMat);
shadowDecal.rotation.x = -Math.PI / 2;
shadowDecal.position.y = -1.36;
scene.add(shadowDecal);

// ---------- KnowerBot ----------
const rig = new THREE.Group();
scene.add(rig);

function visibleHalfWidthAt(z) {
  const dist = camera.position.z - z;
  const halfHeight = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * dist;
  return halfHeight * camera.aspect;
}

const WALK_Z = 0;
// The loaded model is centered/offset inside `rig` at load time (see the
// GLTFLoader callback below, `model.position.y += -1.36 - worldBox.min.y`).
// Screen-space UI (hitbox, speech bubble, close button) needs to track the
// model's actual feet/head, not `rig.position` directly — these are filled
// in once the model finishes loading.
let MODEL_FEET_Y = -1.36;
let MODEL_HEAD_Y = -1.36 + 1.08;
const wander = {
  targetX: 0,
  speed: 0.42,
  pauseUntil: 0,
};
const botState = {
  mode: 'loading',
  baseY: 0,
  nextSeatAt: 8,
  seatStartedAt: 0,
  sitStartedAt: 0,
  jumpStartedAt: 0,
  jumpDuration: 0.95,
  startX: 0,
  startY: 0,
  targetX: 0,
  targetY: 0,
  targetZ: 0,
  velocityX: 0,
  jumpStartRotation: 0,
  swimTargetX: 0,
  chatStartedAt: 0,
  targetScale: 1,
  tourSelector: null,
};

// 화면 오른쪽 구역 안에서만 돌아다니게 한다. 예전엔 좌우 전 구간을 무작위로 걸어다녀서
// 본문(차트·카드) 위를 계속 가로질렀고 "정신사납다"는 피드백이 있었다. 챗으로 부르면
// 어차피 chatTarget()으로 다가오니, 평소 배회 범위만 좁혀도 방해가 사라진다.
function pickWaypoint() {
  const margin = 0.7;
  const halfW = Math.min(visibleHalfWidthAt(WALK_Z) * margin, 3.4);
  wander.targetX = (0.45 + Math.random() * 0.5) * halfW;
}
pickWaypoint();

let mixer = null;
let activeAction = null;
const actions = {};
const clock = new THREE.Clock();
window.__debug = { scene, camera, renderer, rig, botState, actions, get mixer() { return mixer; }, frameCount: 0, lastErr: null };
let bubbleTimer = 0;
let nextIdleBubbleAt = 0;
// Login state is saved locally so it survives page reloads / landing
// directly on a route other than "/" (e.g. sharing a link, or a phone
// bookmarking a specific screen) — otherwise only the homepage could ever
// open the login modal and every other route would look logged-out.
let isLoggedIn = false;
try {
  isLoggedIn = window.localStorage.getItem('kg_logged_in') === '1';
} catch (e) {}
if (isLoggedIn) {
  document.body.classList.add('logged-in');
  if (chatInputEl) chatInputEl.disabled = false;
}
// 새로고침해도 이전 대화가 사라지지 않게, 페이지 뜨자마자 DB에 저장된 채팅 로그를
// 미리 불러와서 채팅창(닫혀있어도 DOM엔 이미 그려짐)에 채워둠 — 열어보면 바로 보임.
let chatHistoryLoaded = false;
function loadChatHistory() {
  if (chatHistoryLoaded || !isLoggedIn) return;
  chatHistoryLoaded = true;
  authFetch(`${API_BASE}/api/chat/messages`, {})
    .then((res) => res.json())
    .then((messages) => {
      messages.forEach((m) => addChatMessage(m.role === 'USER' ? 'user' : 'bot', m.content));
    })
    .catch(() => {});
}
if (isLoggedIn) loadChatHistory();
// 로그인 폼을 거치지 않고(이미 로그인된 채로) 페이지를 새로 열었을 때도 온보딩을
// 안 했으면 보내야 하므로, startLoggedInDemo()의 리다이렉트와 별개로 여기서도 한 번 확인함.
// /onboarding 자체에서는 확인 안 함 — 이미 그 페이지에 있는데 또 리다이렉트하면
// 진행 중인 채팅 설문이 새로고침으로 끊길 수 있음.
if (isLoggedIn && window.location.pathname !== '/onboarding') {
  authFetch(`${API_BASE}/api/onboarding/profile`, {})
    .then((res) => {
      // replace(그냥 href 아님) — 강제 리다이렉트라 "뒤로가기"로 이 페이지로 되돌아오면
      // 어차피 또 리다이렉트될 뿐이라 히스토리에 남길 이유가 없음.
      if (res.status === 204) window.location.replace('/onboarding');
    })
    .catch(() => {});
}
// 사전조사(온보딩) 페이지에 온 거 자체가 이미 설문하러 온 거라, 로봇을 클릭 안 해도
// 자동으로 다가와서 채팅을 열게 함 — 처음 방문이든 "다시 진단받기"로 재방문이든 매번
// 트리거함(kg_seen_intro_chat 여부와 무관). 모델 로딩 시간을 감안해 살짝 지연.
if (isLoggedIn && window.location.pathname === '/onboarding') {
  // 모델 로딩이 1.5초보다 오래 걸릴 수 있어서 고정 지연 대신 준비될 때까지 재시도 —
  // 로딩 전에 enterChatMode를 걸어두면 위 Promise.all 가드가 상태를 지켜주지만,
  // 애니메이션이 아직 없으면 다가오는 모션 자체가 어색해서 준비 후에 부름.
  let onboardingApproachTries = 0;
  const tryApproach = () => {
    if (!isLoggedIn) return;
    if (actions.idle || actions.walking) {
      enterChatMode();
      return;
    }
    onboardingApproachTries += 1;
    if (onboardingApproachTries < 40) window.setTimeout(tryApproach, 500); // 최대 ~20초
  };
  window.setTimeout(tryApproach, 1200);
}
let pendingStartAfterLogin = false;
let autoChatTimer = 0;
let onboardingChecked = false;
// /onboarding?retake=1로 들어오면 프로필이 있어도 처음부터 다시 물어봄 — 마이페이지의
// "다시 진단받기" 버튼이 이 쿼리로 진입시킴. 각 답은 upsert라 새로 답하면 예전 답을 덮어씀.
let retakeRequested = false;
try {
  retakeRequested = new URLSearchParams(window.location.search).get('retake') === '1';
} catch (e) {}
// answers는 더 이상 여기서 안 들고 있음 — 매 턴 서버에 바로 저장되고(POST /answer),
// 채점은 submit 시점에 서버가 저장된 대화 전체를 보고 한 번에 함.
const surveyState = {
  active: false,
  questions: [],
  index: 0,
  // 나이대 질문(설문 맨 끝 1문항) — 점수 문항이 아니라 서버 questions에 없고,
  // 여기서만 관리함. "내 또래 대비 투자성향" 비교(마이페이지)에 쓰임.
  askingAge: false,
  ageAsked: false,
};

const textureLoader = new THREE.TextureLoader();
function loadTexture(url, colorSpace) {
  const texture = textureLoader.load(url);
  texture.colorSpace = colorSpace || THREE.NoColorSpace;
  texture.flipY = false;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

if (hitboxEl) hitboxEl.addEventListener('click', enterChatMode);
if (closeEl) closeEl.addEventListener('click', exitChatMode);
if (chatCloseEl) {
	chatCloseEl.addEventListener('click', (e) => {
		// 헤더(#chat-toggle)로 클릭이 새어 올라가지 않게 — 헤더에 다른 핸들러가 붙어도 안전.
		e.stopPropagation();
		exitChatMode();
	});
}
if (loginFormEl) {
  loginFormEl.addEventListener('submit', (event) => {
    event.preventDefault();
    submitLogin();
  });
}

async function submitLogin() {
  const username = loginIdEl ? loginIdEl.value.trim() : '';
  const password = loginPasswordEl ? loginPasswordEl.value : '';
  if (loginErrorEl) loginErrorEl.textContent = '';
  if (!username || !password) {
    if (loginErrorEl) loginErrorEl.textContent = '아이디와 비밀번호를 입력해주세요.';
    return;
  }
  if (loginSubmitEl) {
    loginSubmitEl.disabled = true;
    loginSubmitEl.textContent = '로그인 중...';
  }
  try {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (loginErrorEl) loginErrorEl.textContent = data.error || '로그인에 실패했어요.';
      return;
    }
    try {
      window.localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
      window.localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
    } catch (e) {}
    startLoggedInDemo();
  } catch (e) {
    if (loginErrorEl) loginErrorEl.textContent = '로그인 서버에 연결할 수 없어요. 백엔드가 켜져 있는지 확인해주세요.';
  } finally {
    if (loginSubmitEl) {
      loginSubmitEl.disabled = false;
      loginSubmitEl.textContent = '입장하기';
    }
  }
}
if (chatFormEl) {
  chatFormEl.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!chatInputEl) return;
    const value = chatInputEl.value;
    chatInputEl.value = '';
    handleChatSubmit(value);
  });
}
if (goSimEl) goSimEl.addEventListener('click', showSimulationPage);

const botMaps = {
  map: loadTexture(TEXTURE_URLS.map, THREE.SRGBColorSpace),
  normalMap: loadTexture(TEXTURE_URLS.normalMap),
  metalnessMap: loadTexture(TEXTURE_URLS.metalnessMap),
  roughnessMap: loadTexture(TEXTURE_URLS.roughnessMap),
  emissiveMap: loadTexture(TEXTURE_URLS.emissiveMap, THREE.SRGBColorSpace),
};

function loadGltf(url) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, resolve, undefined, reject);
  });
}

function setAction(name, fade = 0.25) {
  const next = actions[name] || actions.idle || actions.walking || actions.sitting || actions.jump || actions.swimming;
  if (!next || next === activeAction) return;
  next.reset().enabled = true;
  next.setEffectiveWeight(1);
  next.play();
  if (activeAction) activeAction.crossFadeTo(next, fade, false);
  activeAction = next;
}

function sanitizeClip(clip) {
  const clean = clip.clone();
  clean.tracks = clean.tracks.filter((track) => {
    const name = track.name;
    if (name.endsWith('.scale')) return false;
    if (name.endsWith('.position')) return false;
    if (/RootNode|KnowerBot|Sphere\.013/.test(name)) return false;
    return true;
  });
  clean.resetDuration();
  return clean;
}

function moveTowardX(targetX, maxSpeed, smooth, dt) {
  const dx = targetX - rig.position.x;
  const desired = THREE.MathUtils.clamp(dx * smooth, -maxSpeed, maxSpeed);
  botState.velocityX += (desired - botState.velocityX) * Math.min(1, dt * 7);
  rig.position.x += botState.velocityX * dt;
  if (Math.abs(dx) < 0.035 && Math.abs(botState.velocityX) < 0.06) {
    rig.position.x = targetX;
    botState.velocityX = 0;
  }
  if (Math.abs(botState.velocityX) > 0.02) faceDirection(botState.velocityX);
  return Math.abs(targetX - rig.position.x);
}

function screenToWorld(clientX, clientY, z = WALK_Z) {
  const ndc = new THREE.Vector3(
    clientX / window.innerWidth * 2 - 1,
    -(clientY / window.innerHeight) * 2 + 1,
    0.5
  );
  ndc.unproject(camera);
  const dir = ndc.sub(camera.position).normalize();
  const distance = (z - camera.position.z) / dir.z;
  return camera.position.clone().addScaledVector(dir, distance);
}

function worldToScreen(pos) {
  const p = pos.clone().project(camera);
  return {
    x: (p.x * 0.5 + 0.5) * window.innerWidth,
    y: (-p.y * 0.5 + 0.5) * window.innerHeight,
  };
}

function showBubble(text, duration = 3600) {
  if (!bubbleEl) return;
  bubbleEl.textContent = text;
  bubbleEl.classList.add('active');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => {
    bubbleEl.classList.remove('active');
  }, duration);
}

// Project a point defined in the model's own local space (0 = centered on
// its x/z axis, y measured from MODEL_FEET_Y/MODEL_HEAD_Y) through rig's
// current transform. This automatically stays correct through rig position
// changes *and* the scale-up that happens while walking up to chat.
function modelLocalToScreen(localY) {
  rig.updateMatrixWorld(true);
  const worldPt = rig.localToWorld(new THREE.Vector3(0, localY, 0));
  return worldToScreen(worldPt);
}

function updateBubblePosition() {
  if (!bubbleEl || !rig.children.length) return;
  const screen = modelLocalToScreen(MODEL_HEAD_Y + 0.08);
  const margin = 16;
  const x = THREE.MathUtils.clamp(screen.x, margin, window.innerWidth - margin);
  const y = THREE.MathUtils.clamp(screen.y, 72, window.innerHeight - margin);
  bubbleEl.style.left = `${x}px`;
  bubbleEl.style.top = `${y}px`;
}

function updateHitboxPosition() {
  if (!hitboxEl || !rig.children.length) return;
  const screen = modelLocalToScreen((MODEL_FEET_Y + MODEL_HEAD_Y) / 2);
  hitboxEl.style.left = `${screen.x}px`;
  hitboxEl.style.top = `${screen.y}px`;
}

function updateClosePosition() {
  if (!closeEl || !rig.children.length) return;
  const open = botState.mode === 'chatIdle';
  closeEl.classList.toggle('active', open);
  if (!open) return;
  const screen = modelLocalToScreen(MODEL_HEAD_Y + 0.34);
  closeEl.style.left = `${screen.x}px`;
  closeEl.style.top = `${screen.y}px`;
}

function chatTarget() {
  return {
    x: 0,
    y: botState.baseY + 1.35,
    z: 1.65,
    scale: 3.0,
  };
}

function setChatOpen(open) {
  if (!chatPanelEl) return;
  chatPanelEl.classList.toggle('open', open);
  if (open) {
    requestAnimationFrame(() => chatInputEl && chatInputEl.focus());
  }
}

function addChatMessage(role, text) {
  if (!chatLogEl) return;
  const msg = document.createElement('div');
  msg.className = `chat-msg ${role}`;
  msg.textContent = text;
  chatLogEl.appendChild(msg);
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
}

// enterChatMode(로그인 필요)와 knowerbotRequireLogin(로그인 없이도 다가옴, 아래) 둘 다
// 쓰는 "다가오기" 동작만 뽑아둠 — 로그인 여부에 따라 뭘 물어볼지만 달라짐.
function approachForChat() {
  setSeatAffordance(false);
  shadowDecal.visible = true;
  setChatOpen(false);
  const target = chatTarget();
  botState.mode = 'approachChat';
  botState.targetX = target.x;
  botState.targetY = target.y;
  botState.targetZ = target.z;
  botState.targetScale = target.scale;
  botState.chatStartedAt = performance.now() / 1000;
  setAction('walking');
}

function enterChatMode() {
  if (!isLoggedIn) {
    window.knowerbotRequireLogin();
    return;
  }
  approachForChat();
}

// 로그인 안 한 채로 /simulation, /my처럼 로그인이 꼭 필요한 페이지에 들어오면 React 쪽에서
// 이걸 불러서 로봇이 다가와 "로그인이 필요해요"라고 알려주게 함 — 실제 로그인은 유저가
// 네비게이션의 로그인 버튼을 직접 눌러서 함(여기서 로그인 모달을 자동으로 열진 않음).
let pendingLoginPrompt = false;
window.knowerbotRequireLogin = function () {
  if (isLoggedIn) return;
  pendingLoginPrompt = true;
  approachForChat();
};

function exitChatMode() {
  if (botState.mode !== 'approachChat' && botState.mode !== 'chatIdle') return;
  setChatOpen(false);
  setSeatAffordance(false);
  botState.targetZ = WALK_Z;
  botState.targetScale = 1;
  pickWaypoint();
  botState.mode = 'wander';
  showBubble('나중에 또 불러주세요!', 2400);
  setAction('walking', 0.15);
}

// 첫 방문 가이드 투어(ProductTour, React)가 스텝마다 부르는 함수 — 셀렉터로 가리키는
// nav 탭 쪽으로 걸어가서 서있게 함. 항상 셀렉터로 다시 찾게 해서(엘리먼트를 캐시하지
// 않음) 투어가 페이지를 이동시켜도(같은 selector가 새 페이지의 TopNav에도 있음)
// 자연스럽게 다시 그 탭 쪽으로 걸어감 — 페이지 전환 중 잠깐 못 찾아도 마지막으로 알던
// 위치를 유지하다가 새 페이지가 뜨면 바로 이어서 따라감.
function tourTargetFor(selector) {
  const el = selector ? document.querySelector(selector) : null;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const seatX = rect.left + rect.width * 0.5;
  const seatY = rect.bottom + 4;
  const world = screenToWorld(seatX, seatY, WALK_Z);
  return { x: world.x, y: world.y + 0.9 };
}

window.knowerbotPointAt = function (selector) {
  // 신규 계정은 로그인 3초 뒤 "첫 채팅 인사"도 예약돼 있어서(kg_seen_intro_chat),
  // 투어랑 동시에 처음 로그인하면 그 타이머가 나중에 끼어들어 투어 중 모드를 가로챌 수
  // 있음 — 투어가 시작되면 그 인사 타이머는 취소함(투어 자체가 인사를 대신함).
  clearTimeout(autoChatTimer);
  botState.tourSelector = selector;
  setChatOpen(false);
  setSeatAffordance(false);
  botState.targetScale = 1;
  botState.targetZ = WALK_Z;
  const target = tourTargetFor(selector);
  if (target) {
    botState.targetX = target.x;
    botState.targetY = target.y;
  }
  botState.mode = 'approachTourPoint';
  setAction('walking');
};

window.knowerbotStopPointing = function () {
  if (botState.mode !== 'approachTourPoint' && botState.mode !== 'tourPoint') return;
  botState.tourSelector = null;
  pickWaypoint();
  botState.mode = 'wander';
  setAction('walking', 0.15);
};

async function startLoggedInDemo() {
  if (isLoggedIn) return;
  isLoggedIn = true;
  try {
    window.localStorage.setItem('kg_logged_in', '1');
  } catch (e) {}
  if (chatInputEl) chatInputEl.disabled = false;
  document.body.classList.add('logged-in');

  // 로그인 직후 이 계정이 아직 온보딩(투자성향 진단)을 안 했으면 그 페이지로 바로 보냄 —
  // 실패(네트워크 오류 등)하면 그냥 평소 흐름으로 진행(로그인 자체를 막지 않음).
  try {
    const res = await authFetch(`${API_BASE}/api/onboarding/profile`, {});
    if (res.status === 204) {
      window.location.replace('/onboarding');
      return;
    }
  } catch (e) {}

  // 온보딩까지 다 끝난 계정이면 로그인하자마자 바로 대시보드로 — 랜딩 페이지 등
  // 다른 곳에 머무르지 않음(이미 대시보드에 있었으면 그냥 이 페이지에서 계속 진행).
  if (window.location.pathname !== '/dashboard') {
    window.location.replace('/dashboard');
    return;
  }

  setChatOpen(false);
  showBubble('반가워요. 먼저 흐름을 살펴볼게요.', 3000);
  if (botState.mode === 'loading' || !actions.swimming) {
    pendingStartAfterLogin = true;
    return;
  }
  startPostLoginSwim();
}

function startPostLoginSwim() {
  pendingStartAfterLogin = false;
  clearTimeout(autoChatTimer);
  // ProductTour(React)가 모델 로딩이 끝나기 전에 이미 knowerbotPointAt으로 어디론가
  // 걸어가고 있는 중이면(신규 계정은 첫 로그인 인사랑 투어가 동시에 걸릴 수 있음)
  // 여기서 mode를 'wander'로 되돌리거나 인사 타이머를 다시 걸지 않음 — 투어가 곧
  // "첫 인사" 역할까지 대신하는 셈이라 서로 안 겹치게 함.
  if (botState.tourSelector) return;
  setSeatAffordance(false);
  shadowDecal.visible = true;
  botState.targetScale = 1;
  botState.targetZ = WALK_Z;
  rig.position.x = -2.2;
  rig.position.y = botState.baseY;
  rig.position.z = WALK_Z;
  rig.scale.setScalar(1);
  pickWaypoint();
  botState.mode = 'wander';
  setAction('walking', 0.15);
  // The "walk up and open chat" intro only plays the first time this browser
  // ever logs in — a mock stand-in for "first signup", since there's no real
  // backend/account here to know that for sure.
  let seenIntro = false;
  try {
    seenIntro = window.localStorage.getItem('kg_seen_intro_chat') === '1';
  } catch (e) {}
  if (!seenIntro) {
    autoChatTimer = window.setTimeout(() => {
      if (isLoggedIn) {
        enterChatMode();
        try {
          window.localStorage.setItem('kg_seen_intro_chat', '1');
        } catch (e) {}
      }
    }, 3000);
  }
}

function handleChatSubmit(message) {
  const text = message.trim();
  if (!text) return;
  if (pendingAskResolve) {
    addChatMessage('user', text);
    const resolve = pendingAskResolve;
    pendingAskResolve = null;
    if (chatInputEl) chatInputEl.disabled = false;
    resolve(text);
    return;
  }
  if (surveyState.askingAge) {
    addChatMessage('user', text);
    submitAgeBandAnswer(text);
    return;
  }
  if (surveyState.active) {
    submitOnboardingAnswer(text);
    return;
  }
  addChatMessage('user', text);
  if (chatInputEl) chatInputEl.disabled = true;
  // 유저 메시지는 서버가 저장하고, 최근 대화 맥락과 함께 AI에 넘겨 답변을 받아 그것도
  // 저장한 뒤 답변만 돌려줌 — chat_messages 테이블에 실제로 쌓임(mockAiReply 대체).
  authFetch(`${API_BASE}/api/chat/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
    .then((res) => res.json())
    .then((reply) => {
      addChatMessage('bot', reply.content);
      showBubble(reply.content.length > 24 ? `${reply.content.slice(0, 22)}…` : reply.content, 4200);
    })
    .catch(() => {
      addChatMessage('bot', '지금은 답하지 못했어요. 잠시 후 다시 말해주세요.');
    })
    .finally(() => {
      if (chatInputEl) chatInputEl.disabled = false;
    });
}

// 모의투자에서 매수/매도/관망 이유를 물을 때 씀 — KnowerBot이 다가와서(enterChatMode) 채팅으로
// 직접 물어보고, 사용자가 채팅으로 답하면 그 텍스트로 프라미스가 풀림. simulation-client.tsx의
// React 쪽이 이 함수를 호출해서 await로 답을 받아감(별도 vanilla-JS 번들이라 window에 노출).
let pendingAskQuestion = null;
let pendingAskResolve = null;
window.knowerbotAskReason = function (question) {
  return new Promise((resolve) => {
    pendingAskQuestion = question;
    pendingAskResolve = resolve;
    enterChatMode();
  });
};

// 자유 텍스트 답변을 서버에 보냄 — 서버가 그 문항이랑 무관해 보이는 답인지 즉석에서
// 체크해서(가벼운 AI 호출) accepted=false면 저장을 안 하고 feedback만 옴. 그럴 땐
// index를 그대로 두고 같은 문항을 다시 물어봄. accepted=true여야 "~로 이해했어요" 같은
// 확인 멘트 없이 바로 다음 질문으로 넘어가서 실제 대화처럼 자연스럽게 흘러감.
// 채점+설명은 6문항이 다 모이면 finishOnboardingSurvey가 대화 전체를 한 번에 분석함.
function submitOnboardingAnswer(text) {
  addChatMessage('user', text);
  const question = surveyState.questions[surveyState.index];
  if (chatInputEl) chatInputEl.disabled = true;
  authFetch(`${API_BASE}/api/onboarding/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId: question.id, rawText: text }),
  })
    .then((res) => res.json())
    .then((result) => {
      if (chatInputEl) chatInputEl.disabled = false;
      if (!result.accepted) {
        window.setTimeout(() => {
          addChatMessage('bot', result.feedback || '음... 질문이랑 조금 다른 답변 같아요. 다시 한 번 말씀해주실래요?');
          if (chatInputEl) chatInputEl.focus();
        }, 480);
        return;
      }
      surveyState.index += 1;
      window.setTimeout(askNextOnboardingQuestion, 550);
    })
    .catch(() => {
      addChatMessage('bot', '답변을 저장하지 못했어요. 다시 한 번 말해주실래요?');
      if (chatInputEl) chatInputEl.disabled = false;
    });
}

// 챗 패널을 열 때마다 한 번씩 확인: 아직 투자성향 진단이 없으면 그 자리에서
// 온보딩 설문을 채팅으로 진행하고, 이미 있으면 평범한 인사만 함.
// ?retake=1로 들어왔으면 프로필 존재 여부와 무관하게 무조건 처음부터 다시 물어봄.
function maybeStartOnboardingSurvey() {
  if (retakeRequested) {
    retakeRequested = false;
    onboardingChecked = true;
    startOnboardingSurvey(true);
    return;
  }
  if (onboardingChecked) {
    if (!surveyState.active) greetInChat();
    return;
  }
  onboardingChecked = true;
  authFetch(`${API_BASE}/api/onboarding/profile`, {})
    .then((res) => (res.status === 204 ? null : res.json()))
    .then((profile) => {
      if (profile) {
        greetInChat();
        return;
      }
      // 프로필이 없으면 지금 있던 페이지(예: /simulation, /library)에서 그 자리에 바로
      // 설문을 시작하지 않고, 사전조사 전용 페이지로 보냄 — 다른 페이지 내용 위에 채팅으로
      // 설문이 겹쳐 보이는 게 어색해서. /onboarding에선 그 페이지의 자동 접근 로직이
      // 다시 이 함수를 불러서(pathname이 이미 맞으니) 곧바로 설문을 시작함.
      if (window.location.pathname !== '/onboarding') {
        window.location.replace('/onboarding');
        return;
      }
      startOnboardingSurvey();
    })
    .catch(() => greetInChat());
}

// 부를 때마다(챗 다시 열 때마다) 이 인사말이 대화창에 매번 새로 쌓이면 실제 대화 내용이
// 안 보이고 이 문구만 반복돼서 지저분해짐 — 채팅 로그에는 페이지당 한 번만 남기고,
// 말풍선은 부를 때마다 가볍게 보여줌(로그에는 안 쌓이니 반복돼도 괜찮음).
let greetedThisPageLoad = false;
function greetInChat() {
  showBubble('무엇을 같이 볼까요?', 4200);
  if (!greetedThisPageLoad) {
    greetedThisPageLoad = true;
    addChatMessage('bot', '무엇을 같이 볼까요?');
  }
  if (chatInputEl) chatInputEl.focus();
}

// 진행 중이던 답(POST /answer 때마다 서버에 즉시 저장됨)이 있으면 그 뒤부터 이어감 —
// 문항 순서는 고정이라 "아직 답 안 한 첫 문항"을 서버가 준 progress로 계산하면 됨.
// retake=true면 기존 답 여부를 무시하고 0번 문항부터 전부 다시 물어봄 — 답은 문항별
// upsert라 새로 답하면 예전 답을 그대로 덮어쓰고, 서버에 별도 초기화 요청은 필요 없음.
function startOnboardingSurvey(retake) {
  if (chatInputEl) chatInputEl.disabled = true;
  const progressPromise = retake
    ? Promise.resolve([])
    : authFetch(`${API_BASE}/api/onboarding/progress`, {}).then((res) => res.json());
  progressPromise
    .then((progress) => {
      const answeredIds = new Set(progress.map((p) => p.questionId));
      addChatMessage(
        'bot',
        retake
          ? '사전 조사를 다시 해볼게요. 편하게 말하듯 답해주세요.'
          : progress.length > 0
          ? `저번에 이어서 할게요. ${progress.length}개는 이미 답했어요.`
          : '몇 가지만 물어볼게요. 투자 성향을 파악하는 데만 써요. 편하게 말하듯 답해주세요.',
      );
      return authFetch(`${API_BASE}/api/onboarding/questions`, {})
        .then((res) => res.json())
        .then((questions) => {
          surveyState.active = true;
          surveyState.questions = questions;
          const firstUnanswered = questions.findIndex((q) => !answeredIds.has(q.id));
          surveyState.index = firstUnanswered === -1 ? questions.length : firstUnanswered;
          window.setTimeout(askNextOnboardingQuestion, 380);
        });
    })
    .catch(() => {
      addChatMessage('bot', '지금은 설문을 불러올 수 없어요. 나중에 다시 시도해주세요.');
      if (chatInputEl) chatInputEl.disabled = false;
    });
}

function askNextOnboardingQuestion() {
  const question = surveyState.questions[surveyState.index];
  if (!question) {
    if (!surveyState.ageAsked) {
      askAgeBandQuestion();
      return;
    }
    finishOnboardingSurvey();
    return;
  }
  addChatMessage('bot', question.text);
  if (chatInputEl) {
    chatInputEl.disabled = false;
    chatInputEl.focus();
  }
}

// 설문 맨 끝의 나이대 질문 — 이미 저장돼 있으면(재진단 등) 건너뛰고 바로 결과 분석으로.
// 자유 텍스트에서 나이대만 뽑고, 못 알아들으면 다시 묻되 "건너뛰기"라고 하면 넘어감
// (마이페이지에서 나중에 입력할 수 있음).
function askAgeBandQuestion() {
  surveyState.ageAsked = true;
  authFetch(`${API_BASE}/api/users/me/age-band`, {})
    .then((res) => (res.status === 204 ? { ageBand: null } : res.json()))
    .then((data) => {
      if (data && data.ageBand) {
        finishOnboardingSurvey();
        return;
      }
      surveyState.askingAge = true;
      addChatMessage('bot', '마지막으로 하나만 더요 — 나이대가 어떻게 되세요? (예: 20대) 또래와 투자성향을 비교해드리는 데만 써요. 알려주기 싫으면 "건너뛰기"라고 해주세요.');
      if (chatInputEl) {
        chatInputEl.disabled = false;
        chatInputEl.focus();
      }
    })
    .catch(() => finishOnboardingSurvey());
}

function parseAgeBand(text) {
  if (/10|십대|틴/.test(text)) return 'TEENS';
  if (/2[0-9]|20|스물|이십/.test(text)) return 'TWENTIES';
  if (/3[0-9]|30|서른|삼십/.test(text)) return 'THIRTIES';
  if (/4[0-9]|40|마흔|사십/.test(text)) return 'FORTIES';
  if (/5[0-9]|6[0-9]|7[0-9]|50|쉰|오십|육십|예순/.test(text)) return 'FIFTIES_PLUS';
  return null;
}

function submitAgeBandAnswer(text) {
  if (/건너|스킵|싫/.test(text)) {
    surveyState.askingAge = false;
    addChatMessage('bot', '알겠어요 — 나중에 마이페이지에서 언제든 알려줄 수 있어요.');
    window.setTimeout(finishOnboardingSurvey, 500);
    return;
  }
  const ageBand = parseAgeBand(text);
  if (!ageBand) {
    addChatMessage('bot', '나이대를 잘 못 알아들었어요. "20대"처럼 말해주시거나 "건너뛰기"라고 해주세요.');
    return;
  }
  if (chatInputEl) chatInputEl.disabled = true;
  authFetch(`${API_BASE}/api/users/me/age-band`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ageBand }),
  })
    .catch(() => {}) // 실패해도 설문 자체는 계속 — 마이페이지에서 다시 입력 가능
    .finally(() => {
      surveyState.askingAge = false;
      window.setTimeout(finishOnboardingSurvey, 400);
    });
}

// 대화(원문 6개)는 이미 서버에 다 저장돼있어서 body 없이 호출 — 서버가 그 전체를
// AI에 한 번에 넘겨서 채점+설명을 같이 받아옴. 그래서 다른 호출보다 오래 걸릴 수 있음.
function finishOnboardingSurvey() {
  addChatMessage('bot', '분석 중이에요... (조금 걸릴 수 있어요)');
  authFetch(`${API_BASE}/api/onboarding/submit`, {
    method: 'POST',
  })
    .then((res) => res.json())
    .then((result) => {
      // 답변 중 질문이랑 무관해 보이는 게 있으면 profile 대신 questionsToRetry가 옴 — 그
      // 문항들은 서버에서 이미 지워졌으니 startOnboardingSurvey를 다시 불러서(기존
      // 이어하기 로직 그대로) 자연스럽게 그 문항부터 다시 물어보게 함.
      if (result.questionsToRetry && result.questionsToRetry.length > 0) {
        surveyState.active = false;
        addChatMessage('bot', '몇 가지 답변이 질문이랑 안 맞는 것 같아요. 그 부분만 다시 여쭤볼게요.');
        window.setTimeout(startOnboardingSurvey, 600);
        return;
      }
      surveyState.active = false;
      addChatMessage('bot', result.profile.explanationText);
      showBubble('결과를 정리했어요.', 3600);
      window.setTimeout(showSurveyResults, 1400);
    })
    .catch(() => {
      surveyState.active = false;
      addChatMessage('bot', '결과 저장에 실패했어요. 잠시 후 다시 시도해주세요.');
      if (chatInputEl) chatInputEl.disabled = false;
    });
}

function showSurveyResults() {
  setChatOpen(false);
  showBubble('결과를 정리했어요.', 3600);
  setSeatAffordance(false);
  shadowDecal.visible = true;
  botState.mode = 'resultFlair';
  botState.targetX = 0;
  botState.targetY = botState.baseY + 0.95;
  botState.targetScale = 1.85;
  botState.targetZ = 1.25;
  botState.swimTargetX = 0;
  rig.position.x = 0;
  rig.position.y = botState.targetY;
  rig.position.z = WALK_Z;
  rig.scale.setScalar(1);
  setAction('flair', 0.2);
  // let the celebration pose play for a beat, then hand off to the real
  // 사전조사 결과 route (the old build toggled a hidden section on this same
  // page instead — that page no longer exists now that each screen is its
  // own route). replace(그냥 href 아님) — 완료 직전의 "질문 중" 채팅 화면을 히스토리에
  // 안 남겨서, 결과 화면에서 뒤로가기를 눌러도 끝난 설문 상태로 안 돌아가게 함.
  window.setTimeout(() => {
    window.location.replace('/onboarding/result');
  }, 1400);
}

function showSimulationPage() {
  document.body.classList.add('show-sim');
  document.body.classList.remove('show-results');
  setChatOpen(false);
  setSeatAffordance(false);
  if (bubbleEl) bubbleEl.classList.remove('active');
  shadowDecal.visible = true;
  const target = simTrainerTarget();
  botState.mode = 'simTrainerSeat';
  if (target) {
    botState.targetX = target.x;
    botState.targetY = target.y;
    botState.targetZ = target.z;
    botState.targetScale = target.scale;
    rig.position.x = target.x;
    rig.position.y = target.y;
    rig.position.z = target.z;
    rig.scale.setScalar(target.scale);
  }
  rig.rotation.y = MODEL_FACE_SEATED;
  botState.velocityX = 0;
  setAction('sitting', 0.2);
}

function simTrainerTarget() {
  const el = document.querySelector('[data-sim-trainer-seat]');
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const seatX = rect.left + rect.width * 0.5;
  const seatY = rect.top + rect.height * 0.33;
  const z = 1.45;
  const world = screenToWorld(seatX, seatY, z);
  return {
    x: world.x,
    y: world.y + 0.62,
    z,
    scale: 1.18,
  };
}

// 여러 위젯 중 하나를 골라 방문하는 느낌을 주려고, 방문 시작 시점에 한 번만
// 랜덤으로 고르고(pickSeatElement) 그 방문이 끝날 때까지는 botState.seatEl에
// 고정해서 씀 — 매 프레임 다시 뽑으면 접근 도중 목표가 흔들림.
function pickSeatElement(sequence) {
  // 1번(앉기)은 카드류([data-knower-seat]), 2번(스윙)은 버튼류([data-knower-swing-seat]) —
  // 버튼처럼 가느다란 걸 붙잡고 매달리는 게 카드 위에 앉는 것보다 자연스러워서 분리함.
  // 예전엔 상단 nav바(TopNav)에 두 속성이 다 붙어있어서 페이지가 바뀌어도 항상 nav로만
  // 갔었음 — 지금은 nav에서 빼고 각 페이지(대시보드/마이/스파링/PT/자료실)의 실제 콘텐츠
  // 카드·버튼에 붙여서, 어느 페이지에 있느냐에 따라 그 페이지 안에서만 골라짐.
  const selector = sequence === 2 ? '[data-knower-swing-seat]' : '[data-knower-seat]';
  const els = document.querySelectorAll(selector);
  if (!els.length) return null;
  return els[Math.floor(Math.random() * els.length)];
}

function seatTargetFor(el, sequence) {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  // 2번(스윙)은 캐릭터 몸통 중심이 버튼 정중앙에 겹쳐 보이면 안 되니까,
  // 손으로 잡는 지점(버튼 오른쪽 끝)을 기준으로 살짝 오른쪽 아래로 매달리게 함.
  const seatX = sequence === 2 ? rect.right + 10 : rect.left + rect.width * 0.5;
  const seatY = rect.top + 3;
  const world = screenToWorld(seatX, seatY, WALK_Z);
  const yLift = sequence === 2 ? 0.5 : 1.0;
  return { x: world.x, y: world.y + yLift, screenX: seatX, screenY: seatY, el };
}

function seatTarget() {
  return seatTargetFor(botState.seatEl, botState.seatSequence);
}

function setSeatAffordance(active) {
  const el = botState.seatEl;
  if (el) el.classList.toggle('knower-seat-active', active);
  if (seatShadowEl) seatShadowEl.classList.toggle('active', active);
}

function updateSeatShadow(target) {
  if (!seatShadowEl || !target) return;
  seatShadowEl.style.left = `${target.screenX}px`;
  seatShadowEl.style.top = `${target.screenY + 10}px`;
}

function faceDirection(dir) {
  if (!dir) return;
  const targetFacing = dir > 0 ? MODEL_FACE_RIGHT : -MODEL_FACE_RIGHT;
  let da = targetFacing - rig.rotation.y;
  da = Math.atan2(Math.sin(da), Math.cos(da));
  rig.rotation.y += da * 0.16;
}

function shortestAngleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

// 위젯 방문은 두 가지 시퀀스 중 하나를 랜덤으로 골라서 실행함:
//   1번 — 걸어가서 위젯에 앉는다 (approachSeat → sitting → jumpDown)
//   2번 — 점프해서 위젯을 붙잡고 매달려 있다가 떨어진다 (approachSeat → jumpGrab → hangSwing → fallOff)
function startSeatSequence() {
  // nextSeatAt을 여기서 항상 먼저 미뤄둠 — 안 그러면(타겟을 못 찾아 아래에서 return하든,
  // 시퀀스가 시작되든) 다음 프레임에 바로 또 시도해서 매 프레임 재시도(사실상 쿨다운 없음)
  // 되거나, 위젯 방문이 끝나자마자 wander로 돌아온 즉시 또 새 방문이 시작돼 버림 —
  // 원래 의도는 "가끔 위젯을 들르며 대부분은 그냥 돌아다니는" 느낌이었음.
  botState.nextSeatAt = performance.now() / 1000 + 10 + Math.random() * 12;
  const sequence = Math.random() < 0.5 ? 1 : 2;
  botState.seatSequence = sequence;
  botState.seatEl = pickSeatElement(sequence);
  const target = seatTarget();
  if (!target) return;
  setChatOpen(false);
  botState.targetScale = 1;
  botState.targetZ = WALK_Z;
  // 그림자/카드 강조 표시는 여기서 미리 안 켬 — 로봇이 아직 다가가는 중(approachSeat)일
  // 때부터 뜨면 "미리 알려주는" 느낌이라 부자연스러움. 실제로 도착했을 때(sitOnWidget/
  // startHangSwing)만 켬.
  showBubble(
    botState.seatSequence === 1
      ? '저 위젯에서 위험 신호를 한번 볼게요.'
      : '잠깐 매달려볼게요!'
  );
  botState.mode = 'approachSeat';
  botState.targetX = target.x;
  botState.targetY = target.y;
  botState.seatStartedAt = performance.now() / 1000;
  setAction('walking');
}

function sitOnWidget() {
  botState.mode = 'sitting';
  botState.sitStartedAt = performance.now() / 1000;
  rig.position.x = botState.targetX;
  rig.position.y = botState.targetY;
  shadowDecal.visible = false;
  setSeatAffordance(true);
  updateSeatShadow(seatTarget());
  showBubble('이 구간은 AI 코치가 개입하기 좋은 타이밍이에요.', 4200);
  setAction('sitting', 0.22);
}

function startJumpDownToSwim() {
  setSeatAffordance(false);
  shadowDecal.visible = true;
  botState.mode = 'jumpDown';
  botState.jumpStartedAt = performance.now() / 1000;
  botState.jumpDuration = 0.9;
  botState.startX = rig.position.x;
  botState.startY = rig.position.y;
  botState.targetX = THREE.MathUtils.clamp(rig.position.x + 0.45, -2.8, 2.8);
  botState.targetY = botState.baseY;
  botState.jumpStartRotation = rig.rotation.y;
  botState.swimTargetX = botState.targetX > 0 ? -2.6 : 2.6;
  showBubble('다시 내려가서 흐름을 이어볼게요.');
  setAction('jumpDown', 0.12);
}

// --- 2번 시퀀스: 점프해서 위젯을 붙잡고, 매달려 있다가, 떨어진다 ---
function startJumpGrab() {
  const target = seatTarget();
  if (target) {
    botState.targetX = target.x;
    botState.targetY = target.y;
    updateSeatShadow(target);
  }
  botState.mode = 'jumpGrab';
  botState.jumpStartedAt = performance.now() / 1000;
  botState.jumpDuration = 0.85;
  botState.startX = rig.position.x;
  botState.startY = rig.position.y;
  botState.jumpStartRotation = rig.rotation.y;
  // 스윙을 시작한 방향(다가오던 방향)을 기억해뒀다가, 나중에 날아갈 때 그
  // 방향 그대로 이어감 — 관성이 이어지는 느낌.
  botState.swingDir = Math.sign(botState.targetX - botState.startX) || (Math.random() < 0.5 ? -1 : 1);
  showBubble('잡았다!');
  setAction('jump', 0.12);
}

function startHangSwing() {
  botState.mode = 'hangSwing';
  botState.hangStartedAt = performance.now() / 1000;
  rig.position.x = botState.targetX;
  rig.position.y = botState.targetY;
  setSeatAffordance(true);
  updateSeatShadow(seatTarget());
  setAction(actions.swingStart ? 'swingStart' : 'sitting', 0.12);
}

function startFlyOff() {
  setSeatAffordance(false);
  botState.mode = 'flyOff';
  botState.flyStartedAt = performance.now() / 1000;
  botState.startX = rig.position.x;
  botState.startY = rig.position.y;
  botState.targetX = THREE.MathUtils.clamp(rig.position.x + botState.swingDir * 2.2, -2.8, 2.8);
  botState.targetY = botState.targetY + 0.5;
  showBubble('잠깐 날아볼게요!');
  setAction(actions.flying ? 'flying' : 'jump', 0.15);
}

function startFallOff() {
  setSeatAffordance(false);
  shadowDecal.visible = true;
  botState.mode = 'fallOff';
  botState.jumpStartedAt = performance.now() / 1000;
  botState.jumpDuration = 0.7;
  botState.startX = rig.position.x;
  botState.startY = rig.position.y;
  botState.targetX = THREE.MathUtils.clamp(rig.position.x + 0.4, -2.8, 2.8);
  botState.targetY = botState.baseY;
  showBubble('으악!');
  setAction(actions.fallFlat ? 'fallFlat' : 'jumpDown', 0.1);
}

function startSwimming() {
  setChatOpen(false);
  botState.targetScale = 1;
  botState.targetZ = WALK_Z;
  rig.position.x = botState.targetX;
  rig.position.y = botState.baseY;
  rig.position.z = WALK_Z;
  rig.scale.setScalar(1);
  pickWaypoint();
  botState.mode = 'wander';
  showBubble('리스크는 먼저 연습해보는 게 좋아요.', 4200);
  setAction('walking', 0.2);
}

new GLTFLoader().load(
  MODEL_URL,
  (gltf) => {
   try {
    const model = gltf.scene;

    model.updateMatrixWorld(true);
    const initialBox = new THREE.Box3().setFromObject(model);
    const initialSize = new THREE.Vector3();
    initialBox.getSize(initialSize);
    const targetHeight = 1.08;
    const scale = targetHeight / Math.max(initialSize.y, 1);
    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);

    const worldBox = new THREE.Box3().setFromObject(model);
    const worldCenter = new THREE.Vector3();
    worldBox.getCenter(worldCenter);
    model.position.x -= worldCenter.x;
    model.position.z -= worldCenter.z;
    model.position.y += -1.36 - worldBox.min.y;
    MODEL_FEET_Y = -1.36;
    MODEL_HEAD_Y = MODEL_FEET_Y + targetHeight;

    model.rotation.y = 0;

    model.traverse((n) => {
      if (n.isMesh) {
        n.castShadow = true;
        if (n.material) {
          n.material = new THREE.MeshStandardMaterial({
            map: botMaps.map,
            normalMap: botMaps.normalMap,
            metalnessMap: botMaps.metalnessMap,
            roughnessMap: botMaps.roughnessMap,
            emissiveMap: botMaps.emissiveMap,
            emissive: 0xffffff,
            emissiveIntensity: 0.55,
            metalness: 0.85,
            roughness: 0.55,
            envMapIntensity: 0.9,
          });
        }
      }
    });

    rig.add(model);

    mixer = new THREE.AnimationMixer(model);
    if (gltf.animations && gltf.animations[0]) {
      const swimClip = sanitizeClip(gltf.animations[0]);
      swimClip.name = 'swimming';
      const swimAction = mixer.clipAction(swimClip);
      swimAction.timeScale = 0.78;
      swimAction.enabled = true;
      actions.swimming = swimAction;
    }
    const animationLoads = Object.entries(ANIMATION_URLS).map(([name, url]) => (
      loadGltf(url).then((animGltf) => {
        const clip = animGltf.animations && animGltf.animations[0];
        if (clip) {
          const cleanClip = sanitizeClip(clip);
          cleanClip.name = name;
          const action = mixer.clipAction(cleanClip);
          if (name === 'walking') action.timeScale = 0.82;
          if (name === 'flair') action.timeScale = 0.88;
          if (name === 'flying') action.timeScale = 0.95;
          if (name === 'swingStart') action.timeScale = 0.9;
          if (name === 'jumpDown') {
            action.timeScale = 1.05;
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
          }
          if (name === 'swingLand' || name === 'fallFlat') {
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
          }
          action.enabled = true;
          if (name === 'sitting') action.clampWhenFinished = true;
          actions[name] = action;
        }
      }).catch((e) => {
        console.warn('Animation failed:', name, e);
      })
    ));

    Promise.all(animationLoads).then(() => {
      setAction('idle', 0);
      if (pendingLoginPrompt || botState.mode === 'approachChat' || botState.mode === 'chatIdle') {
        // 모델 로딩 중에 이미 다가오라고 지시돼 있으면(로그인 전 knowerbotRequireLogin,
        // 또는 /onboarding의 자동 설문 트리거) 그 상태를 덮어쓰지 않음 — 로그인 여부와
        // 무관하게 여기서 startPostLoginSwim으로 갈아타면 다가오다 말고 배회로 돌아가서
        // 온보딩 채팅이 영영 안 열리는 문제가 있었음.
      } else if (isLoggedIn || pendingStartAfterLogin) {
        startPostLoginSwim();
      } else {
        // 로그인 안 한 방문자도(랜딩 페이지 등) 로봇이 그냥 가만히 서있지 않고 돌아다니게
        // 함 — 랜딩 페이지 기능 카드들도 data-knower-seat가 붙어있어서 원래 로그인 여부와
        // 무관하게 방문하는 연출이 의도였는데, animate 루프의 !isLoggedIn 강제 idle 때문에
        // 실제로는 로그인 전엔 항상 멈춰있던 버그였음.
        rig.position.x = -2.2;
        rig.position.y = botState.baseY;
        rig.position.z = WALK_Z;
        rig.scale.setScalar(1);
        pickWaypoint();
        botState.mode = 'wander';
        setAction('walking', 0.15);
      }
    });
   } catch (e) {
     window.__debug.lastErr = String(e && e.stack || e);
     console.error(e);
   }
  },
  undefined,
  (err) => {
    window.__debug.lastErr = String(err && err.stack || err);
    console.error(err);
  }
);

// ---------- animation loop ----------
function animate() {
  requestAnimationFrame(animate);
  try {
  window.__debug.frameCount++;
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (mixer) mixer.update(dt);

  if (rig.children.length) {
    const now = performance.now() / 1000;
    if (botState.mode === 'ready') {
      setAction('idle');
      rig.position.y = botState.baseY;
    } else if (botState.mode === 'wander') {
      if (!nextIdleBubbleAt) nextIdleBubbleAt = now + 1.2;
      const dx = wander.targetX - rig.position.x;
      const dist = Math.abs(dx);
      if (dist < 0.15 && now > wander.pauseUntil) {
        pickWaypoint();
        wander.pauseUntil = now + 0.8 + Math.random() * 1.6;
        setAction('idle');
      } else if (dist >= 0.15) {
        moveTowardX(wander.targetX, wander.speed, 1.8, dt);
        setAction('walking');
      }
      rig.position.y = botState.baseY + Math.sin(t * 2.2) * 0.03;
      if (now > nextIdleBubbleAt) {
        const lines = [
          '오늘은 손실을 안전하게 연습해봐요.',
          '레버리지 비중은 천천히 올리는 게 좋아요.',
          '매매 전에 리스크부터 체크할게요.',
        ];
        showBubble(lines[Math.floor(Math.random() * lines.length)]);
        nextIdleBubbleAt = now + 7 + Math.random() * 5;
      }
      if (now > botState.nextSeatAt) startSeatSequence();
    } else if (botState.mode === 'approachChat') {
      const target = chatTarget();
      botState.targetX = target.x;
      botState.targetY = target.y;
      botState.targetZ = target.z;
      botState.targetScale = target.scale;
      rig.position.x += (botState.targetX - rig.position.x) * Math.min(1, dt * 2.8);
      rig.position.y += (botState.targetY - rig.position.y) * Math.min(1, dt * 3.2);
      rig.position.z += (botState.targetZ - rig.position.z) * Math.min(1, dt * 2.4);
      rig.scale.setScalar(THREE.MathUtils.lerp(rig.scale.x, botState.targetScale, Math.min(1, dt * 2.6)));
      rig.rotation.y += shortestAngleDelta(rig.rotation.y, MODEL_FACE_SEATED) * Math.min(1, dt * 3.5);
      setAction('walking');
      const closeEnough = Math.abs(botState.targetX - rig.position.x) < 0.08 && Math.abs(botState.targetZ - rig.position.z) < 0.08;
      if (!chatPanelEl.classList.contains('open') && closeEnough) {
        setChatOpen(true);
      }
      if (!closeEnough) {
        // Keep approaching.
      } else {
        botState.velocityX = 0;
        botState.mode = 'chatIdle';
        setAction('idle');
        if (pendingAskQuestion) {
          const q = pendingAskQuestion;
          pendingAskQuestion = null;
          addChatMessage('bot', q);
          showBubble('답해주세요', 2400);
          if (chatInputEl) {
            chatInputEl.disabled = false;
            chatInputEl.focus();
          }
        } else if (pendingLoginPrompt) {
          pendingLoginPrompt = false;
          addChatMessage('bot', '이 페이지는 로그인해야 이용할 수 있어요. 오른쪽 위 로그인 버튼을 눌러주세요.');
          showBubble('로그인이 필요해요', 3000);
          if (chatInputEl) chatInputEl.disabled = true; // 로그인 전엔 채팅도 못 쓰니 입력 막아둠
        } else {
          maybeStartOnboardingSurvey();
        }
      }
    } else if (botState.mode === 'chatIdle') {
      const target = chatTarget();
      botState.targetX = target.x;
      botState.targetY = target.y;
      botState.targetZ = target.z;
      botState.targetScale = target.scale;
      rig.position.x += (botState.targetX - rig.position.x) * Math.min(1, dt * 3.5);
      rig.position.y += (botState.targetY + Math.sin(t * 2.0) * 0.02 - rig.position.y) * Math.min(1, dt * 3.5);
      rig.position.z += (botState.targetZ - rig.position.z) * Math.min(1, dt * 3.5);
      rig.scale.setScalar(THREE.MathUtils.lerp(rig.scale.x, botState.targetScale, Math.min(1, dt * 3.5)));
      rig.rotation.y += shortestAngleDelta(rig.rotation.y, MODEL_FACE_SEATED) * Math.min(1, dt * 3.5);
      setAction('idle');
    } else if (botState.mode === 'approachTourPoint') {
      const target = tourTargetFor(botState.tourSelector);
      if (target) {
        botState.targetX = target.x;
        botState.targetY = target.y;
      }
      const dx = botState.targetX - rig.position.x;
      if (Math.abs(dx) > 0.16) {
        moveTowardX(botState.targetX, 0.55, 2.2, dt);
        setAction('walking');
      } else {
        botState.velocityX = 0;
        botState.mode = 'tourPoint';
        setAction('idle');
      }
      rig.position.y = botState.baseY;
    } else if (botState.mode === 'tourPoint') {
      // 페이지가 이동하면(투어가 다음 스텝으로 넘어가면) 같은 셀렉터가 새 페이지에도
      // 있어서 타겟 좌표가 갱신됨 — approachTourPoint로 안 돌아가고 여기서 그냥
      // 부드럽게 따라가게 해서 매 스텝 재접근 모션 없이 자연스럽게 이어짐.
      const target = tourTargetFor(botState.tourSelector);
      if (target) {
        botState.targetX = target.x;
        botState.targetY = target.y;
      }
      rig.position.x += (botState.targetX - rig.position.x) * Math.min(1, dt * 3);
      rig.position.y = botState.baseY + Math.sin(t * 2.0) * 0.02;
      rig.rotation.y += shortestAngleDelta(rig.rotation.y, MODEL_FACE_SEATED) * Math.min(1, dt * 3);
      setAction('idle');
    } else if (botState.mode === 'approachSeat') {
      const target = seatTarget();
      if (target) {
        botState.targetX = target.x;
        botState.targetY = target.y;
        updateSeatShadow(target);
      }
      const dx = botState.targetX - rig.position.x;
      if (Math.abs(dx) > 0.16) {
        moveTowardX(botState.targetX, 0.55, 2.2, dt);
        setAction('walking');
      } else {
        botState.velocityX = 0;
        startJumpGrab();
      }
      rig.position.y = botState.baseY;
    } else if (botState.mode === 'jumpGrab') {
      // 1번·2번 시퀀스 둘 다 여기서 위젯 위로 점프해 올라감 — 랜딩 자세만 다름
      // (1번은 정면 착석용, 2번은 옆으로 매달리는 자세용).
      const p = Math.min(1, (now - botState.jumpStartedAt) / botState.jumpDuration);
      const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      rig.position.x = THREE.MathUtils.lerp(botState.startX, botState.targetX, eased);
      rig.position.y = THREE.MathUtils.lerp(botState.startY, botState.targetY, eased) + Math.sin(p * Math.PI) * 0.3;
      const turnP = THREE.MathUtils.smoothstep(p, 0.35, 0.92);
      const landFacing = botState.seatSequence === 2 ? MODEL_FACE_RIGHT : MODEL_FACE_SEATED;
      rig.rotation.y = botState.jumpStartRotation + shortestAngleDelta(botState.jumpStartRotation, landFacing) * turnP;
      if (p >= 1) {
        if (botState.seatSequence === 2) startHangSwing();
        else sitOnWidget();
      }
    } else if (botState.mode === 'hangSwing') {
      rig.position.x = botState.targetX;
      rig.position.y = botState.targetY + Math.sin(t * 4.2) * 0.035;
      rig.rotation.y += shortestAngleDelta(rig.rotation.y, MODEL_FACE_RIGHT) * Math.min(1, dt * 5);
      if (now - botState.hangStartedAt > 1.3) startFlyOff();
    } else if (botState.mode === 'flyOff') {
      const p = Math.min(1, (now - botState.flyStartedAt) / 2);
      const eased = 1 - Math.pow(1 - p, 2);
      rig.position.x = THREE.MathUtils.lerp(botState.startX, botState.targetX, eased);
      rig.position.y = THREE.MathUtils.lerp(botState.startY, botState.targetY, eased) + Math.sin(p * Math.PI) * 0.25;
      faceDirection(botState.targetX - botState.startX);
      if (p >= 1) startFallOff();
    } else if (botState.mode === 'fallOff') {
      const p = Math.min(1, (now - botState.jumpStartedAt) / botState.jumpDuration);
      rig.position.x = THREE.MathUtils.lerp(botState.startX, botState.targetX, p);
      rig.position.y = THREE.MathUtils.lerp(botState.startY, botState.targetY, p * p);
      if (p >= 1) {
        pickWaypoint();
        botState.mode = 'wander';
        setAction('walking', 0.2);
      }
    } else if (botState.mode === 'sitting') {
      rig.rotation.y += (MODEL_FACE_SEATED - rig.rotation.y) * Math.min(1, dt * 6);
      const target = seatTarget();
      if (target) {
        botState.targetX = target.x;
        botState.targetY = target.y;
        updateSeatShadow(target);
        rig.position.x += (botState.targetX - rig.position.x) * Math.min(1, dt * 5);
        rig.position.y += (botState.targetY - rig.position.y) * Math.min(1, dt * 5);
      }
      setAction('sitting');
      if (now - botState.sitStartedAt > 2.2) startJumpDownToSwim();
    } else if (botState.mode === 'jumpDown') {
      const p = Math.min(1, (now - botState.jumpStartedAt) / botState.jumpDuration);
      const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      rig.position.x = THREE.MathUtils.lerp(botState.startX, botState.targetX, eased);
      rig.position.y = THREE.MathUtils.lerp(botState.startY, botState.targetY, eased) + Math.sin(p * Math.PI) * 0.32;
      const turnP = THREE.MathUtils.smoothstep(p, 0.15, 0.75);
      rig.rotation.y = botState.jumpStartRotation + shortestAngleDelta(botState.jumpStartRotation, MODEL_FACE_RIGHT) * turnP;
      if (p >= 1) startSwimming();
    } else if (botState.mode === 'resultFlair') {
      rig.position.x += (botState.targetX - rig.position.x) * Math.min(1, dt * 4);
      rig.position.y += (botState.targetY + Math.sin(t * 2.3) * 0.025 - rig.position.y) * Math.min(1, dt * 4);
      rig.position.z += (botState.targetZ - rig.position.z) * Math.min(1, dt * 4);
      rig.scale.setScalar(THREE.MathUtils.lerp(rig.scale.x, botState.targetScale, Math.min(1, dt * 4)));
      rig.rotation.y += shortestAngleDelta(rig.rotation.y, MODEL_FACE_SEATED) * Math.min(1, dt * 4);
      setAction('flair');
    } else if (botState.mode === 'simTrainerSeat') {
      const target = simTrainerTarget();
      if (target) {
        botState.targetX = target.x;
        botState.targetY = target.y;
        botState.targetZ = target.z;
        botState.targetScale = target.scale;
      }
      rig.position.x += (botState.targetX - rig.position.x) * Math.min(1, dt * 5);
      rig.position.y += (botState.targetY - rig.position.y) * Math.min(1, dt * 5);
      rig.position.z += (botState.targetZ - rig.position.z) * Math.min(1, dt * 5);
      rig.scale.setScalar(THREE.MathUtils.lerp(rig.scale.x, botState.targetScale, Math.min(1, dt * 5)));
      rig.rotation.y += shortestAngleDelta(rig.rotation.y, MODEL_FACE_SEATED) * Math.min(1, dt * 6);
      setAction('sitting');
    }

    if (botState.mode !== 'approachChat' && botState.mode !== 'chatIdle' && botState.mode !== 'resultFlair' && botState.mode !== 'simTrainerSeat') {
      rig.position.z += ((botState.targetZ || WALK_Z) - rig.position.z) * Math.min(1, dt * 3);
      rig.scale.setScalar(THREE.MathUtils.lerp(rig.scale.x, botState.targetScale || 1, Math.min(1, dt * 3)));
    }

    shadowDecal.position.x = rig.position.x;
    shadowDecal.position.z = rig.position.z;
    updateBubblePosition();
    updateHitboxPosition();
    updateClosePosition();
  }

  renderer.render(scene, camera);
  } catch (e) {
    window.__debug.lastErr = String(e && e.stack || e);
    throw e;
  }
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
renderer.setSize(window.innerWidth, window.innerHeight);
})();
