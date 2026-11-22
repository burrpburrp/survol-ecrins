import { describe, expect, test } from 'vitest';
import { buildTileGeometry, SKIRT_DEPTH } from '../src/render/terrainMesh.js';

const N = 257;
function tile() {
  const heights = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) heights[j * N + i] = 1000 + i * 2 + j;
  return { key: '9/0/0', level: 9, bounds: { x0: -65536, z0: -65536, size: 256 }, heights, ortho: null };
}

describe('buildTileGeometry', () => {
  const g = buildTileGeometry(tile());
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');

  test('257² + 4 × 256 sommets', () => {
    expect(pos.count).toBe(N * N + 4 * 256);
    expect(g.getAttribute('normal').count).toBe(pos.count);
  });

  test('premier sommet au coin nord-ouest', () => {
    expect([pos.getX(0), pos.getY(0), pos.getZ(0)]).toEqual([-65536, 1000, -65536]);
    // dernier sommet de la grille : coin sud-est
    const k = N * N - 1;
    expect([pos.getX(k), pos.getZ(k)]).toEqual([-65536 + 256, -65536 + 256]);
  });

  test('UV de 0 à 1', () => {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < uv.count; i++) for (const v of [uv.getX(i), uv.getY(i)]) { min = Math.min(min, v); max = Math.max(max, v); }
    expect(min).toBe(0);
    expect(max).toBe(1);
  });

  test('jupes 200 m sous leur sommet de bord', () => {
    expect(SKIRT_DEPTH).toBe(200);
    const skirt = g.userData.skirtSource; // index du sommet de bord pour chaque sommet de jupe
    expect(skirt.length).toBe(4 * 256);
    skirt.forEach((src, e) => {
      const k = N * N + e;
      expect(pos.getX(k)).toBe(pos.getX(src));
      expect(pos.getZ(k)).toBe(pos.getZ(src));
      expect(pos.getY(k)).toBeCloseTo(pos.getY(src) - 200, 3);
    });
  });

  test('normales unitaires et vers le haut', () => {
    const n = g.getAttribute('normal');
    for (const k of [0, 1000, 30000, N * N - 1]) {
      expect(Math.hypot(n.getX(k), n.getY(k), n.getZ(k))).toBeCloseTo(1, 5);
      expect(n.getY(k)).toBeGreaterThan(0);
    }
    // pente vers l'est : la normale penche vers l'ouest
    expect(n.getX(30000)).toBeLessThan(0);
  });

  test('stride 2 : grille 129²', () => {
    expect(buildTileGeometry(tile(), 2).getAttribute('position').count).toBe(129 * 129 + 4 * 128);
  });
});
