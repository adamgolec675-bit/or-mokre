// histARy – przeglądarka WebAR.
//
// Adres: index.html?id=<id>&lang=pl|en[&debug=1]
//
// Ścieżka renderowania wybierana jest na podstawie wykrytych możliwości urządzenia:
//   • Android + Chrome z ARCore → WebXR "immersive-ar": hit-test, DOM Overlay,
//     szacowanie oświetlenia, cień kontaktowy, jedna instancja modelu (przesuwanie,
//     obrót ciągły przy przytrzymaniu przycisku, skalowanie), tryby „Makieta” i „Skala 1:1”
//     (w trybie 1:1 budowla stawiana jest 5 m przed użytkownikiem, frontem do niego),
//   • iOS → Apple AR Quick Look (.usdz),
//   • pozostałe → interaktywny podgląd 3D (obrót i przybliżanie palcem).
// Podgląd 3D jest wyświetlany zawsze, gdy dostępny jest plik .glb.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { XREstimatedLight } from 'three/addons/webxr/XREstimatedLight.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { exteriorPlacement } from './placement.js';

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
    startAndroid: '🤖 Otwórz w AR (Android)',
    openIOS: '📍 Otwórz w AR (iPhone / iOS)',
    readyAndroid: 'Stuknij brązowy przycisk, aby uruchomić aparat i umieścić model w przestrzeni.',
    readyIOS: 'Stuknij niebieski przycisk, aby wyświetlić model w AR Quick Look.',
    noAr: 'To urządzenie lub przeglądarka nie obsługuje AR. Obejrzyj model w podglądzie 3D powyżej. Na Androidzie otwórz stronę w Chrome.',
    arStartError: 'Nie udało się uruchomić AR. Upewnij się, że zainstalowane są Usługi Google Play dla AR i że przeglądarka ma dostęp do aparatu.',
    modeTabletop: 'Makieta',
    modeReal: 'Skala 1:1',
    modeTabletopDesc: 'Pomniejszony model do postawienia na stole lub podłodze.',
    modeRealDesc: 'Budowla w rzeczywistej wielkości – najlepiej na miejscu, w otwartym terenie.',
    modeRealDescIOS: 'W AR Quick Look skala 1:1 blokuje zmianę rozmiaru modelu.',
    modeTabletopDescIOS: 'W AR Quick Look rozmiar modelu zmienisz, szczypiąc ekran dwoma palcami.',
    arScan: 'Powoli poruszaj telefonem, aby wykryć podłoże.',
    arTap: 'Stuknij ekran, aby postawić model w miejscu celownika.',
    arTapReal: 'Skala 1:1: stuknij ekran – budowla stanie ok. 5 m przed Tobą, frontem w Twoją stronę.',
    arPlaced: 'Stuknij, aby przesunąć model. Przytrzymaj ↺ lub ↻, aby obracać; skaluj przyciskami − + lub dwoma palcami.',
    arPlacedReal: 'Skala 1:1. Stoisz ok. 5 m przed frontem budowli. Stuknij, aby ustawić ją ponownie w kierunku, w którym patrzysz.',
    close: 'Zamknij AR',
    rotateLeft: 'Obróć w lewo',
    rotateRight: 'Obróć w prawo',
    smaller: 'Pomniejsz',
    bigger: 'Powiększ',
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
    startAndroid: '🤖 Open in AR (Android)',
    openIOS: '📍 Open in AR (iPhone / iOS)',
    readyAndroid: 'Tap the brown button to start the camera and place the model in space.',
    readyIOS: 'Tap the blue button to view the model in AR Quick Look.',
    noAr: 'This device or browser does not support AR. Explore the model in the 3D preview above. On Android, open the page in Chrome.',
    arStartError: 'AR could not be started. Make sure Google Play Services for AR is installed and the browser has camera access.',
    modeTabletop: 'Tabletop',
    modeReal: 'Scale 1:1',
    modeTabletopDesc: 'A scaled-down model to place on a table or the floor.',
    modeRealDesc: 'The building at its real size – best on site, in open space.',
    modeRealDescIOS: 'In AR Quick Look, scale 1:1 locks the model size.',
    modeTabletopDescIOS: 'In AR Quick Look, pinch with two fingers to change the model size.',
    arScan: 'Move your phone slowly to detect the ground.',
    arTap: 'Tap the screen to place the model at the reticle.',
    arTapReal: 'Scale 1:1: tap the screen – the building will stand about 5 m in front of you, facing you.',
    arPlaced: 'Tap to move the model. Hold ↺ or ↻ to rotate; scale with the − + buttons or two fingers.',
    arPlacedReal: 'Scale 1:1. You are standing about 5 m in front of the building. Tap to place it again in the direction you are looking.',
    close: 'Close AR',
    rotateLeft: 'Rotate left',
    rotateRight: 'Rotate right',
    smaller: 'Smaller',
    bigger: 'Bigger',
    photo: 'Photo: {credit}',
  },
};

// ───────────────────────── Parametry i elementy strony ─────────────────────────

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
  arToolbar: $('ar-toolbar'),
  arMode: $('ar-mode'),
  debug: $('debug'),
};

const setStatus = (text) => { ui.status.textContent = text; };

const SITE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Ścieżka z pliku JSON → pełny adres; dozwolone https:// i ścieżki względne bez "..". */
function resolveAsset(path) {
  if (typeof path !== 'string' || !path.trim()) return null;
  const p = path.trim();
  if (/^https:\/\//i.test(p)) return p;
  if (/^[a-z][a-z0-9+.-]*:/i.test(p) || p.startsWith('//') || p.split('/').includes('..')) return null;
  return new URL(p.replace(/^\/+/, ''), document.baseURI).href;
}

const pick = (text) => (text && (text[lang] || text.pl)) || '';

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
  model: null,         // wynik prepareModel()
  mode: 'tabletop',    // 'tabletop' | 'real'
  userScale: 1,        // dodatkowa skala makiety ustawiana gestem
  yaw: 0,
  placed: false,
  activeRotationDir: 0,   // -1, 0 lub 1 – obrót ciągły podczas przytrzymania przycisku
  floorY: null,           // wysokość ostatnio wykrytego podłoża (z hit-testu)
  tabletopPose: null,     // ostatnie położenie makiety – przywracane po wyjściu z trybu 1:1
};

/** Prędkość obrotu przy przytrzymaniu przycisku (rad/s) – niezależna od liczby klatek. */
const ROTATION_SPEED = THREE.MathUtils.degToRad(60);
/** Odległość makiety od kamery, gdy podłoże nie zostało jeszcze wykryte (m). */
const TABLETOP_FALLBACK_DISTANCE_M = 1.5;

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

  const [xrSupported, quickLook] = await Promise.all([detectWebXR(), Promise.resolve(detectQuickLook())]);

  const canWebXR = xrSupported && Boolean(state.ar.glb);
  const canQuickLook = quickLook && Boolean(state.ar.usdz);
  if (canWebXR || canQuickLook) setupModeSwitch(canQuickLook && !canWebXR);
  if (canQuickLook) setupQuickLook();

  if (state.ar.glb) {
    if (!initRenderer()) {
      setStatus(T('noWebGL'));
    } else {
      await loadModel();
    }
  }

  if (canWebXR && state.model) {
    ui.startAr.textContent = T('startAndroid');
    ui.startAr.hidden = false;
    ui.startAr.disabled = false;
    ui.startAr.addEventListener('click', startAR);
    setStatus(T('readyAndroid'));
  } else if (canQuickLook) {
    setStatus(T('readyIOS'));
  } else if (state.model) {
    setStatus(T('noAr'));
  }
}

async function detectWebXR() {
  if (!('xr' in navigator) || !window.isSecureContext) return false;
  try {
    return await navigator.xr.isSessionSupported('immersive-ar');
  } catch (e) {
    return false;
  }
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
  if (previous !== state.mode && renderer?.xr.isPresenting && state.placed) {
    if (state.mode === 'real') enterRealScale();
    else leaveRealScale();
  }
  ui.modeSwitch.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
  ui.arMode.textContent = state.mode === 'real' ? T('modeReal') : T('modeTabletop');
  ui.arToolbar.querySelectorAll('[data-action="smaller"],[data-action="bigger"]').forEach((b) => { b.disabled = state.mode === 'real'; });
  if (state.ar && state.ar.usdz) updateQuickLookHref();
  applyArScale();
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
  scene: null, camera: null, modelPivot: null, scaleGroup: null, light: null, hemi: null,
  reticle: null, hitTestSource: null, xrLight: null, estimating: false, envMap: null,
  gestureActive: false, lastGestureEnd: 0,
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

  // modelPivot: punkt odniesienia modelu (środek podstawy) – pozycja na podłożu i obrót wokół osi Y.
  // scaleGroup: skala makiety lub skala 1:1.
  ar.modelPivot = new THREE.Group();
  ar.modelPivot.visible = false;
  ar.scaleGroup = new THREE.Group();
  ar.modelPivot.add(ar.scaleGroup);
  ar.scene.add(ar.modelPivot);

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
    ui.progress.hidden = true;
    setStatus(T('modelError'));
    return;
  }
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
  fitShadow(ar.light, ar.modelPivot, state.model.footprint * scale);
}

// ───────── Sesja WebXR ─────────

async function startAR() {
  if (!state.model) return;
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
  ar.modelPivot.visible = false;
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
  ar.reticle.visible = false;
  ui.overlay.hidden = true;
  state.placed = false;
  state.floorY = null;
  state.tabletopPose = null;
  stopContinuousRotation();
  requestAnimationFrame(resizePreview);
  setStatus(T('readyAndroid'));
}

function updateArHint() {
  if (!renderer || !renderer.xr.isPresenting) return;
  if (state.placed) {
    ui.arHint.textContent = state.mode === 'real' ? T('arPlacedReal') : T('arPlaced');
  } else if (!ar.reticle.visible) {
    ui.arHint.textContent = T('arScan');
  } else {
    ui.arHint.textContent = state.mode === 'real' ? T('arTapReal') : T('arTap');
  }
}

// ───────── Położenie modelu ─────────

const tmpQuat = new THREE.Quaternion();

/** Pozycja kamery i kierunek patrzenia rzutowany na płaszczyznę poziomą XZ. */
function cameraPoseXZ() {
  const cam = renderer.xr.getCamera();
  const position = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
  tmpQuat.setFromRotationMatrix(cam.matrixWorld);
  const forwardXZ = new THREE.Vector3(0, 0, -1).applyQuaternion(tmpQuat);
  forwardXZ.y = 0;
  // Telefon skierowany pionowo w dół lub w górę – brak kierunku w poziomie.
  if (forwardXZ.lengthSq() < 1e-6) forwardXZ.set(0, 0, -1);
  forwardXZ.normalize();
  return { position, forwardXZ };
}

/** Wysokość podłoża: bieżący hit-test, ostatnio wykryte podłoże albo ok. 1,5 m pod kamerą. */
function currentFloorY() {
  if (ar.reticle.visible) return new THREE.Vector3().setFromMatrixPosition(ar.reticle.matrix).y;
  if (state.floorY !== null) return state.floorY;
  if (state.placed) return ar.modelPivot.position.y;
  return cameraPoseXZ().position.y - 1.5;
}

/** Obraca front modelu (+Z) w stronę punktu, w którym stoi użytkownik. */
function faceTowards(cameraPos) {
  const p = ar.modelPivot.position;
  state.yaw = Math.atan2(cameraPos.x - p.x, cameraPos.z - p.z);
  ar.modelPivot.rotation.y = state.yaw;
}

/**
 * Tryb 1:1 – bezpieczne ustawienie na zewnątrz budowli.
 * Środek podstawy trafia na prostą patrzenia w odległości (połowa największego poziomego
 * wymiaru + 5 m), na wysokości wykrytego podłoża, a fasada frontowa zwraca się do użytkownika.
 * Dzięki temu użytkownik zawsze stoi ok. 5 m przed fasadą, a nie wewnątrz geometrii.
 */
function placeOutsideAtRealScale(floorY) {
  const { position: cameraPos, forwardXZ } = cameraPoseXZ();
  const { position, yaw } = exteriorPlacement({
    cameraPos,
    forward: forwardXZ,
    size: state.model.size,
    scale: currentArScale(),
    floorY,
  });
  ar.modelPivot.position.set(position.x, position.y, position.z);
  state.yaw = yaw;
  ar.modelPivot.rotation.y = yaw;
}

function rememberTabletopPose() {
  state.tabletopPose = { position: ar.modelPivot.position.clone(), yaw: state.yaw };
}

/** Przejście Makieta → 1:1 w trakcie sesji: zapamiętanie makiety i ustawienie budowli na zewnątrz. */
function enterRealScale() {
  rememberTabletopPose();
  applyArScale();
  placeOutsideAtRealScale(currentFloorY());
}

/** Przejście 1:1 → Makieta: powrót makiety w poprzednie miejsce (lub przed użytkownika). */
function leaveRealScale() {
  if (state.tabletopPose) {
    ar.modelPivot.position.copy(state.tabletopPose.position);
    state.yaw = state.tabletopPose.yaw;
    ar.modelPivot.rotation.y = state.yaw;
  } else {
    const { position: cameraPos, forwardXZ } = cameraPoseXZ();
    if (ar.reticle.visible) {
      ar.modelPivot.position.setFromMatrixPosition(ar.reticle.matrix);
    } else {
      ar.modelPivot.position.copy(cameraPos).addScaledVector(forwardXZ, TABLETOP_FALLBACK_DISTANCE_M);
      ar.modelPivot.position.y = currentFloorY();
    }
    faceTowards(cameraPos);
  }
  applyArScale();
}

/** Stuknięcie ekranu (zdarzenie select WebXR): postawienie lub przesunięcie jedynej instancji modelu. */
function onSelect() {
  if (ar.gestureActive || performance.now() - ar.lastGestureEnd < 350) return;
  const firstPlacement = !state.placed;

  if (state.mode === 'real') {
    // W trybie 1:1 potrzebna jest tylko wysokość podłoża – położenie wynika z kierunku patrzenia.
    if (!ar.reticle.visible && state.floorY === null) return;
    applyArScale();
    placeOutsideAtRealScale(currentFloorY());
  } else {
    if (!ar.reticle.visible) return;
    ar.modelPivot.position.setFromMatrixPosition(ar.reticle.matrix);
    // Przy pierwszym postawieniu front modelu (+Z) zwracamy w stronę użytkownika.
    if (firstPlacement) faceTowards(cameraPoseXZ().position);
    applyArScale();
    rememberTabletopPose();
  }

  if (firstPlacement) {
    state.placed = true;
    ar.modelPivot.visible = true;
    ui.arToolbar.hidden = false;
  }
  updateArHint();
}

/** Obrót o stały krok – obsługa klawiatury i czytników ekranu. */
function rotateBy(rad) {
  state.yaw += rad;
  ar.modelPivot.rotation.y = state.yaw;
  if (state.mode !== 'real') rememberTabletopPose();
}

function scaleBy(factor) {
  if (state.mode === 'real') return;
  state.userScale = THREE.MathUtils.clamp(state.userScale * factor, 0.25, 4);
  applyArScale();
}

// Przyciski nakładki – beforexrselect zapobiega jednoczesnemu przesunięciu modelu.
ui.overlay.addEventListener('beforexrselect', (e) => {
  if (e.target.closest('button')) e.preventDefault();
});
ui.arClose.addEventListener('click', () => renderer?.xr.getSession()?.end());
ui.arClose.setAttribute('aria-label', T('close'));
ui.arToolbar.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  switch (btn.dataset.action) {
    case 'smaller': scaleBy(1 / 1.15); break;
    case 'bigger': scaleBy(1.15); break;
    case 'mode': setMode(state.mode === 'real' ? 'tabletop' : 'real'); break;
    default: break;
  }
});
ui.arToolbar.querySelector('[data-rotate="1"]').setAttribute('aria-label', T('rotateLeft'));
ui.arToolbar.querySelector('[data-rotate="-1"]').setAttribute('aria-label', T('rotateRight'));

// Obrót ciągły: przytrzymanie ↺ / ↻ ustawia kierunek, a pętla renderowania obraca model
// z prędkością ROTATION_SPEED niezależnie od liczby klatek na sekundę.
function stopContinuousRotation() {
  state.activeRotationDir = 0;
  ui.arToolbar.querySelectorAll('[data-rotate]').forEach((b) => b.classList.remove('is-held'));
  if (state.placed && state.mode !== 'real') rememberTabletopPose();
}

ui.arToolbar.querySelectorAll('[data-rotate]').forEach((btn) => {
  const dir = Number(btn.dataset.rotate);
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    state.activeRotationDir = dir;
    btn.classList.add('is-held');
  });
  const release = () => {
    if (state.activeRotationDir === dir) stopContinuousRotation();
    btn.classList.remove('is-held');
  };
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointerleave', release);
  btn.addEventListener('pointercancel', release);
  // Klawiatura / czytnik ekranu (kliknięcie bez wskaźnika): obrót o 15°.
  btn.addEventListener('click', (e) => {
    if (e.detail === 0) rotateBy(dir * THREE.MathUtils.degToRad(15));
  });
});

// Przytrzymanie przycisku nie może otwierać menu kontekstowego ani zaznaczać tekstu.
ui.overlay.addEventListener('contextmenu', (e) => e.preventDefault());
ui.overlay.addEventListener('selectstart', (e) => e.preventDefault());
window.addEventListener('blur', stopContinuousRotation);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopContinuousRotation();
});
ui.arToolbar.querySelector('[data-action="smaller"]').setAttribute('aria-label', T('smaller'));
ui.arToolbar.querySelector('[data-action="bigger"]').setAttribute('aria-label', T('bigger'));

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
  ar.modelPivot.rotation.y = state.yaw;
}, { passive: true });
const endGesture = (e) => {
  if (ar.gestureActive && e.touches.length < 2) {
    ar.gestureActive = false;
    ar.lastGestureEnd = performance.now();
    if (state.mode !== 'real') rememberTabletopPose();
  }
};
ui.overlay.addEventListener('touchend', endGesture, { passive: true });
ui.overlay.addEventListener('touchcancel', endGesture, { passive: true });

// ───────── Pętla renderowania ─────────

const fps = { frames: 0, last: performance.now(), value: 0 };
let lastFrameTime = null;

function renderFrame(time, frame) {
  // Czas od poprzedniej klatki (s), ograniczony do 0,1 s po przerwach (np. zmiana karty).
  const deltaTime = lastFrameTime === null ? 0 : Math.min(0.1, Math.max(0, (time - lastFrameTime) / 1000));
  lastFrameTime = time;

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
    const refSpace = renderer.xr.getReferenceSpace();
    if (ar.hitTestSource) {
      const hits = frame.getHitTestResults(ar.hitTestSource);
      const wasVisible = ar.reticle.visible;
      if (hits.length > 0) {
        const pose = hits[0].getPose(refSpace);
        ar.reticle.visible = Boolean(pose);
        if (pose) {
          ar.reticle.matrix.fromArray(pose.transform.matrix);
          state.floorY = pose.transform.position.y;
        }
      } else {
        ar.reticle.visible = false;
      }
      if (wasVisible !== ar.reticle.visible && !state.placed) updateArHint();
    }

    if (state.activeRotationDir !== 0 && state.placed) {
      ar.modelPivot.rotation.y += state.activeRotationDir * ROTATION_SPEED * deltaTime;
      state.yaw = ar.modelPivot.rotation.y;
    }

    if (ar.estimating && state.model) {
      // Światło rzucające cień przejmuje kierunek, barwę i natężenie oszacowane z otoczenia.
      const est = ar.xrLight.directionalLight;
      ar.light.color.copy(est.color);
      ar.light.intensity = est.intensity;
      if (est.position.lengthSq() > 0) {
        ar.light.userData.direction = est.position.clone().normalize();
        if (ar.light.userData.direction.y < 0.2) ar.light.userData.direction.y = 0.2;
        fitShadow(ar.light, ar.modelPivot, state.model.footprint * currentArScale());
      }
    }
    renderer.render(ar.scene, ar.camera);
  } else {
    preview.controls.update();
    renderer.render(preview.scene, preview.camera);
  }
}

function debugText() {
  const info = renderer.info.render;
  const m = state.model;
  return [
    `FPS: ${fps.value}`,
    `Wywołania rysowania: ${info.calls}`,
    `Trójkąty (kadr): ${info.triangles}`,
    m ? `Trójkąty modelu: ${m.triangles}` : '',
    m ? `Wczytanie: ${m.loadMs} ms, ${(m.bytes / 1048576).toFixed(2)} MB` : '',
    m ? `Rozmiar modelu: ${m.size.x.toFixed(2)} × ${m.size.y.toFixed(2)} × ${m.size.z.toFixed(2)}` : '',
    `Skala AR: ${currentArScale().toFixed(4)} (${state.mode})`,
    `Obrót: ${Math.round(THREE.MathUtils.radToDeg(state.yaw) % 360)}°`,
    `Szacowanie światła: ${ar.estimating ? 'tak' : 'nie'}`,
  ].filter(Boolean).join('\n');
}

main().catch((e) => {
  console.error(e);
  setStatus(T('siteError'));
});
