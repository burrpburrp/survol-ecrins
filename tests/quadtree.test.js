import { describe, expect, test } from 'vitest';
import { selectTiles, tileBounds, tileBboxL93, tileDistance } from '../src/tiles/quadtree.js';
import { ROOT } from '../src/geo/frame.js';

const HALF = ROOT.size / 2;
const contains = (t, x, z) => {
  const b = tileBounds(t);
  return x >= b.x0 && x < b.x0 + b.size && z >= b.z0 && z < b.z0 + b.size;
};

describe('quadtree', () => {
  test('tileBounds de la racine', () => {
    expect(tileBounds({ level: 0, ix: 0, iy: 0 })).toEqual({ x0: -HALF, z0: -HALF, size: ROOT.size });
    // iy compte vers le sud, comme z
    expect(tileBounds({ level: 1, ix: 1, iy: 1 })).toEqual({ x0: 0, z0: 0, size: HALF });
  });

  test('tileBboxL93 de la racine, étendue d’un demi-échantillon', () => {
    const d = 131072 / 256 / 2;
    expect(tileBboxL93({ level: 0, ix: 0, iy: 0 })).toEqual([896464 - d, 6373464 - d, 1027536 + d, 6504536 + d]);
  });

  test('tileBboxL93 : le carré nord-ouest de niveau 1 est au nord', () => {
    const [, ymin, , ymax] = tileBboxL93({ level: 1, ix: 0, iy: 0 });
    expect(ymin).toBe(ROOT.cy - HALF / 256 / 2);
    expect(ymax).toBeGreaterThan(ROOT.cy + HALF);
  });

  test('recouvrement exact de la racine, sans chevauchement', () => {
    const tiles = selectTiles({ x: 0, y: 4000, z: 0 });
    const area = tiles.reduce((s, t) => s + tileBounds(t).size ** 2, 0);
    expect(area).toBe(ROOT.size ** 2);
    expect(new Set(tiles.map((t) => t.key)).size).toBe(tiles.length);
    // Échantillonnage : chaque point est dans exactement un carré.
    for (let x = -HALF + 777; x < HALF; x += 9013) {
      for (let z = -HALF + 333; z < HALF; z += 8191) {
        expect(tiles.filter((t) => contains(t, x, z)).length).toBe(1);
      }
    }
  });

  test('caméra à 300 m du sol : niveau 9 sous elle', () => {
    const tiles = selectTiles({ x: 1234, y: 3300, z: -567, ground: 3000 });
    const under = tiles.find((t) => contains(t, 1234, -567));
    expect(under.level).toBe(9);
    expect(Math.max(...tiles.map((t) => t.level))).toBe(9);
  });

  test('à 50 km de la caméra, rien au-delà du niveau 3', () => {
    const cam = { x: -60000, y: 300, z: -60000 }; // dans un coin : il reste des carrés à plus de 50 km
    const far = selectTiles(cam).filter((t) => tileDistance(t, cam) >= 50000);
    expect(far.length).toBeGreaterThan(0);
    expect(Math.max(...far.map((t) => t.level))).toBeLessThanOrEqual(3);
  });

  test('caméra hors de la racine : aucun carré hors de la racine', () => {
    const tiles = selectTiles({ x: 80000, y: 500, z: 0 });
    for (const t of tiles) {
      const b = tileBounds(t);
      expect(b.x0).toBeGreaterThanOrEqual(-HALF);
      expect(b.z0).toBeGreaterThanOrEqual(-HALF);
      expect(b.x0 + b.size).toBeLessThanOrEqual(HALF);
      expect(b.z0 + b.size).toBeLessThanOrEqual(HALF);
    }
  });

  test('clé L/ix/iy', () => {
    const t = selectTiles({ x: 0, y: 1e6, z: 0 });
    expect(t).toEqual([{ level: 0, ix: 0, iy: 0, key: '0/0/0' }]);
  });
});

describe('netteté au premier plan', () => {
  test('falaise à la hauteur du planeur, vallée 600 m plus bas : la falaise est au niveau le plus fin', () => {
    // Planeur à 2 600 m au-dessus d'un glacier à 2 000 m ; une paroi 2 400-3 000 m à 150 m à l'est.
    const cam = { x: 100, y: 2600, z: 100, ground: 2000 };
    const wall = (t) => {
      const { x0, size } = tileBounds(t);
      return x0 + size > 250 ? { min: 2400, max: 3000 } : { min: 1990, max: 2010 };
    };
    const tiles = selectTiles(cam, { heightRange: wall });
    const at = (x, z) => tiles.find((t) => {
      const b = tileBounds(t);
      return x >= b.x0 && x < b.x0 + b.size && z >= b.z0 && z < b.z0 + b.size;
    });
    expect(at(400, 100).level).toBe(9);
  });
});
