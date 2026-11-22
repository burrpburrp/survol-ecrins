// Assemblage : entrées → pilote automatique → planeur → carrés → rendu.
import * as THREE from 'three';
import { RequestQueue } from './tiles/queue.js';
import { TileManager, createSource } from './tiles/manager.js';
import { SceneRenderer } from './render/scene.js';
import { sunPosition } from './sun/sun.js';
import { createGlider, stepGlider, setAllure, ALLURES, MAX_DT } from './flight/glider.js';
import { createAutopilot, setTarget, autopilotInput } from './flight/autopilot.js';
import { loadPlaces, nearestPlace } from './ui/places.js';
import { createHud } from './ui/hud.js';
import { createControls, VIEWS } from './ui/controls.js';
import { createPanel } from './ui/panel.js';
import { createDebugPanel } from './ui/debug.js';
import { loadLabels, pickLabels, createLabelLayer } from './ui/labels.js';
import { createMinimap, formatKm } from './ui/minimap.js';

const canvas = document.getElementById('view');
const params = new URLSearchParams(location.search);
// Finesse du maillage : 2 par défaut (mesuré le 22/11/2026 sur carte graphique intégrée Intel :
// 25 images/s en finesse 1, 53 en finesse 2, sans différence visible). ?stride=1 pour la pleine finesse.
const stride = [1, 2, 4, 8, 16].includes(Number(params.get('stride'))) ? Number(params.get('stride')) : 2;
const renderer = new SceneRenderer(canvas, { stride });
const camera = new THREE.PerspectiveCamera(60, 1, 1, 400000);
camera.rotation.order = 'YXZ';
const resize = () => {
  renderer.resize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
};
window.addEventListener('resize', resize);
resize();

// 3 carrés à la fois = 6 requêtes (relief + orthophoto) ; la limite stricte de 6 est dans la source.
const queue = new RequestQueue({ concurrency: 3 });
const source = createSource({ orthoMode: params.get('ortho') === 'wmts' ? 'wmts' : 'wms' });
const tiles = new TileManager({ source, queue });
const debug = params.has('debug') ? createDebugPanel({ source, tiles, queue }) : null;
const heightAt = (x, z) => tiles.heightAt(x, z);
const hud = createHud();
let viewName = 'devant';
const toggles = { labels: false, map: false, immersive: false };
let paused = false;
const pausedEl = document.getElementById('paused');
const helpEl = document.getElementById('help');
const unhideEl = document.getElementById('unhide');
const setPaused = (p) => { paused = p; pausedEl.hidden = !p || !helpEl.hidden; };
const setImmersive = (on) => {
  toggles.immersive = on;
  document.body.classList.toggle('immersive', on);
  unhideEl.hidden = !on;
};
const openHelp = () => { helpEl.hidden = false; setPaused(true); };
const closeHelp = () => { helpEl.hidden = true; setPaused(false); };
document.getElementById('help-btn').addEventListener('click', openHelp);
document.getElementById('help-close').addEventListener('click', closeHelp);
unhideEl.addEventListener('click', () => setImmersive(false));
const controls = createControls({
  onAllure: (d) => setAllure(glider, glider.allure + d),
  onView: (name) => { viewName = name; },
  onToggle: (what) => {
    if (what === 'immersive') setImmersive(!toggles.immersive);
    else toggles[what] = !toggles[what];
  },
  onPause: () => (helpEl.hidden ? setPaused(!paused) : closeHelp()),
});
const ap = createAutopilot();

const places = await loadPlaces('./data/places.json');
const byName = (n) => places.find((p) => p.name === n);
const start = byName('Pré de Madame Carle');
const barre = byName('Barre des Écrins');
const glider = createGlider({ x: start.x + 5500, y: 3500, z: start.z - 1500 });
glider.heading = Math.atan2(barre.x - glider.x, -(barre.z - glider.z));

// Noms des lieux (touche i) : chargés à part, le vol n'en dépend pas.
let labels = [];
loadLabels('./data/labels.json').then((l) => { labels = l; }).catch((e) => console.warn(e));
const labelLayer = createLabelLayer(document.getElementById('labels'));
let shownLabels = [];
let lastLabels = -Infinity;
const minimapCanvas = document.getElementById('minimap');
const minimap = createMinimap(minimapCanvas);
let lastMap = -Infinity;
const vTmp = new THREE.Vector3();
// Position à l'écran d'un point du paysage, ou null s'il est derrière la caméra.
const toScreen = (x, y, z) => {
  vTmp.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
  if (vTmp.z > -1) return null;
  vTmp.applyMatrix4(camera.projectionMatrix);
  return { sx: ((vTmp.x + 1) / 2) * window.innerWidth, sy: ((1 - vTmp.y) / 2) * window.innerHeight };
};

const qGlider = new THREE.Quaternion();
const qView = new THREE.Quaternion();
const eGlider = new THREE.Euler();
const eView = new THREE.Euler();
let flying = false;
let visible = [];
let loading = 0;
let lastTiles = -Infinity;
let last = performance.now();

const panel = createPanel({
  places,
  onGo: (p) => { setTarget(ap, p); hud.flash(`Pilote automatique : cap sur ${p.name}`, last / 1000); },
  onTime: (t) => renderer.setSun(sunPosition(t).dir),
});

// On ne décolle qu'une fois le relief de départ connu (ou au bout de 10 s si l'IGN ne répond pas),
// pour ne jamais partir à travers une montagne pas encore chargée.
const takeoff = document.getElementById('takeoff');
takeoff.disabled = true;
takeoff.textContent = 'Chargement du relief…';
const readyToFly = () => {
  takeoff.disabled = false;
  takeoff.textContent = 'Décoller';
};
takeoff.addEventListener('click', () => {
  document.getElementById('start').hidden = true;
  glider.y = Math.max(glider.y, heightAt(glider.x, glider.z) + 300);
  flying = true;
});

function frame(now) {
  const dt = Math.min((now - last) / 1000, MAX_DT);
  last = now;
  if (takeoff.disabled && (tiles.readyCount > 0 || now > 10000)) readyToFly();
  if (flying && !paused) {
    const manual = controls.input();
    const wasEdge = ap.active && ap.reason === 'bord';
    const input = autopilotInput(ap, glider, { manual, heightAt }) ?? manual;
    if (!wasEdge && ap.active && ap.reason === 'bord') hud.flash('Bord de la carte : retour vers le centre du massif.', now / 1000);
    stepGlider(glider, input, dt, heightAt);
  }
  // Le choix des carrés est recalculé dix fois par seconde.
  if (now - lastTiles > 100) {
    lastTiles = now;
    ({ visible, loading } = tiles.update({ x: glider.x, y: glider.y, z: glider.z }));
  }
  renderer.syncTiles(visible);
  camera.position.set(glider.x, glider.y, glider.z);
  // Orientation du planeur, puis direction du regard choisie (vue latérale, arrière, dessous).
  qGlider.setFromEuler(eGlider.set(glider.pitch, -glider.heading, -glider.bank, 'YXZ'));
  const v = VIEWS[viewName];
  qView.setFromEuler(eView.set(v.pitch, v.yaw, 0, 'YXZ'));
  camera.quaternion.copy(qGlider).multiply(qView);
  camera.updateMatrixWorld();
  if (toggles.labels) {
    if (now - lastLabels > 200) {
      lastLabels = now;
      shownLabels = pickLabels(labels, {
        cam: camera.position, project: toScreen, heightAt, width: window.innerWidth, height: window.innerHeight,
      });
    }
    labelLayer.show(shownLabels, toScreen);
  } else if (shownLabels.length) {
    shownLabels = [];
    labelLayer.hide();
  }
  const dest = ap.active ? ap.target : panel.selected();
  const destDistance = dest ? Math.hypot(dest.x - glider.x, dest.z - glider.z) : 0;
  minimapCanvas.hidden = !toggles.map;
  if (toggles.map && now - lastMap > 100) {
    lastMap = now;
    minimap.draw({ glider, target: dest, distance: destDistance });
  }
  renderer.render(camera);
  hud.update({
    glider, autopilot: ap, loading, now: now / 1000, viewName, allureName: ALLURES[glider.allure].name,
    near: nearestPlace(places, glider.x, glider.z),
    reliefDown: !!tiles.lastError,
    target: dest ? { place: dest, distanceText: formatKm(destDistance) } : null,
  });
  debug?.frame(now, visible.length);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Accès pour les tests et le panneau de mesure.
window.__sim = {
  isPaused: () => paused,
  glider, autopilot: ap, tiles, queue, source, toggles, visibleCount: () => visible.length,
  labelCount: () => labels.length, shownLabels: () => shownLabels.map((l) => l.label.name),
};
