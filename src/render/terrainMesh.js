// Géométrie d'un carré de terrain : grille de hauteurs, normales, UV et jupes sous les bords.
import * as THREE from 'three';

export const SKIRT_DEPTH = 200;
const N = 257;
const sharedIndex = new Map(); // finesse → tableau d'indices commun à tous les carrés

export function buildTileGeometry(tile, stride = 1) {
  const { x0, z0, size } = tile.bounds;
  const h = tile.heights;
  const m = (N - 1) / stride + 1; // sommets par côté
  const step = size / (m - 1);
  const ring = 4 * (m - 1);
  const count = m * m + ring;
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const H = (i, j) => h[Math.min(N - 1, Math.max(0, j * stride)) * N + Math.min(N - 1, Math.max(0, i * stride))];

  for (let j = 0; j < m; j++) {
    for (let i = 0; i < m; i++) {
      const k = j * m + i;
      pos[k * 3] = x0 + i * step;
      pos[k * 3 + 1] = H(i, j);
      pos[k * 3 + 2] = z0 + j * step;
      // Normale par différences centrées (décentrées sur les bords).
      const il = Math.max(i - 1, 0), ir = Math.min(i + 1, m - 1);
      const jt = Math.max(j - 1, 0), jb = Math.min(j + 1, m - 1);
      const dx = (H(ir, j) - H(il, j)) / ((ir - il) * step);
      const dz = (H(i, jb) - H(i, jt)) / ((jb - jt) * step);
      const len = Math.hypot(dx, 1, dz);
      nrm[k * 3] = -dx / len;
      nrm[k * 3 + 1] = 1 / len;
      nrm[k * 3 + 2] = -dz / len;
      // v = 0 au nord : l'image est chargée sans retournement (flipY = false).
      uv[k * 2] = i / (m - 1);
      uv[k * 2 + 1] = j / (m - 1);
    }
  }

  const idx = [];
  const reuse = sharedIndex.get(stride);
  for (let j = 0; !reuse && j < m - 1; j++) {
    for (let i = 0; i < m - 1; i++) {
      const a = j * m + i, b = a + 1, c = a + m, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }

  // Jupes : un anneau de sommets 200 m sous le pourtour, qui masque les fentes entre niveaux.
  const loop = [];
  for (let i = 0; i < m - 1; i++) loop.push(i);
  for (let j = 0; j < m - 1; j++) loop.push(j * m + m - 1);
  for (let i = m - 1; i > 0; i--) loop.push((m - 1) * m + i);
  for (let j = m - 1; j > 0; j--) loop.push(j * m);
  const base = m * m;
  loop.forEach((v, e) => {
    const k = base + e;
    pos[k * 3] = pos[v * 3];
    pos[k * 3 + 1] = pos[v * 3 + 1] - SKIRT_DEPTH;
    pos[k * 3 + 2] = pos[v * 3 + 2];
    nrm.copyWithin(k * 3, v * 3, v * 3 + 3);
    uv[k * 2] = uv[v * 2];
    uv[k * 2 + 1] = uv[v * 2 + 1];
  });
  for (let e = 0; !reuse && e < ring; e++) {
    const a = loop[e], b = loop[(e + 1) % ring], a2 = base + e, b2 = base + ((e + 1) % ring);
    idx.push(a, b, a2, b, b2, a2);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  let index = reuse;
  if (!index) {
    index = new THREE.BufferAttribute(count > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1);
    sharedIndex.set(stride, index);
  }
  g.setIndex(index);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  g.userData.skirtSource = loop;
  return g;
}
