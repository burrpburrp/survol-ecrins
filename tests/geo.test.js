import { describe, expect, test } from 'vitest';
import { toL93, fromL93 } from '../src/geo/lambert93.js';
import { toLocal, toLatLon, l93ToLocal, localToL93, ROOT, ZONE, inZone } from '../src/geo/frame.js';

const MEIJE = [45.0055, 6.3082];
const BARRE = [44.9221, 6.3597];

describe('Lambert-93', () => {
  test('Meije conforme à pyproj', () => {
    const [e, n] = toL93(...MEIJE);
    expect(e).toBeCloseTo(960582.252, 2);
    expect(n).toBeCloseTo(6439489.298, 2);
  });
  test('Barre conforme à pyproj', () => {
    const [e, n] = toL93(...BARRE);
    expect(e).toBeCloseTo(965030.405, 2);
    expect(n).toBeCloseTo(6430406.05, 2);
  });
  test('aller-retour à 1e-8° près', () => {
    for (const p of [MEIJE, BARRE]) {
      const [lat, lon] = fromL93(...toL93(...p));
      expect(Math.abs(lat - p[0])).toBeLessThan(1e-8);
      expect(Math.abs(lon - p[1])).toBeLessThan(1e-8);
    }
  });
});

describe('repère local', () => {
  test('Meije en local', () => {
    const { x, z } = toLocal(...MEIJE);
    expect(x).toBeCloseTo(-1417.748, 2);
    expect(z).toBeCloseTo(-489.298, 2);
  });
  test('local ↔ Lambert-93 ↔ lat/lon', () => {
    expect(l93ToLocal(962000, 6439000)).toEqual({ x: 0, z: -0 });
    expect(localToL93(100, -200)).toEqual([962100, 6439200]);
    const { lat, lon } = toLatLon(toLocal(...BARRE).x, toLocal(...BARRE).z);
    expect(lat).toBeCloseTo(BARRE[0], 8);
    expect(lon).toBeCloseTo(BARRE[1], 8);
  });
  test('constantes', () => {
    expect(ROOT).toEqual({ cx: 962000, cy: 6439000, size: 131072 });
    expect(ZONE).toEqual({ latMin: 44.6, latMax: 45.4, lonMin: 5.8, lonMax: 6.85 });
  });
  test('inZone', () => {
    const out = toLocal(45.5, 6.3);
    expect(inZone(out.x, out.z)).toBe(false);
    const meije = toLocal(...MEIJE);
    expect(inZone(meije.x, meije.z)).toBe(true);
  });
});
