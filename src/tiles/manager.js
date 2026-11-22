// Gestionnaire de carrés : choix, chargement poli, cache mémoire, repli sur l'ancêtre prêt.
import { LruCache, cachingFetch, limitFetch } from './cache.js';
import { IgnSource, NoDataError } from './sources/ign.js';
import { selectTiles, tileBounds, tileBboxL93, tileDistance } from './quadtree.js';

export const N = 257;
export const ORTHO_PX = 512;
const MAX_LEVEL = 9;
const ROOT_KEY = '0/0/0';

const parse = (key) => { const [level, ix, iy] = key.split('/').map(Number); return { level, ix, iy, key }; };
const parentKey = (t) => `${t.level - 1}/${t.ix >> 1}/${t.iy >> 1}`;

/** Bbox exacte du carré (sans demi-échantillon) : l'image couvre le carré bord à bord. */
function orthoBbox(tile) {
  const b = tileBboxL93(tile);
  const d = tileBounds(tile).size / 256 / 2;
  return [b[0] + d, b[1] + d, b[2] - d, b[3] - d];
}

export class TileManager {
  constructor({ source, queue, maxTiles = 300, onEvict = () => {} }) {
    this.source = source;
    this.queue = queue;
    this.ready = new LruCache(maxTiles, (k, t) => { t.ortho?.close?.(); onEvict(t); });
    this.lastError = null;
    this.noData = new Set(); // carrés sans aucune donnée : jamais redemandés
  }

  get readyCount() { return this.ready.size; }

  // Altitudes mini et maxi d'un carré, d'après lui-même ou son ancêtre prêt le plus proche
  // (plus large, donc prudent : le carré paraît plutôt plus proche).
  #range = (t) => {
    let cur = t;
    for (;;) {
      const r = this.ready.peek(cur.key)?.range;
      if (r) return r;
      if (cur.level === 0) return null;
      cur = parse(parentKey(cur));
    }
  };

  /** Carrés voulus pour ce point de vue : ceux de selectTiles et tous leurs ancêtres. */
  wantedKeys(cam) {
    const keys = new Set();
    for (const t of selectTiles(cam, { maxLevel: MAX_LEVEL, heightRange: this.#range })) {
      let cur = t;
      while (!keys.has(cur.key)) {
        keys.add(cur.key);
        if (cur.level === 0) break;
        cur = parse(parentKey(cur));
      }
    }
    return [...keys];
  }

  update(cam) {
    const view = cam.ground === undefined ? { ...cam, ground: this.heightAt(cam.x, cam.z) } : cam;
    const desired = selectTiles(view, { maxLevel: MAX_LEVEL, heightRange: this.#range });
    const wanted = this.wantedKeys(view);
    // Grossier d'abord (pour boucher vite), puis du plus proche au plus lointain ; la racine en tête.
    const priority = (key) => {
      const t = parse(key);
      return key === ROOT_KEY ? -1 : t.level * 1e6 + Math.min(tileDistance(t, view), 999999);
    };
    const wantedSet = new Set(wanted);
    this.queue.reprioritize((qk) => (wantedSet.has(qk.slice(5)) ? priority(qk.slice(5)) : null));
    for (const k of wanted) this.ready.get(k); // les carrés voulus restent les plus récents du cache
    const missing = wanted
      .filter((k) => !this.ready.has(k) && !this.noData.has(k) && !this.queue.entries.has(`tile:${k}`))
      .map((k) => [k, priority(k)]);
    missing.sort((a, b) => a[1] - b[1]); // la file démarre dès l'ajout : on ajoute dans l'ordre
    for (const [key, p] of missing) this.#load(parse(key), p);

    // Visible : chaque carré voulu, ou à défaut son ancêtre prêt le plus proche ; sans chevauchement.
    const chosen = new Map();
    for (const t of desired) {
      let k = t.key;
      let cur = t;
      while (!this.ready.has(k) && cur.level > 0) { cur = parse(parentKey(cur)); k = cur.key; }
      if (this.ready.has(k)) chosen.set(k, cur);
    }
    const visible = [];
    for (const [k, t] of chosen) {
      let cur = t;
      let covered = false;
      while (cur.level > 0) { cur = parse(parentKey(cur)); if (chosen.has(cur.key)) { covered = true; break; } }
      if (!covered) visible.push(this.ready.get(k));
    }
    let loading = 0;
    for (const k of this.queue.entries.keys()) if (k.startsWith('tile:')) loading++;
    return { visible, loading };
  }

  #load(tile, priority) {
    const job = async (signal) => {
      const [elev, ortho] = await Promise.all([
        this.source.getElevation(tileBboxL93(tile), N, signal),
        this.source.getOrtho(orthoBbox(tile), ORTHO_PX, signal),
      ]);
      return { key: tile.key, level: tile.level, bounds: tileBounds(tile), heights: elev.heights, layers: elev.layers, ortho };
    };
    this.queue.push(`tile:${tile.key}`, priority, job).then(
      (data) => {
        this.lastError = null;
        let min = Infinity;
        let max = -Infinity;
        for (const h of data.heights) { if (h < min) min = h; if (h > max) max = h; }
        data.range = { min, max };
        this.ready.set(data.key, data);
      },
      (e) => {
        if (e?.name === 'NoDataError') this.noData.add(tile.key);
        else if (e?.name !== 'AbortError') this.lastError = e;
      },
    );
  }

  /** Altitude au point (x, z) depuis le carré prêt le plus fin, en interpolation bilinéaire. */
  heightAt(x, z) {
    for (let level = MAX_LEVEL; level >= 0; level--) {
      const size = 131072 / 2 ** level;
      const ix = Math.floor((x + 65536) / size);
      const iy = Math.floor((z + 65536) / size);
      if (ix < 0 || iy < 0 || ix >= 2 ** level || iy >= 2 ** level) return 0;
      const t = this.ready.peek(`${level}/${ix}/${iy}`);
      if (!t) continue;
      const step = size / (N - 1);
      const fx = (x - t.bounds.x0) / step;
      const fz = (z - t.bounds.z0) / step;
      const i = Math.min(Math.floor(fx), N - 2);
      const j = Math.min(Math.floor(fz), N - 2);
      const u = fx - i;
      const v = fz - j;
      const h = t.heights;
      const a = h[j * N + i], b = h[j * N + i + 1], c = h[(j + 1) * N + i], d = h[(j + 1) * N + i + 1];
      return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    }
    return 0;
  }
}

/** Source passant par un Web Worker ; même interface que IgnSource. */
export class WorkerSource {
  constructor({ orthoMode = 'wms', createWorker = () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }) } = {}) {
    this.orthoMode = orthoMode;
    this.stats = { elevation: { count: 0, totalMs: 0 }, ortho: { count: 0, totalMs: 0 } };
    this.worker = createWorker();
    this.worker.postMessage({ id: 0, kind: 'config', orthoMode });
    this.pending = new Map();
    this.nextId = 1;
    this.worker.onmessage = ({ data }) => {
      const p = this.pending.get(data.id);
      if (!p) return;
      this.pending.delete(data.id);
      if (data.ok) p.resolve(data.value);
      else if (data.name === 'AbortError') p.reject(new DOMException(data.message, 'AbortError'));
      else if (data.name === 'NoDataError') p.reject(new NoDataError());
      else p.reject(new Error(data.message));
    };
    // Worker planté ou introuvable : tout ce qui attend échoue (la file réessaiera), rien ne reste bloqué.
    this.worker.onerror = () => {
      for (const p of this.pending.values()) p.reject(new Error('le worker de chargement s’est arrêté'));
      this.pending.clear();
    };
  }
  #call(msg, signal) {
    const id = this.nextId++;
    const t0 = performance.now();
    const stat = this.stats[msg.kind === 'elevation' ? 'elevation' : 'ortho'];
    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve: (v) => { stat.count++; stat.totalMs += performance.now() - t0; resolve(v); },
        reject,
      });
      signal?.addEventListener('abort', () => this.worker.postMessage({ id, kind: 'abort' }), { once: true });
      this.worker.postMessage({ id, ...msg });
    });
  }
  getElevation(bbox, n, signal) { return this.#call({ kind: 'elevation', bbox, n }, signal); }
  getOrtho(bbox, px, signal) { return this.#call({ kind: 'ortho', bbox, px }, signal); }
}

/** Source par défaut : Web Worker si disponible, sinon fil principal. */
export function createSource({ orthoMode = 'wms' } = {}) {
  if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
    try { return new WorkerSource({ orthoMode }); } catch { /* repli ci-dessous */ }
  }
  return new IgnSource({ fetch: cachingFetch(limitFetch(globalThis.fetch.bind(globalThis), 6)), orthoMode });
}
