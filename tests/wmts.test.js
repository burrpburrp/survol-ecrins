import { describe, expect, test } from 'vitest';
import { mercatorPixel, wmtsPlan, wmtsUrl } from '../src/tiles/sources/wmts.js';
import { toL93, fromL93 } from '../src/geo/lambert93.js';

describe('orthophoto WMTS (grille PM)', () => {
  test('mercatorPixel : origine et équateur', () => {
    expect(mercatorPixel(0, 0, 0)).toEqual([128, 128]);
    const [x, y] = mercatorPixel(45.0055, 6.3082, 19);
    // Formule de référence de la projection Web Mercator.
    const n = 256 * 2 ** 19;
    const lat = (45.0055 * Math.PI) / 180;
    expect(x).toBeCloseTo(((6.3082 + 180) / 360) * n, 3);
    expect(y).toBeCloseTo(((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n, 3);
  });

  test('wmtsUrl', () => {
    const u = wmtsUrl(19, 270000, 186000);
    expect(u).toContain('https://data.geopf.fr/wmts?');
    expect(u).toContain('LAYER=ORTHOIMAGERY.ORTHOPHOTOS');
    expect(u).toContain('TILEMATRIXSET=PM');
    expect(u).toContain('TILEMATRIX=19');
    expect(u).toContain('TILEROW=186000');
    expect(u).toContain('TILECOL=270000');
  });

  test('niveau choisi : au moins aussi fin que demandé, plafonné à 19', () => {
    const [e, n] = toL93(45.0055, 6.3082);
    // À 45° N, le niveau 18 donne 0,42 m par pixel et le niveau 19 0,21 m.
    expect(wmtsPlan([e, n, e + 256, n + 256], 512).z).toBe(18); // 0,5 m voulu
    expect(wmtsPlan([e, n, e + 128, n + 128], 512).z).toBe(19); // 0,25 m voulu
    expect(wmtsPlan([e, n, e + 32, n + 32], 512).z).toBe(19); // plus fin que l'IGN : plafonné
    const root = wmtsPlan([896464, 6373464, 1027536, 6504536], 512); // 256 m par pixel
    expect(root.z).toBe(9);
    expect(root.tiles.length).toBeGreaterThanOrEqual(4);
    expect(root.tiles.length).toBeLessThanOrEqual(16);
  });

  test('recalage : chaque pixel de sortie tombe au bon endroit de la mosaïque (à 0,5 px près)', () => {
    const [e, n] = toL93(44.9221, 6.3597);
    const bbox = [e - 512, n - 512, e + 512, n + 512];
    const plan = wmtsPlan(bbox, 512);
    for (const [i, j] of [[0.5, 0.5], [255.5, 255.5], [511.5, 3.5], [100.5, 400.5]]) {
      const E = bbox[0] + (i / 512) * (bbox[2] - bbox[0]);
      const N = bbox[3] - (j / 512) * (bbox[3] - bbox[1]);
      const [lat, lon] = fromL93(E, N);
      const [gx, gy] = mercatorPixel(lat, lon, plan.z);
      const [mx, my] = plan.map(i, j);
      expect(Math.abs(mx - (gx - plan.originX))).toBeLessThan(0.5);
      expect(Math.abs(my - (gy - plan.originY))).toBeLessThan(0.5);
    }
  });
});
