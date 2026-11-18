// histARy – przeglądarka WebAR (wersja 3).
//
// Adres: index.html?id=<id>&lang=pl|en[&debug=1]
//
// Wersjonowanie: index.html ładuje ten plik jako „./viewer.js?v=3” i ma znacznik
// <meta name="histary-viewer" content="3">. Przy każdej zmianie tego pliku podnieś numer
// w obu miejscach oraz w VIEWER_VERSION – przeglądarki pobiorą wtedy nowy plik zamiast
// kopii z pamięci podręcznej. Z parametrem &debug=1 panel pokazuje obie wersje.
//
// Dolny pasek AR budowany jest w tym pliku (nie w index.html), więc układ nie zależy od
// wersji strony: lewa grupa – obrót (↺ ↻), środek – „Makieta” / „Skala 1:1”,
// prawa grupa – skala (− +). Tak samo budowane są pinezki punktów wiedzy, karta wiedzy,
// linia odniesienia i panel współrzędnych trybu debug (style są w index.html).
//
// Ścieżka renderowania wybierana jest na podstawie wykrytych możliwości urządzenia:
//   • Android + Chrome z ARCore → WebXR "immersive-ar": hit-test, DOM Overlay,
//     szacowanie oświetlenia, cień kontaktowy, jedna instancja modelu (przesuwanie,
//     obrót, skalowanie), tryby „Makieta” i „Skala 1:1”, punkty wiedzy,
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
//     przed użytkownikiem, fasada zwrócona do użytkownika; powrót do „Makiety”
//     przywraca makietę w poprzednie miejsce,
//   • przytrzymanie przycisku obrotu obraca model płynnie (60°/s, niezależnie od FPS).
//
// Punkty wiedzy (od wersji 3):
//   • opcjonalna tablica „hotspots” w pliku zabytku: id, position [x, y, z] w układzie
//     współrzędnych pliku .glb (przed wyśrodkowaniem i skalowaniem), title i description (pl/en),
//   • każdy punkt to Object3D dołączony do korzenia modelu, więc podąża za postawieniem,
//     obrotem, skalą i przełączaniem „Makieta” ↔ „Skala 1:1”,
//   • co klatkę pozycja punktu jest rzutowana kamerą XR na ekran i przesuwa pinezkę
//     w nakładce DOM; pinezki są ukryte przed postawieniem modelu i gdy punkt jest za kamerą,
//     a punkty leżące po drugiej stronie budowli są przygaszone,
//   • stuknięcie pinezki otwiera / zamyka kartę wiedzy – bez budzenia celownika i bez
//     przesuwania modelu (pinezki to przyciski: „beforexrselect” + blokada HUD),
//   • karta stoi w pasie między górnym komunikatem a dolnym paskiem, po przeciwnej stronie
//     niż pinezka; linia SVG łączy kartę z bieżącym położeniem pinezki,
//   • &debug=1: stuknięcie modelu (w AR i w podglądzie 3D) pokazuje współrzędne trafionego
//     punktu w układzie pliku .glb z przyciskiem „Kopiuj”; pinezki mają wtedy podpisy z id,
//     a w podglądzie 3D też są widoczne – do strojenia pozycji w pliku JSON.

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
    hotspotsGroup: 'Punkty wiedzy',
    hotspotPin: 'Punkt wiedzy {n}: {title}',
    hotspotClose: 'Zamknij opis',
    debugPickHint: 'Debug: stuknij model, aby odczytać współrzędne punktu w układzie pliku GLB.',
    debugPickMiss: 'Debug: nie trafiono w model.',
    debugCopy: 'Kopiuj',
    debugCopied: 'Skopiowano ✓',
    debugCopyFailed: 'Błąd – zob. konsola',
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
    hotspotsGroup: 'Knowledge points',
    hotspotPin: 'Knowledge point {n}: {title}',
    hotspotClose: 'Close description',
    debugPickHint: 'Debug: tap the model to read point coordinates in GLB model space.',
    debugPickMiss: 'Debug: the model was not hit.',
    debugCopy: 'Copy',
    debugCopied: 'Copied ✓',
    debugCopyFailed: 'Failed – see console',
  },
};

// ───────────────────────── Parametry i elementy strony ─────────────────────────

const VIEWER_VERSION = '3';
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
// Elementy nakładki, których dotknięcie nigdy nie stawia ani nie budzi celownika
// (pinezki punktów wiedzy są przyciskami, więc też się tu łapią).
const HUD_SELECTOR = 'button, .ar-toolbar, .hs-card, .hs-pick';

// ───────────────────────── Stałe punktów wiedzy ─────────────────────────

const MAX_HOTSPOTS = 32;                   // górny limit punktów w jednym pliku zabytku
const PIN_TAP_MAX_MOVE_PX = 14;            // większy ruch palca na pinezce = nie stuknięcie
const PIN_EDGE_MARGIN_PX = 24;             // pinezka dalej poza ekranem jest ukrywana
const FAR_SIDE_DOT = -0.15;                // próg „punkt po drugiej stronie budowli” (cos kąta)
const FAR_SIDE_MIN_OFFSET = 0.1;           // ułamek szerokości modelu – bliżej osi nie przygaszamy
const CARD_MARGIN_PX = 10;                 // odstęp karty od górnego komunikatu i dolnego paska
const CARD_FLIP_LOW = 0.42;                // pinezka w górnych 42% pasa → karta na dole
const CARD_FLIP_HIGH = 0.58;               // pinezka w dolnych 42% pasa → karta na górze
const LEADER_INSET_PX = 18;                // linia nie zaczyna się w zaokrąglonym rogu karty
const PICK_DECIMALS = 3;                   // dokładność współrzędnych w trybie debug
const PREVIEW_TAP_MAX_MOVE_PX = 6;         // stuknięcie w podglądzie 3D (a nie obrót)
const PREVIEW_TAP_MAX_MS = 400;
const SVG_NS = 'http://www.w3.org/2000/svg';

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

/** Kąt obrotu wokół osi Y, przy którym front modelu (+X w GLB obrócone na +Z) patrzy z punktu (x, z) na użytkownika. */
function yawFacing(fromX, fromZ, viewerX, viewerZ) {
  return Math.atan2(viewerX - fromX, viewerZ - fromZ) - Math.PI / 2;
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

/**
 * Walidacja tablicy „hotspots” z pliku zabytku. Zwraca tylko poprawne punkty:
 * id zgodne z wzorcem identyfikatora i niepowtarzalne, position = trzy liczby skończone,
 * title.pl niepusty. Niepoprawne wpisy są pomijane (reszta działa dalej).
 */
function parseHotspots(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    if (out.length >= MAX_HOTSPOTS) break;
    const id = item && typeof item.id === 'string' ? item.id.trim() : '';
    const pos = item && item.position;
    const valid = SITE_ID_RE.test(id) && !seen.has(id)
      && Array.isArray(pos) && pos.length === 3
      && pos.every((n) => typeof n === 'number' && Number.isFinite(n))
      && item.title && typeof item.title.pl === 'string' && item.title.pl.trim() !== '';
    if (!valid) {
      console.warn('histARy: pominięto niepoprawny punkt wiedzy', item);
      continue;
    }
    seen.add(id);
    out.push({
      id,
      position: pos.slice(),
      title: item.title,
      description: item.description && typeof item.description === 'object' ? item.description : null,
    });
  }
  return out;
}

/**
 * Rzut punktu z przestrzeni widoku na ekran. view – punkt w układzie kamery (−Z do przodu),
 * projection – macierz rzutowania (Matrix4), out – obiekt {x, y} do wypełnienia.
 * Zwraca false, gdy punkt jest za kamerą (lub bliżej niż near) – wtedy pinezki nie pokazujemy.
 */
function projectViewToScreen(view, projection, near, width, height, out) {
  if (!(view.z < -near)) return false;
  const e = projection.elements;
  const w = e[3] * view.x + e[7] * view.y + e[11] * view.z + e[15];
  const ndcX = (e[0] * view.x + e[4] * view.y + e[8] * view.z + e[12]) / w;
  const ndcY = (e[1] * view.x + e[5] * view.y + e[9] * view.z + e[13]) / w;
  out.x = (ndcX + 1) * 0.5 * width;
  out.y = (1 - ndcY) * 0.5 * height;
  return true;
}

/**
 * Heurystyka „punkt po drugiej stronie budowli” (bez kosztownego raycastu co klatkę):
 * poziomy kierunek od osi modelu do punktu porównany z kierunkiem od punktu do kamery.
 * Punkty bliżej osi niż minOffset (np. kalenica) nigdy nie są przygaszane.
 */
function isFarSide(point, center, viewer, minOffset) {
  const ox = point.x - center.x;
  const oz = point.z - center.z;
  const ol = Math.hypot(ox, oz);
  if (ol < Math.max(minOffset, 1e-6)) return false;
  const vx = viewer.x - point.x;
  const vz = viewer.z - point.z;
  const vl = Math.hypot(vx, vz);
  if (vl < 1e-6) return false;
  return (ox * vx + oz * vz) / (ol * vl) < FAR_SIDE_DOT;
}

/**
 * Położenie karty w pasie [bandTop, bandBottom] względem pinezki – z histerezą, aby karta
 * nie przeskakiwała, gdy pinezka krąży koło środka. 'top' = karta przy górnym komunikacie.
 */
function chooseCardPlacement(pinY, bandTop, bandBottom, current) {
  const height = bandBottom - bandTop;
  if (!(height > 0) || typeof pinY !== 'number' || !Number.isFinite(pinY)) return current || 'top';
  const rel = (pinY - bandTop) / height;
  if (rel < CARD_FLIP_LOW) return 'bottom';
  if (rel > CARD_FLIP_HIGH) return 'top';
  return current || (rel < 0.5 ? 'bottom' : 'top');
}

/**
 * Punkt na krawędzi karty, z którego startuje linia do pinezki (px, py).
 * null – pinezka jest pod kartą, linii nie rysujemy.
 */
function leaderAnchor(rect, px, py, inset = LEADER_INSET_PX) {
  if (px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom) return null;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  if (py > rect.bottom) return { x: clamp(px, rect.left + inset, rect.right - inset), y: rect.bottom };
  if (py < rect.top) return { x: clamp(px, rect.left + inset, rect.right - inset), y: rect.top };
  return { x: px < rect.left ? rect.left : rect.right, y: clamp(py, rect.top + inset, rect.bottom - inset) };
}

/** Współrzędne jako tablica JSON, np. [0.464, 0.167, -0.058] (bez „-0”). */
function formatPoint(v, decimals = PICK_DECIMALS) {
  const f = (n) => {
    const r = Number(Number(n).toFixed(decimals));
    return Object.is(r, -0) ? 0 : r;
  };
  return `[${f(v.x)}, ${f(v.y)}, ${f(v.z)}]`;
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

/**
 * Mierzy model i ustawia jego punkt odniesienia w środku podstawy (y = 0 to podłoże).
 * Prostopadłościan liczony jest z wierzchołków (precise = true). Wersja przybliżona
 * obraca prostopadłościany poszczególnych siatek i dla obróconych elementów (np. dachu)
 * daje wymiary zawyżone nawet o połowę – a od nich zależy skala obu trybów AR.
 * center – środek prostopadłościanu w układzie pliku .glb (przed wyśrodkowaniem).
 */
function prepareModel(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root, true);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));

  let triangles = 0;
  const meshes = [];
  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      meshes.push(obj);
      const g = obj.geometry;
      triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
    }
  });

  const pivot = new THREE.Group();
  pivot.add(root);
  const footprint = Math.max(size.x, size.z) || 1;
  return { pivot, root, meshes, size, center, footprint, triangles: Math.round(triangles) };
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
  hs.list = parseHotspots(site.hotspots);

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
  controller: null,
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
  ar.controller = controller;

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
  hs.previewSize.w = w;
  hs.previewSize.h = h;
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

  // Punkty wiedzy i narzędzia debug – dopiero po sklonowaniu modelu do podglądu,
  // aby każda scena miała własne kotwice.
  setupHotspots(previewModel);

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
  return ((state.ar.tabletopWidth * 0.5) / f) * state.userScale;
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
    // Makieta staje dokładnie na celowniku. Przy pierwszym postawieniu front modelu (+X obrócone na +Z)
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

// ───────── Punkty wiedzy: kotwice 3D i pinezki DOM ─────────

const hs = {
  list: [],                    // wynik parseHotspots()
  ar: null,                    // { anchors, center, meshes, root, marker } – scena AR
  preview: null,               // to samo dla podglądu 3D (tylko &debug=1)
  previewLayer: null,          // pinezki w podglądzie (tylko &debug=1)
  activeId: null,              // otwarta karta wiedzy
  placement: 'top',            // 'top' | 'bottom' – położenie karty w pasie
  band: { top: 0, bottom: 0 }, // wolny pas między górnym komunikatem a dolnym paskiem
  cardRect: null,              // { left, right, top, bottom } – położenie karty (px nakładki)
  overlaySize: { w: 0, h: 0 },
  previewSize: { w: 0, h: 0 },
};

/** Kotwice punktów wiedzy jako dzieci korzenia modelu (układ pliku .glb). */
function attachHotspotAnchors(root, hotspots, center) {
  const anchors = new Map();
  for (const spot of hotspots) {
    const anchor = new THREE.Object3D();
    anchor.name = `hotspot:${spot.id}`;
    anchor.position.fromArray(spot.position);
    root.add(anchor);
    anchors.set(spot.id, anchor);
  }
  const centerAnchor = new THREE.Object3D();
  centerAnchor.name = 'hotspot:center';
  centerAnchor.position.copy(center);
  root.add(centerAnchor);
  return { anchors, center: centerAnchor };
}

/** Znacznik trafionego punktu w trybie debug – widoczny także przez ściany. */
function makePickMarker(footprint) {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(footprint * 0.008, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffd60a, depthTest: false, transparent: true, opacity: 0.95, toneMapped: false })
  );
  marker.name = 'debug:pick';
  marker.renderOrder = 999;
  marker.visible = false;
  marker.raycast = () => {};
  return marker;
}

const _pinWorld = new THREE.Vector3();
const _pinView = new THREE.Vector3();
const _camWorld = new THREE.Vector3();
const _centerWorld = new THREE.Vector3();
const _screen = { x: 0, y: 0 };

/**
 * Warstwa pinezek: jeden element na punkt wiedzy, przesuwany transformacją (bez przeliczania
 * układu strony). interactive = true → przyciski otwierające kartę (AR); false → same
 * znaczniki, przez które przechodzą dotknięcia (podgląd 3D w trybie debug).
 */
class PinLayer {
  constructor(interactive, onToggle) {
    this.interactive = interactive;
    this.onToggle = onToggle || (() => {});
    this.root = document.createElement('div');
    this.root.className = 'hs-layer';
    if (interactive) {
      this.root.setAttribute('role', 'group');
      this.root.setAttribute('aria-label', T('hotspotsGroup'));
    }
    this.pins = [];
  }

  build(hotspots, anchors) {
    this.root.replaceChildren();
    this.pins = hotspots.map((spot, index) => {
      const el = document.createElement(this.interactive ? 'button' : 'div');
      el.className = 'hs-pin';
      el.hidden = true;
      el.dataset.hotspot = spot.id;
      el.style.setProperty('--hs-delay', `${(index * 0.45).toFixed(2)}s`);
      const dot = document.createElement('span');
      dot.className = 'hs-pin-dot';
      dot.textContent = String(index + 1);
      dot.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.className = 'hs-pin-label';
      label.textContent = spot.id;
      label.setAttribute('aria-hidden', 'true');
      el.append(dot, label);
      if (this.interactive) {
        el.type = 'button';
        el.setAttribute('aria-label', T('hotspotPin', { n: index + 1, title: pick(spot.title) }));
        el.setAttribute('aria-expanded', 'false');
        this.bindTap(el, spot.id);
      }
      this.root.append(el);
      return { id: spot.id, index, el, anchor: anchors.get(spot.id), x: NaN, y: NaN, visible: false, far: false };
    });
  }

  /** Stuknięcie pinezki: przechwycenie wskaźnika, więc pinezka „jadąca” pod palcem nadal działa. */
  bindTap(el, id) {
    let press = null;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* brak wsparcia */ }
      press = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    });
    el.addEventListener('pointerup', (e) => {
      if (!press || press.pointerId !== e.pointerId) return;
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
      press = null;
      const now = performance.now();
      if (moved > PIN_TAP_MAX_MOVE_PX || ar.gestureActive || now - ar.lastGestureEnd < GESTURE_COOLDOWN_MS) return;
      this.onToggle(id);
    });
    el.addEventListener('pointercancel', () => { press = null; });
    // Klawiatura (Enter / Spacja): click bez wskaźnika ma detail === 0.
    el.addEventListener('click', (e) => { if (e.detail === 0) this.onToggle(id); });
  }

  get(id) {
    return this.pins.find((p) => p.id === id) || null;
  }

  setActive(id) {
    for (const p of this.pins) {
      const on = p.id === id;
      p.el.classList.toggle('is-active', on);
      if (this.interactive) p.el.setAttribute('aria-expanded', String(on));
    }
  }

  hideAll() {
    for (const p of this.pins) {
      if (p.visible) {
        p.visible = false;
        p.el.hidden = true;
      }
    }
  }

  /**
   * Rzutowanie wszystkich punktów kamerą (macierze z bieżącej klatki – wywoływać po render()).
   * width/height – rozmiar warstwy w px CSS, centerAnchor – oś modelu dla heurystyki
   * „druga strona budowli”, minOffset – w jednostkach świata.
   */
  update(camera, width, height, centerAnchor, minOffset) {
    if (!this.pins.length) return;
    if (!(width > 0) || !(height > 0)) {
      this.hideAll();
      return;
    }
    _camWorld.setFromMatrixPosition(camera.matrixWorld);
    if (centerAnchor) _centerWorld.setFromMatrixPosition(centerAnchor.matrixWorld);
    for (const p of this.pins) {
      if (!p.anchor) continue;
      _pinWorld.setFromMatrixPosition(p.anchor.matrixWorld);
      _pinView.copy(_pinWorld).applyMatrix4(camera.matrixWorldInverse);
      const inFront = projectViewToScreen(_pinView, camera.projectionMatrix, camera.near, width, height, _screen);
      const onScreen = inFront
        && _screen.x >= -PIN_EDGE_MARGIN_PX && _screen.x <= width + PIN_EDGE_MARGIN_PX
        && _screen.y >= -PIN_EDGE_MARGIN_PX && _screen.y <= height + PIN_EDGE_MARGIN_PX;
      if (!onScreen) {
        if (p.visible) {
          p.visible = false;
          p.el.hidden = true;
        }
        continue;
      }
      if (!p.visible) {
        p.visible = true;
        p.el.hidden = false;
      }
      if (!(Math.abs(_screen.x - p.x) < 0.25 && Math.abs(_screen.y - p.y) < 0.25)) {
        p.x = _screen.x;
        p.y = _screen.y;
        p.el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
      }
      const far = centerAnchor ? isFarSide(_pinWorld, _centerWorld, _camWorld, minOffset) : false;
      if (far !== p.far) {
        p.far = far;
        p.el.classList.toggle('is-far', far);
      }
    }
  }
}

/** Panel współrzędnych trybu debug (w nakładce AR albo pod podglądem 3D). */
function createPickPanel(onPage) {
  const root = document.createElement('div');
  root.className = onPage ? 'hs-pick hs-pick--page' : 'hs-pick';
  root.hidden = true;
  const text = document.createElement('div');
  text.className = 'hs-pick-text';
  text.textContent = T('debugPickHint');
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'hs-pick-copy';
  copy.textContent = T('debugCopy');
  copy.disabled = true;
  root.append(text, copy);
  const panel = { root, text, copy, value: null, timer: 0 };
  copy.addEventListener('click', () => copyPick(panel));
  return panel;
}

/**
 * Elementy nakładki AR związane z punktami wiedzy. Kolejność w nakładce (od spodu):
 * linia odniesienia → pinezki → karta → istniejący górny komunikat i dolny pasek → panel debug.
 */
function buildHotspotHud() {
  const layer = new PinLayer(true, toggleHotspot);

  const lines = document.createElementNS(SVG_NS, 'svg');
  lines.setAttribute('class', 'hs-lines');
  lines.setAttribute('aria-hidden', 'true');
  lines.style.display = 'none';
  const mkLine = (cls) => {
    const l = document.createElementNS(SVG_NS, 'line');
    l.setAttribute('class', cls);
    return l;
  };
  const halo = mkLine('hs-line-halo');
  const line = mkLine('hs-line');
  const dot = document.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('class', 'hs-line-dot');
  dot.setAttribute('r', '4');
  lines.append(halo, line, dot);

  const card = document.createElement('section');
  card.className = 'hs-card';
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'false');
  card.setAttribute('aria-labelledby', 'hs-card-title');
  const head = document.createElement('div');
  head.className = 'hs-card-head';
  const num = document.createElement('span');
  num.className = 'hs-card-num';
  num.setAttribute('aria-hidden', 'true');
  const title = document.createElement('h2');
  title.className = 'hs-card-title';
  title.id = 'hs-card-title';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'ar-btn hs-card-close';
  close.textContent = '✕';
  close.setAttribute('aria-label', T('hotspotClose'));
  close.addEventListener('click', closeHotspot);
  head.append(num, title, close);
  const body = document.createElement('div');
  body.className = 'hs-card-body';
  card.append(head, body);

  ui.overlay.prepend(lines, layer.root, card);
  ui.overlay.classList.toggle('is-debug', debug);

  const pickAr = debug ? createPickPanel(false) : null;
  if (pickAr) ui.overlay.append(pickAr.root);

  const ro = new ResizeObserver(() => {
    measureOverlay();
    layoutPick();
    if (hs.activeId) layoutCard();
  });
  ro.observe(ui.overlay);

  return {
    layer, card, num, title, body,
    lines, halo, line, dot, lineShown: false, lineKey: '',
    pickAr, pickPage: null,
    arTop: ui.overlay.querySelector('.ar-top'),
  };
}

/** Kotwice, pinezki i narzędzia debug po wczytaniu modelu. */
function setupHotspots(previewPivot) {
  const m = state.model;
  hs.ar = { ...attachHotspotAnchors(m.root, hs.list, m.center), meshes: m.meshes, root: m.root, marker: null };
  hsHud.layer.build(hs.list, hs.ar.anchors);

  if (!debug) return;
  hs.ar.marker = makePickMarker(m.footprint);
  m.root.add(hs.ar.marker);

  // Podgląd 3D: pivot → korzeń modelu (klon) – ten sam układ współrzędnych pliku .glb.
  const pRoot = previewPivot.children[0];
  const pMeshes = [];
  pRoot.traverse((obj) => { if (obj.isMesh) pMeshes.push(obj); });
  hs.preview = { ...attachHotspotAnchors(pRoot, hs.list, m.center), meshes: pMeshes, root: pRoot, marker: makePickMarker(m.footprint) };
  pRoot.add(hs.preview.marker);

  hs.previewLayer = new PinLayer(false);
  hs.previewLayer.build(hs.list, hs.preview.anchors);
  ui.preview.insertBefore(hs.previewLayer.root, ui.previewHint);
  ui.preview.classList.add('is-debug');

  hsHud.pickPage = createPickPanel(true);
  ui.debugPage.insertAdjacentElement('afterend', hsHud.pickPage.root);
  hsHud.pickPage.root.hidden = false;
  setupPreviewPicking();
}

function measureOverlay() {
  hs.overlaySize.w = ui.overlay.clientWidth || window.innerWidth;
  hs.overlaySize.h = ui.overlay.clientHeight || window.innerHeight;
}

/** Panel debug w AR stoi tuż pod górnym komunikatem (jego wysokość zależy od treści). */
function layoutPick() {
  const panel = hsHud.pickAr;
  if (!panel || panel.root.hidden || ui.overlay.hidden) return;
  const top = hsHud.arTop ? hsHud.arTop.getBoundingClientRect().bottom : 16;
  panel.root.style.top = `${Math.round(top + 8)}px`;
}

// ───────── Karta wiedzy i linia odniesienia ─────────

/** Wolny pas na kartę: pod górnym komunikatem (i panelem debug), nad dolnym paskiem. */
function measureBand() {
  const h = hs.overlaySize.h || window.innerHeight;
  let top = 0;
  if (hsHud.arTop) top = Math.max(top, hsHud.arTop.getBoundingClientRect().bottom);
  if (hsHud.pickAr && !hsHud.pickAr.root.hidden) top = Math.max(top, hsHud.pickAr.root.getBoundingClientRect().bottom);
  let bottom = h - 24;
  if (ui.arToolbar && !ui.arToolbar.hidden) bottom = Math.min(bottom, ui.arToolbar.getBoundingClientRect().top);
  // &debug=1: panel pomiarów (lewy dolny róg) też jest przeszkodą dla karty.
  if (ui.debug && !ui.debug.hidden) bottom = Math.min(bottom, ui.debug.getBoundingClientRect().top);
  return { top: top + CARD_MARGIN_PX, bottom: bottom - CARD_MARGIN_PX };
}

/** Ustawia kartę w pasie (u góry albo u dołu) i zapamiętuje jej prostokąt dla linii. */
function layoutCard() {
  const el = hsHud.card;
  if (!hs.activeId || el.hidden) return;
  hs.band = measureBand();
  const room = Math.max(96, hs.band.bottom - hs.band.top);
  el.style.maxHeight = `${Math.round(room)}px`;
  const height = el.offsetHeight;
  const top = hs.placement === 'top' ? hs.band.top : Math.max(hs.band.top, hs.band.bottom - height);
  el.style.top = `${Math.round(top)}px`;
  hs.cardRect = { left: el.offsetLeft, right: el.offsetLeft + el.offsetWidth, top: Math.round(top), bottom: Math.round(top) + height };
}

function toggleHotspot(id) {
  if (hs.activeId === id) closeHotspot();
  else openHotspot(id);
}

function openHotspot(id) {
  const index = hs.list.findIndex((s) => s.id === id);
  if (index < 0) return;
  const spot = hs.list[index];
  hs.activeId = id;
  hsHud.num.textContent = String(index + 1);
  hsHud.title.textContent = pick(spot.title);
  hsHud.body.textContent = pick(spot.description);
  hsHud.body.hidden = !hsHud.body.textContent;
  hsHud.body.scrollTop = 0;
  hsHud.card.hidden = false;
  hsHud.layer.setActive(id);

  const pin = hsHud.layer.get(id);
  hs.band = measureBand();
  hs.placement = chooseCardPlacement(pin && pin.visible ? pin.y : NaN, hs.band.top, hs.band.bottom, null);
  layoutCard();
  // Wymuszenie układu przed dodaniem klasy – płynne pojawienie się bez requestAnimationFrame
  // (okienne rAF bywa wstrzymane w trakcie sesji immersyjnej).
  void hsHud.card.offsetWidth;
  hsHud.card.classList.add('is-open');
  updateLeader();
}

function closeHotspot() {
  if (!hs.activeId && hsHud.card.hidden) return;
  hs.activeId = null;
  hs.cardRect = null;
  hsHud.card.classList.remove('is-open');
  hsHud.card.hidden = true;
  hsHud.layer.setActive(null);
  hideLeader();
}

function hideLeader() {
  if (!hsHud.lineShown) return;
  hsHud.lineShown = false;
  hsHud.lineKey = '';
  hsHud.lines.style.display = 'none';
}

function showLeader(x1, y1, x2, y2) {
  const key = `${x1.toFixed(1)},${y1.toFixed(1)},${x2.toFixed(1)},${y2.toFixed(1)}`;
  if (key !== hsHud.lineKey) {
    hsHud.lineKey = key;
    for (const l of [hsHud.halo, hsHud.line]) {
      l.setAttribute('x1', x1.toFixed(1));
      l.setAttribute('y1', y1.toFixed(1));
      l.setAttribute('x2', x2.toFixed(1));
      l.setAttribute('y2', y2.toFixed(1));
    }
    hsHud.dot.setAttribute('cx', x1.toFixed(1));
    hsHud.dot.setAttribute('cy', y1.toFixed(1));
  }
  if (!hsHud.lineShown) {
    hsHud.lineShown = true;
    hsHud.lines.style.display = '';
  }
}

/** Co klatkę: linia od krawędzi karty do bieżącego położenia aktywnej pinezki. */
function updateLeader() {
  const pin = hs.activeId ? hsHud.layer.get(hs.activeId) : null;
  if (!pin || !pin.visible || !hs.cardRect) {
    hideLeader();
    return;
  }
  const next = chooseCardPlacement(pin.y, hs.band.top, hs.band.bottom, hs.placement);
  if (next !== hs.placement) {
    hs.placement = next;
    layoutCard();
  }
  const a = leaderAnchor(hs.cardRect, pin.x, pin.y);
  if (!a) {
    hideLeader();
    return;
  }
  showLeader(a.x, a.y, pin.x, pin.y);
}

/** Pinezki w AR – po render(), więc macierze kamery XR i kotwic są z bieżącej klatki. */
function updateArHotspots() {
  if (!hs.ar) return;
  if (!state.placed || !ar.anchor.visible) {
    hsHud.layer.hideAll();
    hideLeader();
    return;
  }
  const cam = renderer.xr.getCamera();
  const minOffset = FAR_SIDE_MIN_OFFSET * state.model.footprint * currentArScale();
  hsHud.layer.update(cam, hs.overlaySize.w, hs.overlaySize.h, hs.ar.center, minOffset);
  updateLeader();
}

/** Pinezki w podglądzie 3D (tylko &debug=1). Podgląd normalizuje model do szerokości 1. */
function updatePreviewHotspots() {
  if (!hs.previewLayer || !hs.preview) return;
  hs.previewLayer.update(preview.camera, hs.previewSize.w, hs.previewSize.h, hs.preview.center, FAR_SIDE_MIN_OFFSET);
}

// ───────── Debug: współrzędne punktu na modelu ─────────

const raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

/** Pierwsze trafienie promienia w siatki modelu → punkt w układzie pliku .glb. */
function pickModelPoint(target) {
  const hits = raycaster.intersectObjects(target.meshes, false);
  if (!hits.length) return null;
  const hit = hits[0];
  const local = target.root.worldToLocal(hit.point.clone());
  return { local, meshName: hit.object.name || '' };
}

function showPick(panel, target, result) {
  if (!panel) return;
  if (!result) {
    panel.text.textContent = T('debugPickMiss');
    return;
  }
  panel.value = formatPoint(result.local);
  panel.text.textContent = `${panel.value}\n${result.meshName || '–'}`;
  panel.copy.disabled = false;
  panel.copy.textContent = T('debugCopy');
  if (target && target.marker) {
    target.marker.position.copy(result.local);
    target.marker.visible = true;
  }
  console.info(`histARy debug: punkt ${panel.value} (${result.meshName || 'bez nazwy'})`);
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* próba awaryjna niżej */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0;user-select:text;-webkit-user-select:text;';
    (ui.overlay.hidden ? document.body : ui.overlay).append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) {
    return false;
  }
}

async function copyPick(panel) {
  if (!panel.value) return;
  const ok = await copyText(panel.value);
  if (!ok) console.info(`histARy debug: skopiuj ręcznie ${panel.value}`);
  panel.copy.textContent = ok ? T('debugCopied') : T('debugCopyFailed');
  clearTimeout(panel.timer);
  panel.timer = setTimeout(() => { panel.copy.textContent = T('debugCopy'); }, 1600);
}

/** Debug w AR: stuknięcie ekranu, którego promień trafia w model. true = zdarzenie obsłużone. */
function debugPickInAr() {
  if (!debug || !hs.ar || !state.placed || !ar.anchor.visible || !ar.controller) return false;
  ar.scene.updateMatrixWorld();
  ar.controller.updateMatrixWorld(true);
  raycaster.setFromXRController(ar.controller);
  const result = pickModelPoint(hs.ar);
  if (!result) return false;
  showPick(hsHud.pickAr, hs.ar, result);
  return true;
}

/** Debug w podglądzie 3D: krótkie stuknięcie (nie obrót) w model. */
function setupPreviewPicking() {
  const el = renderer.domElement;
  let down = null;
  el.addEventListener('pointerdown', (e) => {
    down = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
  });
  el.addEventListener('pointerup', (e) => {
    if (!down || down.pointerId !== e.pointerId) return;
    const d = down;
    down = null;
    if (renderer.xr.isPresenting) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > PREVIEW_TAP_MAX_MOVE_PX || performance.now() - d.t > PREVIEW_TAP_MAX_MS) return;
    const rect = el.getBoundingClientRect();
    _ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    preview.scene.updateMatrixWorld();
    raycaster.setFromCamera(_ndc, preview.camera);
    showPick(hsHud.pickPage, hs.preview, pickModelPoint(hs.preview));
  });
  el.addEventListener('pointercancel', () => { down = null; });
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
  closeHotspot();
  hsHud.layer.hideAll();
  if (hs.ar && hs.ar.marker) hs.ar.marker.visible = false;
  if (hsHud.pickAr) {
    hsHud.pickAr.root.hidden = false;
    hsHud.pickAr.value = null;
    hsHud.pickAr.copy.disabled = true;
    hsHud.pickAr.text.textContent = T('debugPickHint');
  }
  measureOverlay();
  updateArHint();
  layoutPick();

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
  closeHotspot();
  hsHud.layer.hideAll();
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
  if (ui.arHint.textContent !== text) {
    ui.arHint.textContent = text;
    // Wysokość górnego komunikatu mogła się zmienić – panel debug i karta pod nim.
    layoutPick();
    if (hs.activeId) layoutCard();
  }
}

/**
 * Stuknięcie ekranu (zdarzenie „select” WebXR):
 *  A) celownik aktywny i widoczny → postaw / przenieś model, schowaj celownik,
 *  B) model postawiony, celownik ukryty → pierwsze stuknięcie tylko „budzi” celownik,
 *     drugie (już przy aktywnym celowniku) przenosi model jak w przypadku A.
 * Stuknięcia pinezek, karty i paska nie docierają tutaj (beforexrselect + blokada HUD).
 * W trybie &debug=1 stuknięcie, którego promień trafia w model, tylko odczytuje współrzędne.
 */
function onSelect() {
  const now = performance.now();
  if (!state.model) return;
  if (ar.gestureActive || now - ar.lastGestureEnd < GESTURE_COOLDOWN_MS) return;
  if (now - ar.lastHudTouch < HUD_TAP_COOLDOWN_MS) return;
  if (debugPickInAr()) return;

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

const hsHud = buildHotspotHud();

// Dotknięcia przycisków (także pinezek), karty i paska narzędzi nie mogą stawiać ani budzić celownika.
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
    updateArHotspots();
  } else {
    ar.lastFrameTime = 0;
    preview.controls.update();
    renderer.render(preview.scene, preview.camera);
    updatePreviewHotspots();
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
    m ? `Rozmiar modelu: ${m.size.x.toFixed(3)} × ${m.size.y.toFixed(3)} × ${m.size.z.toFixed(3)}` : '',
    `Skala AR: ${currentArScale().toFixed(4)} (${state.mode})`,
    `WebXR: ${state.xr.reason}; Android: ${isAndroid ? 'tak' : 'nie'}; WebView: ${isAndroidWebView ? 'tak' : 'nie'}; Chrome: ${isGoogleChrome ? 'tak' : 'nie'}`,
    `Celownik: ${state.reticleActive ? 'aktywny' : 'ukryty'}${ar.reticle && ar.reticle.visible ? ', widoczny' : ''}`,
    `Szacowanie światła: ${ar.estimating ? 'tak' : 'nie'}`,
    `Punkty wiedzy: ${hs.list.length}${hs.activeId ? ` (otwarty: ${hs.activeId})` : ''}`,
  ].filter(Boolean).join('\n');
}

main().catch((e) => {
  console.error(e);
  setStatus(T('siteError'));
});
