// histARy – przeglądarka WebAR (wersja 2).
//
// Adres: index.html?id=<id>&lang=pl|en[&debug=1]
//
// Wersjonowanie: index.html ładuje ten plik jako „./viewer.js?v=2” i ma znacznik
// <meta name="histary-viewer" content="2">. Przy każdej zmianie tego pliku podnieś numer
// w obu miejscach oraz w VIEWER_VERSION – przeglądarki pobiorą wtedy nowy plik zamiast
// kopii z pamięci podręcznej. Z parametrem &debug=1 panel pokazuje obie wersje.
//
// Dolny pasek AR budowany jest w tym pliku (nie w index.html), więc układ nie zależy od
// wersji strony: lewa grupa – obrót (↺ ↻), środek – „Makieta” / „Skala 1:1”,
// prawa grupa – skala (− +).
//
// Ścieżka renderowania wybierana jest na podstawie wykrytych możliwości urządzenia:
//   • Android + Chrome z ARCore → WebXR "immersive-ar": hit-test, DOM Overlay,
//     szacowanie oświetlenia, cień kontaktowy, jedna instancja modelu (przesuwanie,
//     obrót, skalowanie), tryby „Makieta” i „Skala 1:1”,
//   • iOS → Apple AR Quick Look (.usdz),
//   • pozostałe → interaktywny podgląd 3D (obrót i przybliżanie palcem).
// Podgląd 3D jest wyświetlany zawsze, gdy dostępny jest plik .glb.
//
// Wykrywanie WebXR: navigator.xr.isSessionSupported('immersive-ar') z limitem czasu,
// ponowne sprawdzenie po zdarzeniu „devicechange” i po powrocie na kartę. Przycisk
// „Uruchom AR” pojawia się od razu po potwierdzeniu wsparcia (aktywny po wczytaniu modelu).
// Gdy WebXR jest niedostępny na Androidzie poza Chrome (np. WebView w aplikacji),
// pod komunikatem pojawia się przycisk „Otwórz w Chrome” (intent:// → com.android.chrome).
//
// Celownik i stawianie modelu w AR (stan reticleActive):
//   • start sesji → celownik aktywny; stuknięcie stawia model i chowa celownik,
//   • model postawiony → pierwsze stuknięcie tylko „budzi” celownik,
//     drugie przenosi model w nowe miejsce i znów chowa celownik,
//   • „Makieta”: model staje dokładnie w miejscu celownika,
//   • „Skala 1:1”: budowla staje w kierunku patrzenia, najbliższa ściana ok. 5 m
//     przed użytkownikiem, fasada (+Z) zwrócona do użytkownika; powrót do „Makiety”
//     przywraca makietę w poprzednie miejsce,
//   • przytrzymanie przycisku obrotu obraca model płynnie (60°/s, niezależnie od FPS).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { XREstimatedLight } from 'three/addons/webxr/XREstimatedLight.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// ───────────────────────── Teksty ─────────────────────────

const TEXT = {
  pl: {
    loadingSite: 'Wczytywanie danych zabytku…',
    noId: 'Brak identyfikatora zabytku w adresie strony.',
    siteNotFound: 'Nie znaleziono zabytku o tym identyfikatorze.',
    siteError: 'Nie udało się pobrać danych zabytku. Sprawdź połączenie z internetem.',
    noModel: 'Ten zabytek nie ma jeszcze modelu 3D.',
    loadingModel: '⏳ Pobieranie modelu 3D: {p}%',
    loadingModelUnknown: '⏳ Pobieranie modelu 3D…',
    modelError: '❌ Nie udało się wczytać modelu 3D.',
    noWebGL: 'Twoja przeglądarka nie obsługuje grafiki 3D (WebGL).',
    previewHint: 'Obracaj model palcem, przybliżaj dwoma palcami',
    startAndroid: 'Uruchom AR',
    openIOS: '📍 Otwórz w AR (iPhone / iOS)',
    openChrome: 'Otwórz w Chrome',
    readyAndroid: 'Stuknij brązowy przycisk, aby uruchomić aparat i umieścić model w przestrzeni.',
    readyIOS: 'Stuknij niebieski przycisk, aby wyświetlić model w AR Quick Look.',
    noAr: 'To urządzenie lub przeglądarka nie obsługuje AR. Obejrzyj model w podglądzie 3D powyżej. Na Androidzie otwórz stronę w Chrome.',
    noArOtherBrowser: 'Ta przeglądarka (np. wbudowana w aplikację) nie obsługuje AR z kamerą (WebXR). Obejrzyj model w podglądzie 3D powyżej albo otwórz stronę w Chrome.',
    noArChrome: 'Chrome na tym urządzeniu nie udostępnia AR (WebXR). Obejrzyj model w podglądzie 3D powyżej i sprawdź, czy Chrome jest aktualny.',
    arStartError: 'Nie udało się uruchomić AR. Upewnij się, że zainstalowane są Usługi Google Play dla AR i że przeglądarka ma dostęp do aparatu.',
    modeTabletop: 'Makieta',
    modeReal: 'Skala 1:1',
    modeTabletopDesc: 'Pomniejszony model do postawienia na stole lub podłodze.',
    modeRealDesc: 'Budowla w rzeczywistej wielkości – najlepiej na miejscu, w otwartym terenie.',
    modeRealDescIOS: 'W AR Quick Look skala 1:1 blokuje zmianę rozmiaru modelu.',
    modeTabletopDescIOS: 'W AR Quick Look rozmiar modelu zmienisz, szczypiąc ekran dwoma palcami.',
    arScan: 'Powoli poruszaj telefonem, aby wykryć podłoże.',
    arTapPlace: 'Stuknij ekran, aby postawić obiekt',
    arTapWake: 'Stuknij ekran, aby włączyć celownik i przenieść obiekt',
    close: 'Zamknij AR',
    rotateLeft: 'Obróć w lewo',
    rotateRight: 'Obróć w prawo',
    smaller: 'Pomniejsz',
    bigger: 'Powiększ',
    rotateGroup: 'Obrót modelu',
    scaleGroup: 'Rozmiar modelu',
    photo: 'Fot. {credit}',
  },
  en: {
    loadingSite: 'Loading site data…',
    noId: 'The page address does not contain a site identifier.',
    siteNotFound: 'No site found with this identifier.',
    siteError: 'The site data could not be downloaded. Check your internet connection.',
    noModel: 'This site does not have a 3D model yet.',
    loadingModel: '⏳ Downloading 3D model: {p}%',
    loadingModelUnknown: '⏳ Downloading 3D model…',
    modelError: '❌ The 3D model could not be loaded.',
    noWebGL: 'Your browser does not support 3D graphics (WebGL).',
    previewHint: 'Drag to rotate, pinch to zoom',
    startAndroid: 'Start AR',
    openIOS: '📍 Open in AR (iPhone / iOS)',
    openChrome: 'Open in Chrome',
    readyAndroid: 'Tap the brown button to start the camera and place the model in space.',
    readyIOS: 'Tap the blue button to view the model in AR Quick Look.',
    noAr: 'This device or browser does not support AR. Explore the model in the 3D preview above. On Android, open the page in Chrome.',
    noArOtherBrowser: 'This browser (e.g. one built into an app) does not support camera AR (WebXR). Explore the model in the 3D preview above or open the page in Chrome.',
    noArChrome: 'Chrome on this device does not provide AR (WebXR). Explore the model in the 3D preview above and make sure Chrome is up to date.',
    arStartError: 'AR could not be started. Make sure Google Play Services for AR is installed and the browser has camera access.',
    modeTabletop: 'Tabletop',
    modeReal: 'Scale 1:1',
    modeTabletopDesc: 'A scaled-down model to place on a table or the floor.',
    modeRealDesc: 'The building at its real size – best on site, in open space.',
    modeRealDescIOS: 'In AR Quick Look, scale 1:1 locks the model size.',
    modeTabletopDescIOS: 'In AR Quick Look, pinch with two fingers to change the model size.',
    arScan: 'Move your phone slowly to detect the ground.',
    arTapPlace: 'Tap screen to place model',
    arTapWake: 'Tap screen to show target and move model',
    close: 'Close AR',
    rotateLeft: 'Rotate left',
    rotateRight: 'Rotate right',
    smaller: 'Smaller',
    bigger: 'Bigger',
    rotateGroup: 'Model rotation',
    scaleGroup: 'Model size',
    photo: 'Photo: {credit}',
  },
};

// ───────────────────────── Parametry i elementy strony ─────────────────────────

const VIEWER_VERSION = '2';
const PAGE_VERSION = document.querySelector('meta[name="histary-viewer"]')?.getAttribute('content') || '?';
document.documentElement.dataset.viewer = VIEWER_VERSION;
if (PAGE_VERSION !== VIEWER_VERSION) {
  console.warn(`histARy: index.html (v${PAGE_VERSION}) i viewer.js (v${VIEWER_VERSION}) pochodzą z różnych wersji – wgraj oba pliki i wyczyść pamięć podręczną przeglądarki.`);
}

const params = new URLSearchParams(location.search);
const lang = params.get('lang') === 'en' ? 'en' : 'pl';
const debug = params.get('debug') === '1';
const T = (key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), TEXT[lang][key]);
document.documentElement.lang = lang;

const $ = (id) => document.getElementById(id);
const ui = {
  title: $('title'),
  subtitle: $('subtitle'),
  preview: $('preview'),
  previewHint: $('preview-hint'),
  progress: $('progress'),
  progressBar: $('progress').firstElementChild,
  modeSwitch: $('mode-switch'),
  modeDesc: $('mode-desc'),
  qlLink: $('ql-link'),
  qlImg: $('ql-img'),
  startAr: $('start-ar'),
  status: $('status'),
  credit: $('credit'),
  debugPage: $('debug-page'),
  overlay: $('ar-overlay'),
  arHint: $('ar-hint'),
  arClose: $('ar-close'),
  arToolbar: null,      // ustawiane przez buildArToolbar()
  arMode: null,         // ustawiane przez buildArToolbar()
  debug: $('debug'),
};

/**
 * Dolny pasek AR budowany w kodzie – jedno źródło układu niezależne od wersji index.html.
 * Lewa grupa: obrót (↺ ↻), środek: tryb „Makieta” / „Skala 1:1”, prawa grupa: skala (− +).
 * Dotychczasowa zawartość #ar-toolbar (np. ze starszej strony) jest zastępowana.
 */
function buildArToolbar() {
  let bar = $('ar-toolbar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'ar-toolbar';
    bar.className = 'ar-toolbar';
    bar.hidden = true;
    ui.overlay.insertBefore(bar, ui.debug && ui.debug.parentNode === ui.overlay ? ui.debug : null);
  }
  const button = (action, label, aria) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ar-btn';
    b.dataset.action = action;
    b.textContent = label;
    b.setAttribute('aria-label', aria);
    return b;
  };
  const group = (aria, ...buttons) => {
    const g = document.createElement('div');
    g.className = 'ar-group';
    g.setAttribute('role', 'group');
    g.setAttribute('aria-label', aria);
    g.append(...buttons);
    return g;
  };
  const hud = {
    rotateLeft: button('rotate-left', '↺', T('rotateLeft')),
    rotateRight: button('rotate-right', '↻', T('rotateRight')),
    smaller: button('smaller', '−', T('smaller')),
    bigger: button('bigger', '+', T('bigger')),
    mode: document.createElement('button'),
  };
  hud.mode.type = 'button';
  hud.mode.id = 'ar-mode';
  hud.mode.className = 'ar-mode';
  hud.mode.dataset.action = 'mode';
  hud.mode.textContent = T('modeTabletop');
  bar.replaceChildren(
    group(T('rotateGroup'), hud.rotateLeft, hud.rotateRight),
    hud.mode,
    group(T('scaleGroup'), hud.smaller, hud.bigger),
  );
  ui.arToolbar = bar;
  ui.arMode = hud.mode;
  return hud;
}

const hud = buildArToolbar();

const setStatus = (text) => { ui.status.textContent = text; };

const SITE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Android: odróżnienie Google Chrome od WebView i innych przeglądarek (User-Agent Client Hints + UA).
const UA = navigator.userAgent || '';
const isAndroid = /Android/i.test(UA);
const uaBrands = navigator.userAgentData && Array.isArray(navigator.userAgentData.brands)
  ? navigator.userAgentData.brands.map((b) => b.brand)
  : [];
const OTHER_ANDROID_BROWSERS = /SamsungBrowser|EdgA|OPR\/|OPX|YaBrowser|UCBrowser|Firefox|DuckDuckGo|MiuiBrowser|HuaweiBrowser|HeyTapBrowser|VivoBrowser|Brave|FBAN|FBAV|Instagram|Line\/|KAKAOTALK|Snapchat|LinkedInApp/i;
const isAndroidWebView = isAndroid && (/\bwv\b/.test(UA) || uaBrands.includes('Android WebView'));
const isGoogleChrome = isAndroid && !isAndroidWebView && (uaBrands.length > 0
  ? uaBrands.includes('Google Chrome')
  : /Chrome\/\d+/.test(UA) && !OTHER_ANDROID_BROWSERS.test(UA));

const CHROME_PACKAGE = 'com.android.chrome';
const CHROME_PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.android.chrome';
const XR_DETECT_TIMEOUT_MS = 4000;

/** Adres intent:// otwierający bieżącą stronę w Chrome; bez Chrome → strona Chrome w Sklepie Play. */
function chromeIntentUrl(href) {
  const rest = String(href).split('#')[0].replace(/^https?:\/\//i, '');
  return `intent://${rest}#Intent;scheme=https;package=${CHROME_PACKAGE};S.browser_fallback_url=${encodeURIComponent(CHROME_PLAY_STORE_URL)};end`;
}

/** Ścieżka z pliku JSON → pełny adres; dozwolone https:// i ścieżki względne bez "..". */
function resolveAsset(path) {
  if (typeof path !== 'string' || !path.trim()) return null;
  const p = path.trim();
  if (/^https:\/\//i.test(p)) return p;
  if (/^[a-z][a-z0-9+.-]*:/i.test(p) || p.startsWith('//') || p.split('/').includes('..')) return null;
  return new URL(p.replace(/^\/+/, ''), document.baseURI).href;
}

const pick = (text) => (text && (text[lang] || text.pl)) || '';

// ───────────────────────── Stałe interakcji AR ─────────────────────────

const REAL_SCALE_CLEARANCE_M = 5;          // odstęp użytkownika od najbliższej ściany w trybie 1:1
const ROTATE_SPEED_RAD_S = Math.PI / 3;    // 60°/s przy przytrzymaniu przycisku obrotu
const TAP_ROTATE_STEP_RAD = Math.PI / 12;  // 15° przy krótkim stuknięciu przycisku obrotu
const TAP_MAX_MS = 200;                    // krótsze przytrzymanie = stuknięcie
const GESTURE_COOLDOWN_MS = 350;           // po geście dwoma palcami ignorujemy „select”
const HUD_TAP_COOLDOWN_MS = 400;           // po dotknięciu przycisku HUD ignorujemy „select”
const HUD_SELECTOR = 'button, .ar-toolbar';

// ───────────────────────── Czysta logika (bez DOM i WebXR) ─────────────────────────

/**
 * Maszyna stanów stuknięcia w AR.
 * 'wake'  – model postawiony, celownik ukryty → pierwsze stuknięcie tylko pokazuje celownik,
 * 'place' – celownik aktywny i widoczny → postaw / przenieś model,
 * 'none'  – celownik aktywny, ale podłoże nie zostało jeszcze wykryte.
 */
function selectAction(reticleActive, reticleVisible) {
  if (!reticleActive) return 'wake';
  return reticleVisible ? 'place' : 'none';
}

/** Kąt obrotu wokół osi Y, przy którym przód modelu (+Z) patrzy z punktu (x, z) na użytkownika. */
function yawFacing(fromX, fromZ, viewerX, viewerZ) {
  return Math.atan2(viewerX - fromX, viewerZ - fromZ);
}

/**
 * Tryb 1:1: rzut kierunku patrzenia na płaszczyznę XZ, środek podstawy odsunięty o
 * max(szerokość, głębokość) / 2 + 5 m, fasada zwrócona do użytkownika.
 * Gdy użytkownik patrzy pionowo w dół, kierunek wyznacza punkt celownika.
 */
function computeRealPlacement(viewer, gaze, target, floorY, halfExtent) {
  let dx = gaze.x;
  let dz = gaze.z;
  let len = Math.hypot(dx, dz);
  if (len < 1e-3 && target) {
    dx = target.x - viewer.x;
    dz = target.z - viewer.z;
    len = Math.hypot(dx, dz);
  }
  if (len < 1e-3) {
    dx = 0;
    dz = -1;
    len = 1;
  }
  dx /= len;
  dz /= len;
  const distance = halfExtent + REAL_SCALE_CLEARANCE_M;
  const x = viewer.x + dx * distance;
  const z = viewer.z + dz * distance;
  return { x, y: floorY, z, yaw: yawFacing(x, z, viewer.x, viewer.z) };
}

// ───────────────────────── Dane zabytku ─────────────────────────

async function loadSite(id) {
  const res = await fetch(`sites/${encodeURIComponent(id)}.json`, { cache: 'no-cache' });
  if (res.status === 404) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = await res.json();
  if (!doc || doc.id !== id || !doc.title || !doc.title.pl) throw new Error('invalid');
  return doc;
}

// ───────────────────────── Model 3D ─────────────────────────

/** Mierzy model i ustawia jego punkt odniesienia w środku podstawy (y = 0 to podłoże). */
function prepareModel(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));

  let triangles = 0;
  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      const g = obj.geometry;
      triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
    }
  });

  const pivot = new THREE.Group();
  pivot.add(root);
  const footprint = Math.max(size.x, size.z) || 1;
  return { pivot, size, footprint, triangles: Math.round(triangles) };
}

/** Płaszczyzna przyjmująca wyłącznie cień – „cień kontaktowy” pod budowlą. */
function makeShadowCatcher(footprint) {
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(footprint * 2.2, footprint * 2.2),
    new THREE.ShadowMaterial({ opacity: 0.35 })
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = 0.001;
  plane.receiveShadow = true;
  return plane;
}

/** Dopasowuje ortograficzną kamerę cienia do rozmiaru modelu w scenie. */
function fitShadow(light, target, worldSize) {
  const s = worldSize * 0.75;
  const cam = light.shadow.camera;
  cam.left = -s; cam.right = s; cam.top = s; cam.bottom = -s;
  cam.near = 0.01; cam.far = worldSize * 8;
  cam.updateProjectionMatrix();
  light.shadow.bias = -0.0005;
  light.shadow.normalBias = 0.01 * worldSize;
  const dir = light.userData.direction ?? new THREE.Vector3(0.5, 1.6, 0.8).normalize();
  light.position.copy(target.position).addScaledVector(dir, worldSize * 3);
  light.target.position.copy(target.position);
  light.target.updateMatrixWorld();
}

// ───────────────────────── Aplikacja ─────────────────────────

const state = {
  site: null,
  ar: null,
  model: null,          // wynik prepareModel()
  mode: 'tabletop',     // 'tabletop' | 'real'
  userScale: 1,         // dodatkowa skala makiety ustawiana gestem
  yaw: 0,
  placed: false,
  reticleActive: true,  // czy celownik ma być pokazywany i aktualizowany z hit-testu
  floorY: null,         // wysokość podłoża z ostatniego postawienia
  tabletopPose: null,   // { position, yaw } makiety – przywracane po powrocie z trybu 1:1
  xr: { supported: false, reason: 'pending' },  // wynik wykrywania WebXR
  canQuickLook: false,
  modelStatus: 'none',  // 'none' | 'loading' | 'ready' | 'error' | 'nowebgl'
};

let renderer = null;

async function main() {
  const id = (params.get('id') || '').toLowerCase();
  ui.subtitle.textContent = T('loadingSite');
  if (!SITE_ID_RE.test(id)) {
    ui.subtitle.textContent = T('noId');
    return;
  }

  try {
    state.site = await loadSite(id);
  } catch (e) {
    ui.subtitle.textContent = e.code === 'not_found' ? T('siteNotFound') : T('siteError');
    return;
  }

  const site = state.site;
  document.title = `${pick(site.title)} – histARy AR`;
  ui.title.textContent = `🏛️ ${pick(site.title)}`;
  ui.subtitle.textContent = pick(site.subtitle);
  if (site.image && site.image.credit) ui.credit.textContent = T('photo', { credit: site.image.credit });

  if (!site.ar) {
    setStatus(T('noModel'));
    return;
  }

  state.ar = {
    glb: resolveAsset(site.ar.glb),
    usdz: resolveAsset(site.ar.usdz),
    realWidth: Number(site.ar.realWidthMeters) > 0 ? Number(site.ar.realWidthMeters) : null,
    tabletopWidth: Number(site.ar.tabletopWidthMeters) > 0 ? Number(site.ar.tabletopWidthMeters) : 0.5,
  };

  state.canQuickLook = detectQuickLook() && Boolean(state.ar.usdz);
  if (state.canQuickLook) setupQuickLook();

  // Wykrywanie WebXR biegnie równolegle z pobieraniem modelu; każdy wynik odświeża interfejs.
  const xrReady = detectWebXR(applyXrResult).then(applyXrResult);
  watchWebXR();
  refreshArEntry();

  if (state.ar.glb) {
    if (!initRenderer()) {
      state.modelStatus = 'nowebgl';
      setStatus(T('noWebGL'));
    } else {
      await loadModel();
    }
  }

  await xrReady;
  refreshArEntry();
}

/**
 * Sprawdza navigator.xr.isSessionSupported('immersive-ar') z limitem czasu.
 * Wynik: { supported, reason } – reason ∈ supported | unsupported | no-api | insecure | timeout | error.
 * Gdy odpowiedź przyjdzie po limicie czasu, trafi do onLateResult.
 */
async function detectWebXR(onLateResult) {
  if (!('xr' in navigator) || !navigator.xr || typeof navigator.xr.isSessionSupported !== 'function') {
    return { supported: false, reason: 'no-api' };
  }
  if (!window.isSecureContext) return { supported: false, reason: 'insecure' };
  let timer = null;
  try {
    const query = Promise.resolve(navigator.xr.isSessionSupported('immersive-ar'));
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), XR_DETECT_TIMEOUT_MS); });
    const answer = await Promise.race([query, timeout]);
    if (answer === 'timeout') {
      if (onLateResult) {
        query.then((late) => { if (late === true) onLateResult({ supported: true, reason: 'supported' }); }, () => {});
      }
      return { supported: false, reason: 'timeout' };
    }
    return answer === true ? { supported: true, reason: 'supported' } : { supported: false, reason: 'unsupported' };
  } catch (e) {
    return { supported: false, reason: 'error' };
  } finally {
    clearTimeout(timer);
  }
}

/** Wynik wykrywania nigdy nie cofa potwierdzonego wsparcia (brak wyścigu odpowiedzi). */
function applyXrResult(result) {
  if (!result || (state.xr.supported && !result.supported)) return;
  state.xr = result;
  refreshArEntry();
}

/** Ponowne sprawdzenie po zmianie urządzeń XR i po powrocie na kartę (np. po instalacji ARCore). */
let xrRecheckRunning = false;
function watchWebXR() {
  const recheck = async () => {
    if (xrRecheckRunning || state.xr.supported) return;
    xrRecheckRunning = true;
    try {
      applyXrResult(await detectWebXR(applyXrResult));
    } finally {
      xrRecheckRunning = false;
    }
  };
  if (navigator.xr && typeof navigator.xr.addEventListener === 'function') {
    navigator.xr.addEventListener('devicechange', recheck);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') recheck();
  });
}

function noArMessage() {
  if (isAndroid && !isGoogleChrome) return T('noArOtherBrowser');
  if (isGoogleChrome) return T('noArChrome');
  return T('noAr');
}

let chromeLink = null;

/** Przycisk „Otwórz w Chrome” tuż pod komunikatem (tworzony dynamicznie – bez zmian w index.html). */
function setChromeFallback(show) {
  if (!show) {
    if (chromeLink) chromeLink.hidden = true;
    return;
  }
  if (!chromeLink) {
    chromeLink = document.createElement('a');
    chromeLink.id = 'open-chrome';
    chromeLink.className = 'btn btn-android';
    chromeLink.style.marginTop = '12px';
    chromeLink.rel = 'noopener';
    ui.status.insertAdjacentElement('afterend', chromeLink);
  }
  chromeLink.textContent = T('openChrome');
  chromeLink.href = chromeIntentUrl(location.href);
  chromeLink.hidden = false;
}

let modeSwitchReady = false;

/** Jedno miejsce, które ustawia przyciski AR i komunikat – można je wywoływać wielokrotnie. */
function refreshArEntry() {
  if (!state.ar) return;
  const modelUsable = state.modelStatus !== 'error' && state.modelStatus !== 'nowebgl';
  const canWebXR = state.xr.supported && Boolean(state.ar.glb) && modelUsable;
  const xrKnown = state.xr.reason !== 'pending';

  if ((canWebXR || state.canQuickLook) && !modeSwitchReady) {
    modeSwitchReady = true;
    setupModeSwitch(state.canQuickLook && !canWebXR);
  }

  ui.startAr.textContent = T('startAndroid');
  ui.startAr.hidden = !canWebXR;
  ui.startAr.disabled = !(canWebXR && state.model);

  setChromeFallback(isAndroid && !isGoogleChrome && xrKnown && !state.xr.supported && Boolean(state.ar.glb));

  if (state.modelStatus === 'loading' || !modelUsable) return;
  if (canWebXR && state.model) setStatus(T('readyAndroid'));
  else if (state.canQuickLook) setStatus(T('readyIOS'));
  else if (state.model && xrKnown) setStatus(noArMessage());
}

function detectQuickLook() {
  const a = document.createElement('a');
  return Boolean(a.relList && a.relList.supports && a.relList.supports('ar')) || isIOS;
}

// ───────── Tryb skali ─────────

function setupModeSwitch(forQuickLook) {
  const buttons = ui.modeSwitch.querySelectorAll('button');
  buttons[0].textContent = T('modeTabletop');
  buttons[1].textContent = T('modeReal');
  ui.modeSwitch.hidden = false;
  ui.modeDesc.hidden = false;
  const describe = () => {
    ui.modeDesc.textContent = state.mode === 'real'
      ? (forQuickLook ? T('modeRealDescIOS') : T('modeRealDesc'))
      : (forQuickLook ? T('modeTabletopDescIOS') : T('modeTabletopDesc'));
  };
  buttons.forEach((btn) => btn.addEventListener('click', () => {
    setMode(btn.dataset.mode);
    describe();
  }));
  describe();
}

function setMode(mode) {
  const previous = state.mode;
  state.mode = mode === 'real' ? 'real' : 'tabletop';
  ui.modeSwitch.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
  ui.arMode.textContent = state.mode === 'real' ? T('modeReal') : T('modeTabletop');
  hud.smaller.disabled = state.mode === 'real';
  hud.bigger.disabled = state.mode === 'real';
  if (state.ar && state.ar.usdz) updateQuickLookHref();
  applyArScale();
  if (previous !== state.mode) repositionForMode(previous);
  updateArHint();
}

// ───────── iOS: AR Quick Look ─────────

/** Przycisk Quick Look jako obraz SVG – Apple wymaga, by kotwica rel="ar" zawierała tylko <img>. */
function buttonImage(label) {
  const esc = label.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="112" viewBox="0 0 720 112">
<rect width="720" height="112" rx="28" fill="#007aff"/>
<text x="360" y="66" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="32" font-weight="700" fill="#fff">${esc}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function setupQuickLook() {
  ui.qlImg.src = buttonImage(T('openIOS'));
  ui.qlImg.alt = T('openIOS');
  updateQuickLookHref();
  ui.qlLink.hidden = false;
}

function updateQuickLookHref() {
  // allowsContentScaling=0 blokuje zmianę skali w Quick Look (tryb 1:1).
  ui.qlLink.href = state.mode === 'real' ? `${state.ar.usdz}#allowsContentScaling=0` : state.ar.usdz;
}

// ───────── Renderer, podgląd 3D ─────────

const preview = { scene: null, camera: null, controls: null, light: null };
const ar = {
  scene: null, camera: null, anchor: null, scaleGroup: null, light: null, hemi: null,
  reticle: null, hitTestSource: null, xrLight: null, estimating: false, envMap: null,
  gestureActive: false, lastGestureEnd: -Infinity, lastHudTouch: -Infinity, lastFrameTime: 0,
};

function initRenderer() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    return false;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.xr.enabled = true;

  ui.preview.hidden = false;
  ui.preview.prepend(renderer.domElement);
  ui.previewHint.textContent = T('previewHint');

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  // Scena podglądu
  preview.scene = new THREE.Scene();
  preview.scene.environment = envMap;
  preview.scene.environmentIntensity = 0.7;
  preview.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  preview.camera.position.set(1.4, 1.0, 1.8);
  preview.controls = new OrbitControls(preview.camera, renderer.domElement);
  preview.controls.enableDamping = true;
  preview.controls.enablePan = false;
  preview.controls.minDistance = 0.6;
  preview.controls.maxDistance = 6;
  preview.controls.maxPolarAngle = Math.PI * 0.49;
  preview.controls.autoRotate = true;
  preview.controls.autoRotateSpeed = 0.8;
  preview.controls.addEventListener('start', () => { preview.controls.autoRotate = false; });
  preview.light = new THREE.DirectionalLight(0xffffff, 1.2);
  preview.light.castShadow = true;
  preview.light.shadow.mapSize.set(1024, 1024);
  preview.scene.add(preview.light, preview.light.target, new THREE.HemisphereLight(0xffffff, 0x444444, 0.5));

  // Scena AR
  ar.envMap = envMap;
  ar.scene = new THREE.Scene();
  ar.scene.environment = envMap;
  ar.scene.environmentIntensity = 0.6;
  ar.camera = new THREE.PerspectiveCamera(70, 1, 0.01, 2000);
  ar.hemi = new THREE.HemisphereLight(0xffffff, 0x666666, 1.0);
  ar.light = new THREE.DirectionalLight(0xffffff, 1.6);
  ar.light.castShadow = true;
  ar.light.shadow.mapSize.set(2048, 2048);
  ar.scene.add(ar.hemi, ar.light, ar.light.target);

  ar.anchor = new THREE.Group();
  ar.anchor.visible = false;
  ar.scaleGroup = new THREE.Group();
  ar.anchor.add(ar.scaleGroup);
  ar.scene.add(ar.anchor);

  ar.reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.15, 0.2, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x704214 })
  );
  ar.reticle.matrixAutoUpdate = false;
  ar.reticle.visible = false;
  ar.scene.add(ar.reticle);

  const controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  ar.scene.add(controller);

  // Szacowanie oświetlenia (WebXR Lighting Estimation): kierunek i barwa światła
  // z otoczenia sterują światłem rzucającym cień.
  ar.xrLight = new XREstimatedLight(renderer);
  ar.xrLight.directionalLight.visible = false;
  ar.xrLight.addEventListener('estimationstart', () => {
    ar.estimating = true;
    ar.scene.add(ar.xrLight);
    ar.hemi.visible = false;
    if (ar.xrLight.environment) {
      ar.scene.environment = ar.xrLight.environment;
      ar.scene.environmentIntensity = 1;
    }
  });
  ar.xrLight.addEventListener('estimationend', () => {
    ar.estimating = false;
    ar.scene.remove(ar.xrLight);
    ar.hemi.visible = true;
    ar.scene.environment = ar.envMap;
    ar.scene.environmentIntensity = 0.6;
    ar.light.color.set(0xffffff);
    ar.light.intensity = 1.6;
    delete ar.light.userData.direction;
  });

  const ro = new ResizeObserver(resizePreview);
  ro.observe(ui.preview);
  resizePreview();

  renderer.setAnimationLoop(renderFrame);
  return true;
}

function resizePreview() {
  if (!renderer || renderer.xr.isPresenting) return;
  const w = ui.preview.clientWidth || 300;
  const h = ui.preview.clientHeight || 300;
  renderer.setSize(w, h, false);
  preview.camera.aspect = w / h;
  preview.camera.updateProjectionMatrix();
}

async function loadModel() {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  state.modelStatus = 'loading';
  ui.progress.hidden = false;
  setStatus(T('loadingModelUnknown'));
  const started = performance.now();
  let bytes = 0;

  try {
    const gltf = await loader.loadAsync(state.ar.glb, (xhr) => {
      bytes = xhr.loaded;
      if (xhr.lengthComputable && xhr.total > 0) {
        const p = Math.round((xhr.loaded / xhr.total) * 100);
        ui.progressBar.style.width = `${p}%`;
        setStatus(T('loadingModel', { p }));
      }
    });
    state.model = prepareModel(gltf.scene);
    state.model.loadMs = Math.round(performance.now() - started);
    state.model.bytes = bytes;
  } catch (e) {
    console.error(e);
    state.modelStatus = 'error';
    ui.progress.hidden = true;
    setStatus(T('modelError'));
    refreshArEntry();
    return;
  }
  state.modelStatus = 'ready';
  ui.progress.hidden = true;

  // Podgląd: model znormalizowany do szerokości 1 m
  const previewModel = state.model.pivot.clone(true);
  const s = 1 / state.model.footprint;
  const holder = new THREE.Group();
  holder.scale.setScalar(s);
  holder.add(previewModel, makeShadowCatcher(state.model.footprint));
  preview.scene.add(holder);
  const h = state.model.size.y * s;
  preview.controls.target.set(0, h * 0.4, 0);
  preview.camera.position.set(1.3, Math.max(0.6, h * 1.2), 1.7);
  preview.controls.update();
  fitShadow(preview.light, holder, 1.2);

  // AR: osobna kopia z własnym cieniem
  ar.scaleGroup.add(state.model.pivot, makeShadowCatcher(state.model.footprint));
  applyArScale();

  if (debug) {
    ui.debugPage.hidden = false;
    ui.debugPage.textContent = debugText();
  }
  refreshArEntry();
}

// ───────── Skala modelu w AR ─────────

function currentArScale() {
  if (!state.model) return 1;
  const f = state.model.footprint;
  if (state.mode === 'real') {
    // Brak realWidthMeters → zakładamy, że jednostką modelu jest metr.
    return state.ar.realWidth ? state.ar.realWidth / f : 1;
  }
  return (state.ar.tabletopWidth / f) * state.userScale;
}

function applyArScale() {
  if (!state.model || !ar.scaleGroup) return;
  const scale = currentArScale();
  ar.scaleGroup.scale.setScalar(scale);
  fitShadow(ar.light, ar.anchor, state.model.footprint * scale);
}

// ───────── Położenie użytkownika i stawianie modelu ─────────

const _viewer = new THREE.Vector3();
const _gaze = new THREE.Vector3();
const _hit = new THREE.Vector3();

/** Pozycja kamery XR i kierunek patrzenia (z ostatniej klatki). */
function readViewer() {
  const cam = renderer.xr.getCamera();
  _viewer.setFromMatrixPosition(cam.matrixWorld);
  _gaze.set(0, 0, -1).transformDirection(cam.matrixWorld);
  return { viewer: _viewer, gaze: _gaze };
}

/** Połowa największego wymiaru podstawy budowli w skali 1:1 (metry). */
function realHalfExtent() {
  if (!state.model) return 0;
  const scale = state.ar.realWidth ? state.ar.realWidth / state.model.footprint : 1;
  return (Math.max(state.model.size.x, state.model.size.z) * scale) / 2;
}

function setAnchorPose(x, y, z, yaw) {
  ar.anchor.position.set(x, y, z);
  state.yaw = yaw;
  ar.anchor.rotation.y = yaw;
}

/** Postawienie (lub przeniesienie) modelu w miejscu celownika – reguły trybu „Makieta” / „Skala 1:1”. */
function placeAtReticle() {
  _hit.setFromMatrixPosition(ar.reticle.matrix);
  const { viewer, gaze } = readViewer();
  state.floorY = _hit.y;

  if (state.mode === 'real') {
    const p = computeRealPlacement(viewer, gaze, _hit, _hit.y, realHalfExtent());
    setAnchorPose(p.x, p.y, p.z, p.yaw);
  } else {
    // Makieta staje dokładnie na celowniku. Przy pierwszym postawieniu front modelu (+Z)
    // zwracamy w stronę użytkownika, przy przenoszeniu zachowujemy dotychczasowy obrót.
    const yaw = state.placed ? state.yaw : yawFacing(_hit.x, _hit.z, viewer.x, viewer.z);
    setAnchorPose(_hit.x, _hit.y, _hit.z, yaw);
    state.tabletopPose = { position: _hit.clone(), yaw };
  }

  if (!state.placed) {
    state.placed = true;
    ar.anchor.visible = true;
    ui.arToolbar.hidden = false;
  }
  applyArScale();
}

/** Zmiana trybu po postawieniu: 1:1 przed użytkownikiem, powrót do makiety w poprzednie miejsce. */
function repositionForMode(previousMode) {
  if (!renderer || !renderer.xr.isPresenting || !state.placed) return;
  const floorY = state.floorY ?? ar.anchor.position.y;
  const { viewer, gaze } = readViewer();

  if (state.mode === 'real') {
    if (previousMode === 'tabletop') {
      state.tabletopPose = { position: ar.anchor.position.clone(), yaw: state.yaw };
    }
    const p = computeRealPlacement(viewer, gaze, null, floorY, realHalfExtent());
    setAnchorPose(p.x, p.y, p.z, p.yaw);
  } else if (state.tabletopPose) {
    const { position, yaw } = state.tabletopPose;
    setAnchorPose(position.x, position.y, position.z, yaw);
  } else {
    // Model postawiono od razu w skali 1:1 – makieta ok. 1,2 m przed użytkownikiem.
    const len = Math.hypot(gaze.x, gaze.z) || 1;
    const x = viewer.x + (gaze.x / len) * 1.2;
    const z = viewer.z + (gaze.z / len) * 1.2;
    setAnchorPose(x, floorY, z, yawFacing(x, z, viewer.x, viewer.z));
    state.tabletopPose = { position: ar.anchor.position.clone(), yaw: state.yaw };
  }
  applyArScale();
}

// ───────── Sesja WebXR ─────────

async function startAR() {
  if (!state.model || !state.xr.supported || renderer.xr.isPresenting) return;
  try {
    // requestSession musi zostać wywołane bezpośrednio w obsłudze kliknięcia.
    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'light-estimation', 'local-floor'],
      domOverlay: { root: ui.overlay },
    });
    renderer.xr.setReferenceSpaceType('local');
    await renderer.xr.setSession(session);
    onSessionStart(session);
  } catch (e) {
    console.error(e);
    setStatus(T('arStartError'));
  }
}

function onSessionStart(session) {
  state.placed = false;
  state.reticleActive = true;   // od razu widać celownik do pierwszego postawienia
  state.floorY = null;
  state.tabletopPose = null;
  stopHoldRotate();
  ar.lastFrameTime = 0;
  ar.reticle.visible = false;
  ar.anchor.visible = false;
  ui.overlay.hidden = false;
  ui.arToolbar.hidden = true;
  ui.arMode.textContent = state.mode === 'real' ? T('modeReal') : T('modeTabletop');
  ui.debug.hidden = !debug;
  updateArHint();

  session.requestReferenceSpace('viewer')
    .then((space) => session.requestHitTestSource({ space }))
    .then((source) => { ar.hitTestSource = source; })
    .catch((e) => console.error(e));

  session.addEventListener('end', onSessionEnd, { once: true });
}

function onSessionEnd() {
  if (ar.hitTestSource) {
    ar.hitTestSource.cancel?.();
    ar.hitTestSource = null;
  }
  stopHoldRotate();
  ar.reticle.visible = false;
  ui.overlay.hidden = true;
  state.placed = false;
  state.reticleActive = true;
  requestAnimationFrame(resizePreview);
  setStatus(T('readyAndroid'));
}

function updateArHint() {
  if (!renderer || !renderer.xr.isPresenting) return;
  let text;
  if (!state.reticleActive) text = T('arTapWake');          // model postawiony, celownik ukryty
  else if (!ar.reticle.visible) text = T('arScan');         // celownik aktywny, brak podłoża
  else text = T('arTapPlace');                              // celownik aktywny i widoczny
  if (ui.arHint.textContent !== text) ui.arHint.textContent = text;
}

/**
 * Stuknięcie ekranu (zdarzenie „select” WebXR):
 *  A) celownik aktywny i widoczny → postaw / przenieś model, schowaj celownik,
 *  B) model postawiony, celownik ukryty → pierwsze stuknięcie tylko „budzi” celownik,
 *     drugie (już przy aktywnym celowniku) przenosi model jak w przypadku A.
 */
function onSelect() {
  const now = performance.now();
  if (!state.model) return;
  if (ar.gestureActive || now - ar.lastGestureEnd < GESTURE_COOLDOWN_MS) return;
  if (now - ar.lastHudTouch < HUD_TAP_COOLDOWN_MS) return;

  switch (selectAction(state.reticleActive, ar.reticle.visible)) {
    case 'wake':
      state.reticleActive = true;
      break;
    case 'place':
      placeAtReticle();
      state.reticleActive = false;
      ar.reticle.visible = false;
      break;
    default:
      break;
  }
  updateArHint();
}

function rotateBy(rad) {
  state.yaw += rad;
  ar.anchor.rotation.y = state.yaw;
}

function scaleBy(factor) {
  if (state.mode === 'real') return;
  state.userScale = THREE.MathUtils.clamp(state.userScale * factor, 0.25, 4);
  applyArScale();
}

// ───────── Przyciski HUD ─────────

// Dotknięcia przycisków i paska narzędzi nie mogą stawiać ani budzić celownika.
ui.overlay.addEventListener('beforexrselect', (e) => {
  if (e.target instanceof Element && e.target.closest(HUD_SELECTOR)) e.preventDefault();
});
ui.overlay.addEventListener('pointerdown', (e) => {
  if (e.target instanceof Element && e.target.closest(HUD_SELECTOR)) ar.lastHudTouch = performance.now();
}, { capture: true });
// Przytrzymanie nie otwiera menu kontekstowego i nie zaznacza tekstu.
ui.overlay.addEventListener('contextmenu', (e) => e.preventDefault());

ui.startAr.addEventListener('click', startAR);
ui.arClose.addEventListener('click', () => renderer?.xr.getSession()?.end());
ui.arClose.setAttribute('aria-label', T('close'));

ui.arToolbar.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  switch (btn.dataset.action) {
    case 'rotate-left':
    case 'rotate-right':
      // Obrót wskaźnikiem obsługuje przytrzymanie; tu tylko klawiatura (detail === 0).
      if (e.detail === 0) rotateBy(btn.dataset.action === 'rotate-left' ? TAP_ROTATE_STEP_RAD : -TAP_ROTATE_STEP_RAD);
      break;
    case 'smaller': scaleBy(1 / 1.15); break;
    case 'bigger': scaleBy(1.15); break;
    case 'mode': setMode(state.mode === 'real' ? 'tabletop' : 'real'); break;
    default: break;
  }
});

// Obrót przytrzymaniem: 60°/s liczone z czasu klatki; krótkie stuknięcie = krok 15°.
// ↺ (lewo) = przeciwnie do ruchu wskazówek zegara patrząc z góry (+Y), ↻ (prawo) = zgodnie.
const hold = { dir: 0, startedAt: 0, rotated: 0, button: null };

function startHoldRotate(dir, button) {
  hold.dir = dir;
  hold.startedAt = performance.now();
  hold.rotated = 0;
  hold.button = button || null;
  if (hold.button) hold.button.classList.add('is-held');
}

function stopHoldRotate() {
  if (!hold.dir) return;
  const heldMs = performance.now() - hold.startedAt;
  if (heldMs < TAP_MAX_MS && state.placed) {
    const remaining = TAP_ROTATE_STEP_RAD - Math.abs(hold.rotated);
    if (remaining > 0) rotateBy(hold.dir * remaining);
  }
  if (hold.button) hold.button.classList.remove('is-held');
  hold.dir = 0;
  hold.rotated = 0;
  hold.button = null;
}

[[hud.rotateLeft, 1], [hud.rotateRight, -1]].forEach(([btn, dir]) => {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { btn.setPointerCapture(e.pointerId); } catch (err) { /* brak wsparcia */ }
    startHoldRotate(dir, btn);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => btn.addEventListener(type, stopHoldRotate));
});

// Gesty dwoma palcami na nakładce: szczypanie = skala (makieta), skręt = obrót.
const pinch = { dist: 0, angle: 0, scale: 1, yaw: 0 };
const touchInfo = (t) => {
  const dx = t[1].clientX - t[0].clientX;
  const dy = t[1].clientY - t[0].clientY;
  return { dist: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) };
};
ui.overlay.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2 && state.placed) {
    ar.gestureActive = true;
    const info = touchInfo(e.touches);
    Object.assign(pinch, { dist: info.dist, angle: info.angle, scale: state.userScale, yaw: state.yaw });
  }
}, { passive: true });
ui.overlay.addEventListener('touchmove', (e) => {
  if (!ar.gestureActive || e.touches.length !== 2) return;
  const info = touchInfo(e.touches);
  if (state.mode !== 'real' && pinch.dist > 0) {
    state.userScale = THREE.MathUtils.clamp(pinch.scale * (info.dist / pinch.dist), 0.25, 4);
    applyArScale();
  }
  state.yaw = pinch.yaw - (info.angle - pinch.angle);
  ar.anchor.rotation.y = state.yaw;
}, { passive: true });
const endGesture = (e) => {
  if (ar.gestureActive && e.touches.length < 2) {
    ar.gestureActive = false;
    ar.lastGestureEnd = performance.now();
  }
};
ui.overlay.addEventListener('touchend', endGesture, { passive: true });
ui.overlay.addEventListener('touchcancel', endGesture, { passive: true });

// ───────── Pętla renderowania ─────────

const fps = { frames: 0, last: performance.now(), value: 0 };

function renderFrame(time, frame) {
  fps.frames += 1;
  const now = performance.now();
  if (now - fps.last >= 1000) {
    fps.value = Math.round((fps.frames * 1000) / (now - fps.last));
    fps.frames = 0;
    fps.last = now;
    if (debug) {
      const text = debugText();
      if (renderer.xr.isPresenting) ui.debug.textContent = text;
      else if (!ui.debugPage.hidden) ui.debugPage.textContent = text;
    }
  }

  if (renderer.xr.isPresenting && frame) {
    const dt = ar.lastFrameTime ? Math.min(0.1, Math.max(0, (time - ar.lastFrameTime) / 1000)) : 0;
    ar.lastFrameTime = time;
    const refSpace = renderer.xr.getReferenceSpace();

    // Celownik pokazujemy i aktualizujemy tylko, gdy jest aktywny.
    const wasVisible = ar.reticle.visible;
    if (state.reticleActive && ar.hitTestSource) {
      const hits = frame.getHitTestResults(ar.hitTestSource);
      const pose = hits.length > 0 ? hits[0].getPose(refSpace) : null;
      ar.reticle.visible = Boolean(pose);
      if (pose) ar.reticle.matrix.fromArray(pose.transform.matrix);
    } else {
      ar.reticle.visible = false;
    }
    if (wasVisible !== ar.reticle.visible) updateArHint();

    if (hold.dir && state.placed && dt > 0) {
      const delta = hold.dir * ROTATE_SPEED_RAD_S * dt;
      hold.rotated += delta;
      rotateBy(delta);
    }

    if (ar.estimating && state.model) {
      // Światło rzucające cień przejmuje kierunek, barwę i natężenie oszacowane z otoczenia.
      const est = ar.xrLight.directionalLight;
      ar.light.color.copy(est.color);
      ar.light.intensity = est.intensity;
      if (est.position.lengthSq() > 0) {
        ar.light.userData.direction = est.position.clone().normalize();
        if (ar.light.userData.direction.y < 0.2) ar.light.userData.direction.y = 0.2;
        fitShadow(ar.light, ar.anchor, state.model.footprint * currentArScale());
      }
    }
    renderer.render(ar.scene, ar.camera);
  } else {
    ar.lastFrameTime = 0;
    preview.controls.update();
    renderer.render(preview.scene, preview.camera);
  }
}

function debugText() {
  const info = renderer.info.render;
  const m = state.model;
  return [
    `Wersja: viewer.js v${VIEWER_VERSION}, index.html v${PAGE_VERSION}`,
    `FPS: ${fps.value}`,
    `Wywołania rysowania: ${info.calls}`,
    `Trójkąty (kadr): ${info.triangles}`,
    m ? `Trójkąty modelu: ${m.triangles}` : '',
    m ? `Wczytanie: ${m.loadMs} ms, ${(m.bytes / 1048576).toFixed(2)} MB` : '',
    m ? `Rozmiar modelu: ${m.size.x.toFixed(2)} × ${m.size.y.toFixed(2)} × ${m.size.z.toFixed(2)}` : '',
    `Skala AR: ${currentArScale().toFixed(4)} (${state.mode})`,
    `WebXR: ${state.xr.reason}; Android: ${isAndroid ? 'tak' : 'nie'}; WebView: ${isAndroidWebView ? 'tak' : 'nie'}; Chrome: ${isGoogleChrome ? 'tak' : 'nie'}`,
    `Celownik: ${state.reticleActive ? 'aktywny' : 'ukryty'}${ar.reticle && ar.reticle.visible ? ', widoczny' : ''}`,
    `Szacowanie światła: ${ar.estimating ? 'tak' : 'nie'}`,
  ].filter(Boolean).join('\n');
}

main().catch((e) => {
  console.error(e);
  setStatus(T('siteError'));
});
