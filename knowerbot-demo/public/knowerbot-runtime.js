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
const API_BASE = `${window.location.protocol}//${window.location.hostname}:8079`;
const ACCESS_TOKEN_KEY = 'kg_access_token';
const REFRESH_TOKEN_KEY = 'kg_refresh_token';

function authHeaders() {
  let token = null;
  try { token = window.localStorage.getItem(ACCESS_TOKEN_KEY); } catch (e) {}
  return token ? { Authorization: `Bearer ${token}` } : {};
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
  nextSeatAt: 0,
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
};

function pickWaypoint() {
  const margin = 0.7;
  const halfW = Math.min(visibleHalfWidthAt(WALK_Z) * margin, 3.4);
  wander.targetX = (Math.random() * 2 - 1) * halfW;
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
// 로그인 폼을 거치지 않고(이미 로그인된 채로) 페이지를 새로 열었을 때도 온보딩을
// 안 했으면 보내야 하므로, startLoggedInDemo()의 리다이렉트와 별개로 여기서도 한 번 확인함.
// /onboarding 자체에서는 확인 안 함 — 이미 그 페이지에 있는데 또 리다이렉트하면
// 진행 중인 채팅 설문이 새로고침으로 끊길 수 있음.
if (isLoggedIn && window.location.pathname !== '/onboarding') {
  fetch(`${API_BASE}/api/onboarding/profile`, { headers: authHeaders() })
    .then((res) => {
      // replace(그냥 href 아님) — 강제 리다이렉트라 "뒤로가기"로 이 페이지로 되돌아오면
      // 어차피 또 리다이렉트될 뿐이라 히스토리에 남길 이유가 없음.
      if (res.status === 204) window.location.replace('/onboarding');
    })
    .catch(() => {});
}
let pendingStartAfterLogin = false;
let autoChatTimer = 0;
let onboardingChecked = false;
// answers는 더 이상 여기서 안 들고 있음 — 매 턴 서버에 바로 저장되고(POST /answer),
// 채점은 submit 시점에 서버가 저장된 대화 전체를 보고 한 번에 함.
const surveyState = {
  active: false,
  questions: [],
  index: 0,
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

function mockAiReply(message) {
  if (/위험|리스크|손실|레버리지/.test(message)) {
    return {
      text: '좋아요. 지금은 레버리지 비중과 손절 기준을 먼저 확인하는 흐름으로 볼게요.',
      bubble: '리스크부터 체크할게요.',
      action: 'seat',
    };
  }
  if (/수영|내려|움직/.test(message)) {
    return {
      text: '움직임 모드로 전환해볼게요. 내려간 뒤 화면 위를 다시 돌아다닐 수 있어요.',
      bubble: '다시 움직여볼게요.',
      action: 'swim',
    };
  }
  return {
    text: '좋아요. 지금 화면을 기준으로 같이 확인해볼게요.',
    bubble: '제가 같이 볼게요.',
    action: 'chat',
  };
}

function enterChatMode() {
  if (!isLoggedIn) return;
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
  showBubble('불렀어요? 앞으로 갈게요.');
  setAction('walking');
}

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
    const res = await fetch(`${API_BASE}/api/onboarding/profile`, { headers: authHeaders() });
    if (res.status === 204) {
      window.location.replace('/onboarding');
      return;
    }
  } catch (e) {}

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
  if (surveyState.active) {
    submitOnboardingAnswer(text);
    return;
  }
  addChatMessage('user', text);
  const reply = mockAiReply(text);
  window.setTimeout(() => {
    addChatMessage('bot', reply.text);
    showBubble(reply.bubble, 4200);
  }, 480);
}

// 자유 텍스트 답변을 그대로 서버에 저장만 함(채점 없음) — 매 턴 "~로 이해했어요" 같은
// 확인 멘트로 안 끊기고 바로 다음 질문으로 넘어가서 실제 대화처럼 자연스럽게 흘러감.
// 채점+설명은 6문항이 다 모이면 finishOnboardingSurvey가 대화 전체를 한 번에 분석함.
function submitOnboardingAnswer(text) {
  addChatMessage('user', text);
  const question = surveyState.questions[surveyState.index];
  if (chatInputEl) chatInputEl.disabled = true;
  fetch(`${API_BASE}/api/onboarding/answer`, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    body: JSON.stringify({ questionId: question.id, rawText: text }),
  })
    .then((res) => res.json())
    .then(() => {
      surveyState.index += 1;
      if (chatInputEl) chatInputEl.disabled = false;
      window.setTimeout(askNextOnboardingQuestion, 550);
    })
    .catch(() => {
      addChatMessage('bot', '답변을 저장하지 못했어요. 다시 한 번 말해주실래요?');
      if (chatInputEl) chatInputEl.disabled = false;
    });
}

// 챗 패널을 열 때마다 한 번씩 확인: 아직 투자성향 진단이 없으면 그 자리에서
// 온보딩 설문을 채팅으로 진행하고, 이미 있으면 평범한 인사만 함.
function maybeStartOnboardingSurvey() {
  if (onboardingChecked) {
    if (!surveyState.active) greetInChat();
    return;
  }
  onboardingChecked = true;
  fetch(`${API_BASE}/api/onboarding/profile`, { headers: authHeaders() })
    .then((res) => (res.status === 204 ? null : res.json()))
    .then((profile) => {
      if (profile) {
        greetInChat();
        return;
      }
      startOnboardingSurvey();
    })
    .catch(() => greetInChat());
}

function greetInChat() {
  showBubble('무엇을 같이 볼까요?', 4200);
  addChatMessage('bot', '무엇을 같이 볼까요?');
  if (chatInputEl) chatInputEl.focus();
}

// 진행 중이던 답(POST /answer 때마다 서버에 즉시 저장됨)이 있으면 그 뒤부터 이어감 —
// 문항 순서는 고정이라 "아직 답 안 한 첫 문항"을 서버가 준 progress로 계산하면 됨.
function startOnboardingSurvey() {
  if (chatInputEl) chatInputEl.disabled = true;
  fetch(`${API_BASE}/api/onboarding/progress`, { headers: authHeaders() })
    .then((res) => res.json())
    .then((progress) => {
      const answeredIds = new Set(progress.map((p) => p.questionId));
      addChatMessage(
        'bot',
        progress.length > 0
          ? `저번에 이어서 할게요. ${progress.length}개는 이미 답했어요.`
          : '몇 가지만 물어볼게요. 투자 성향을 파악하는 데만 써요. 편하게 말하듯 답해주세요.',
      );
      return fetch(`${API_BASE}/api/onboarding/questions`, { headers: authHeaders() })
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
    finishOnboardingSurvey();
    return;
  }
  addChatMessage('bot', question.text);
  if (chatInputEl) {
    chatInputEl.disabled = false;
    chatInputEl.focus();
  }
}

// 대화(원문 6개)는 이미 서버에 다 저장돼있어서 body 없이 호출 — 서버가 그 전체를
// AI에 한 번에 넘겨서 채점+설명을 같이 받아옴. 그래서 다른 호출보다 오래 걸릴 수 있음.
function finishOnboardingSurvey() {
  addChatMessage('bot', '분석 중이에요... (조금 걸릴 수 있어요)');
  fetch(`${API_BASE}/api/onboarding/submit`, {
    method: 'POST',
    headers: authHeaders(),
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
  // 2번(스윙) 시퀀스는 카드 4개가 아니라 "홈으로" 버튼을 잡으러 감 — 버튼처럼
  // 가느다란 걸 붙잡고 매달리는 게 카드 위에 앉는 것보다 자연스러워서 분리함.
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
  const sequence = Math.random() < 0.5 ? 1 : 2;
  botState.seatSequence = sequence;
  botState.seatEl = pickSeatElement(sequence);
  const target = seatTarget();
  if (!target) return;
  setChatOpen(false);
  botState.targetScale = 1;
  botState.targetZ = WALK_Z;
  setSeatAffordance(true);
  updateSeatShadow(target);
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
      if (isLoggedIn || pendingStartAfterLogin) {
        startPostLoginSwim();
      } else {
        botState.mode = 'ready';
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
    if (!isLoggedIn || botState.mode === 'ready') {
      setAction('idle');
      rig.position.y = botState.baseY;
    } else if (botState.mode === 'wander') {
      if (!nextIdleBubbleAt) nextIdleBubbleAt = now + 1.2;
      const dx = wander.targetX - rig.position.x;
      const dist = Math.abs(dx);
      if (dist < 0.15 && now > wander.pauseUntil) {
        pickWaypoint();
        wander.pauseUntil = now + 0.8 + Math.random() * 1.6;
        setAction(Math.random() < 0.25 && actions.flair ? 'flair' : 'idle');
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
        maybeStartOnboardingSurvey();
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
      rig.position.y = THREE.MathUtils.lerp(botState.startY, botState.targetY, eased) + Math.sin(p * Math.PI) * 0.55;
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
