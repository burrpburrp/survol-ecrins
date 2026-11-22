// Source cartes.gouv.fr (services data.geopf.fr) : relief LiDAR HD avec repli, orthophoto.
import { decodeBil, isMissing } from '../bil.js';
import { getOrthoWmts } from './wmts.js';

const WMS = 'https://data.geopf.fr/wms-r/wms';

/** Chaîne de couches de relief, de la plus fine à la plus sûre. */
export const ELEVATION_LAYERS = [
  { id: 'IGNF_LIDAR-HD_MNS_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93', label: 'MNS' },
  { id: 'IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93', label: 'MNT' },
  { id: 'ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES', label: 'RGE ALTI' },
];
export const ORTHO_LAYER = 'ORTHOIMAGERY.ORTHOPHOTOS';

const isAbort = (e) => e?.name === 'AbortError';

/** Toutes les couches ont répondu, mais sans aucune donnée (hors de France) : inutile de réessayer. */
export class NoDataError extends Error {
  constructor() {
    super('aucune donnée de relief pour ce carré');
    this.name = 'NoDataError';
    this.noRetry = true;
  }
}

function getMapUrl(layer, bbox, w, h, format) {
  const p = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap',
    LAYERS: layer, STYLES: '', CRS: 'EPSG:2154',
    BBOX: bbox.join(','), WIDTH: String(w), HEIGHT: String(h), FORMAT: format,
  });
  return `${WMS}?${p}`;
}

/** Bouche les trous restants (hors de France, par exemple) avec la valeur valide la plus proche. */
function fillRemaining(h, n) {
  let any = -1;
  for (let i = 0; i < h.length; i++) if (!isMissing(h[i])) { any = i; break; }
  if (any < 0) return false;
  // Deux passes par ligne, puis deux passes par colonne : suffisant pour des bandes vides en bord.
  const pass = (start, step, count, stride) => {
    for (let k = 0; k < count; k++) {
      const base = start(k);
      let last = NaN;
      for (let j = 0; j < n; j++) { const i = base + j * stride; if (isMissing(h[i])) { if (!isMissing(last)) h[i] = last; } else last = h[i]; }
      last = NaN;
      for (let j = n - 1; j >= 0; j--) { const i = base + j * stride; if (isMissing(h[i])) { if (!isMissing(last)) h[i] = last; } else last = h[i]; }
    }
  };
  pass((r) => r * n, 1, n, 1);
  pass((c) => c, 1, n, n);
  for (let i = 0; i < h.length; i++) if (isMissing(h[i])) h[i] = h[any];
  return true;
}

export class IgnSource {
  constructor({
    fetch = globalThis.fetch?.bind(globalThis),
    createBitmap = globalThis.createImageBitmap?.bind(globalThis),
    orthoMode = 'wms',
    now = () => performance.now(),
  } = {}) {
    this.fetch = fetch;
    this.createBitmap = createBitmap;
    this.orthoMode = orthoMode;
    this.now = now;
    this.stats = { elevation: { count: 0, totalMs: 0 }, ortho: { count: 0, totalMs: 0 } };
  }

  #record(kind, t0) {
    this.stats[kind].count++;
    this.stats[kind].totalMs += this.now() - t0;
  }

  elevationUrl(layer, bbox, n) {
    return getMapUrl(layer, bbox, n, n, 'image/x-bil;bits=32');
  }

  orthoUrl(bbox, px) {
    return getMapUrl(ORTHO_LAYER, bbox, px, px, 'image/jpeg');
  }

  /** Lit une couche ; rend null si elle ne répond pas correctement (erreur HTTP, XML, mauvaise taille). */
  async #tryLayer(layer, bbox, n, signal) {
    let res;
    try {
      res = await this.fetch(this.elevationUrl(layer, bbox, n), { signal });
    } catch (e) {
      if (isAbort(e) || signal?.aborted) throw e;
      return null;
    }
    if (!res.ok) return null;
    const type = res.headers?.get?.('content-type') || '';
    if (/xml|html|text/i.test(type)) return null;
    return decodeBil(await res.arrayBuffer(), n);
  }

  async getElevation(bbox, n, signal) {
    const t0 = this.now();
    let heights = null;
    let failures = 0;
    const layers = [];
    for (const { id, label } of ELEVATION_LAYERS) {
      const got = await this.#tryLayer(id, bbox, n, signal);
      if (!got) { failures++; continue; }
      let used = false;
      if (!heights) {
        heights = got;
        used = got.some((v) => !isMissing(v));
      } else {
        for (let i = 0; i < heights.length; i++) {
          if (isMissing(heights[i]) && !isMissing(got[i])) { heights[i] = got[i]; used = true; }
        }
      }
      if (used) layers.push(label);
      if (!heights.some(isMissing)) break;
    }
    if (!heights || !fillRemaining(heights, n)) {
      if (heights && failures === 0) throw new NoDataError();
      throw new Error('relief indisponible pour ce carré');
    }
    this.#record('elevation', t0);
    return { heights, layers };
  }

  async getOrtho(bbox, px, signal) {
    const t0 = this.now();
    if (this.orthoMode === 'wmts') {
      const bmp = await getOrthoWmts(bbox, px, signal, this.fetch);
      this.#record('ortho', t0);
      return bmp;
    }
    const res = await this.fetch(this.orthoUrl(bbox, px), { signal });
    const type = res.headers?.get?.('content-type') || '';
    if (!res.ok || !type.startsWith('image/')) throw new Error(`orthophoto indisponible (${res.status})`);
    const bmp = await this.createBitmap(await res.blob());
    this.#record('ortho', t0);
    return bmp;
  }
}
