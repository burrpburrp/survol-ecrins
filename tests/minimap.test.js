import { describe, expect, test } from 'vitest';
import { mapLayout, planUrl, formatKm } from '../src/ui/minimap.js';
import { toLocal } from '../src/geo/frame.js';

describe('carte IGN', () => {
  test('planUrl demande le Plan IGN en tuiles WMTS', () => {
    const u = new URL(planUrl(11, 1059, 734));
    expect(u.origin + u.pathname).toBe('https://data.geopf.fr/wmts');
    expect(u.searchParams.get('LAYER')).toBe('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2');
    expect(u.searchParams.get('TILEMATRIX')).toBe('11');
    expect(u.searchParams.get('TILECOL')).toBe('1059');
  });

  test('le planeur est au centre et les tuiles couvrent la carte', () => {
    const g = toLocal(44.92, 6.36);
    const m = mapLayout({ glider: g, target: null, z: 11, size: 300 });
    expect(m.glider).toEqual({ sx: 150, sy: 150 });
    const covered = (x, y) => m.tiles.some((t) => x >= t.dx && x < t.dx + 256 && y >= t.dy && y < t.dy + 256);
    for (const [x, y] of [[0, 0], [299, 0], [0, 299], [299, 299], [150, 150]]) expect(covered(x, y)).toBe(true);
  });

  test('une destination au nord est au-dessus ; hors carte, elle est ramenée au bord', () => {
    const g = toLocal(44.92, 6.36);
    const near = mapLayout({ glider: g, target: toLocal(44.95, 6.36), z: 11, size: 300 });
    expect(near.target.sy).toBeLessThan(150);
    expect(Math.abs(near.target.sx - 150)).toBeLessThan(2);
    expect(near.target.inside).toBe(true);
    const far = mapLayout({ glider: g, target: toLocal(45.3, 6.36), z: 11, size: 300 });
    expect(far.target.inside).toBe(false);
    expect(far.target.sy).toBeGreaterThanOrEqual(0);
    expect(far.target.sy).toBeLessThan(30);
  });

  test('formatKm', () => {
    expect(formatKm(12345)).toBe(`${(12.3).toLocaleString('fr-FR')} km`);
    expect(formatKm(450)).toBe('450 m');
  });
});
