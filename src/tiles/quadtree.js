// Arbre de carrés emboîtés sur le carré racine. iy compte vers le sud, comme z.
import { ROOT } from '../geo/frame.js';

export const SAMPLES = 256; // intervalles par côté ; 257 × 257 échantillons avec la bordure partagée

const key = (level, ix, iy) => `${level}/${ix}/${iy}`;

/** Emprise d'un carré dans le repère local. */
export function tileBounds({ level, ix, iy }) {
  const size = ROOT.size / 2 ** level;
  return { x0: -ROOT.size / 2 + ix * size, z0: -ROOT.size / 2 + iy * size, size };
}

/**
 * Bbox Lambert-93 à demander au WMS. Le WMS renvoie des centres de pixels : on étend
 * le carré d'un demi-échantillon de chaque côté pour que les 257 échantillons tombent
 * exactement sur les bords et soient partagés avec les voisins.
 */
export function tileBboxL93(tile) {
  const { x0, z0, size } = tileBounds(tile);
  const d = size / SAMPLES / 2;
  const xmin = ROOT.cx + x0;
  const ymax = ROOT.cy - z0;
  return [xmin - d, ymax - size - d, xmin + size + d, ymax + d];
}

/**
 * Distance du point de vue au carré : max de l'écart horizontal et de l'écart vertical.
 * L'écart vertical se mesure au relief du carré lui-même quand on le connaît (range = {min, max}) :
 * une paroi à hauteur du planeur est proche même si le fond de vallée est 600 m plus bas.
 * Sinon, à défaut, à la hauteur du planeur au-dessus du sol.
 */
export function tileDistance(tile, cam, range = null) {
  const { x0, z0, size } = tileBounds(tile);
  const dx = Math.max(x0 - cam.x, 0, cam.x - (x0 + size));
  const dz = Math.max(z0 - cam.z, 0, cam.z - (z0 + size));
  const dy = range ? Math.max(0, range.min - cam.y, cam.y - range.max) : Math.abs(cam.y - (cam.ground ?? 0));
  return Math.max(Math.hypot(dx, dz), dy);
}

/** Carrés à afficher : un carré est découpé tant que sa distance au point de vue est < k × côté. */
export function selectTiles(cam, { maxLevel = 9, k = 1.0, heightRange = null } = {}) {
  const out = [];
  const visit = (level, ix, iy) => {
    const t = { level, ix, iy, key: key(level, ix, iy) };
    const size = ROOT.size / 2 ** level;
    if (level < maxLevel && tileDistance(t, cam, heightRange?.(t)) < k * size) {
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) visit(level + 1, ix * 2 + i, iy * 2 + j);
    } else {
      out.push(t);
    }
  };
  visit(0, 0, 0);
  return out;
}
