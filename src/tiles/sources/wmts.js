// Orthophoto par tuiles WMTS (grille PM, Web Mercator), recalée dans la grille Lambert-93 du carré.
import { fromL93 } from '../../geo/lambert93.js';

const WMTS = 'https://data.geopf.fr/wmts';
const TILE = 256;
const GRID = 16; // le recalage est calculé exactement sur une grille 17 × 17, puis interpolé

/** Position en pixels globaux Web Mercator au niveau z (tuiles de 256 px). */
export function mercatorPixel(lat, lon, z) {
  const n = TILE * 2 ** z;
  const phi = (lat * Math.PI) / 180;
  return [((lon + 180) / 360) * n, ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * n];
}

export function wmtsUrl(z, col, row) {
  const p = new URLSearchParams({
    SERVICE: 'WMTS', REQUEST: 'GetTile', VERSION: '1.0.0', LAYER: 'ORTHOIMAGERY.ORTHOPHOTOS', STYLE: 'normal',
    TILEMATRIXSET: 'PM', TILEMATRIX: String(z), TILEROW: String(row), TILECOL: String(col), FORMAT: 'image/jpeg',
  });
  return `${WMTS}?${p}`;
}

/**
 * Plan de chargement pour une bbox Lambert-93 rendue sur px × px :
 * niveau WMTS, tuiles à charger, origine de la mosaïque, et map(i, j) → position dans la mosaïque.
 */
export function wmtsPlan(bbox, px) {
  const [xmin, ymin, xmax, ymax] = bbox;
  const [latC] = fromL93((xmin + xmax) / 2, (ymin + ymax) / 2);
  const want = (xmax - xmin) / px; // mètres par pixel voulus
  const z = Math.max(0, Math.min(19, Math.ceil(Math.log2((156543.03392804097 * Math.cos((latC * Math.PI) / 180)) / want))));

  // Grille de recalage exacte.
  const gx = new Float64Array((GRID + 1) ** 2);
  const gy = new Float64Array((GRID + 1) ** 2);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let b = 0; b <= GRID; b++) {
    for (let a = 0; a <= GRID; a++) {
      const E = xmin + (a / GRID) * (xmax - xmin);
      const N = ymax - (b / GRID) * (ymax - ymin);
      const [lat, lon] = fromL93(E, N);
      const [x, y] = mercatorPixel(lat, lon, z);
      const k = b * (GRID + 1) + a;
      gx[k] = x; gy[k] = y;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  const c0 = Math.floor(minX / TILE), c1 = Math.floor(maxX / TILE);
  const r0 = Math.floor(minY / TILE), r1 = Math.floor(maxY / TILE);
  const tiles = [];
  for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) tiles.push({ col, row, url: wmtsUrl(z, col, row), dx: (col - c0) * TILE, dy: (row - r0) * TILE });
  const originX = c0 * TILE;
  const originY = r0 * TILE;

  /** (i, j) en pixels de sortie (0..px, origine en haut à gauche) → pixels de la mosaïque. */
  const map = (i, j) => {
    const u = Math.min(Math.max((i / px) * GRID, 0), GRID - 1e-9);
    const v = Math.min(Math.max((j / px) * GRID, 0), GRID - 1e-9);
    const a = Math.floor(u), b = Math.floor(v), fu = u - a, fv = v - b;
    const k = b * (GRID + 1) + a;
    const lerp2 = (g) => (g[k] * (1 - fu) + g[k + 1] * fu) * (1 - fv) + (g[k + GRID + 1] * (1 - fu) + g[k + GRID + 2] * fu) * fv;
    return [lerp2(gx) - originX, lerp2(gy) - originY];
  };
  return { z, tiles, originX, originY, width: (c1 - c0 + 1) * TILE, height: (r1 - r0 + 1) * TILE, map };
}

/** Charge les tuiles, les assemble et les recale ; rend une ImageBitmap px × px (navigateur seulement). */
export async function getOrthoWmts(bbox, px, signal, fetchFn) {
  const plan = wmtsPlan(bbox, px);
  const mosaic = new OffscreenCanvas(plan.width, plan.height);
  const ctx = mosaic.getContext('2d');
  await Promise.all(plan.tiles.map(async (t) => {
    const res = await fetchFn(t.url, { signal });
    if (!res.ok) throw new Error(`orthophoto WMTS indisponible (${res.status})`);
    const bmp = await createImageBitmap(await res.blob());
    ctx.drawImage(bmp, t.dx, t.dy);
    bmp.close();
  }));
  const src = ctx.getImageData(0, 0, plan.width, plan.height).data;
  const out = new ImageData(px, px);
  const d = out.data;
  for (let j = 0; j < px; j++) {
    for (let i = 0; i < px; i++) {
      const [x, y] = plan.map(i + 0.5, j + 0.5);
      const sx = Math.min(plan.width - 1, Math.max(0, x | 0));
      const sy = Math.min(plan.height - 1, Math.max(0, y | 0));
      const s = (sy * plan.width + sx) * 4;
      const o = (j * px + i) * 4;
      d[o] = src[s]; d[o + 1] = src[s + 1]; d[o + 2] = src[s + 2]; d[o + 3] = 255;
    }
  }
  return createImageBitmap(out);
}
