import { describe, expect, test } from 'vitest';
import { createGlider, stepGlider, MIN_CLEARANCE } from '../src/flight/glider.js';

const DEG = Math.PI / 180;
const flat = (h) => () => h;
const run = (g, input, seconds, heightAt, dt = 1 / 60, onStep = () => {}) => {
  for (let t = 0; t < seconds; t += dt) { stepGlider(g, input, dt, heightAt); onStep(g); }
  return g;
};

describe('planeur', () => {
  test('valeurs initiales', () => {
    const g = createGlider({ x: 1, y: 3000, z: 2, heading: 0.5 });
    expect(g).toMatchObject({ x: 1, y: 3000, z: 2, heading: 0.5, pitch: 0, bank: 0 });
  });

  test('sans action : retour à plat, sans perte d’altitude', () => {
    const g = createGlider({ x: 0, y: 3000, z: 0, heading: 0 });
    g.bank = 25 * DEG;
    g.pitch = -8 * DEG;
    let minY = Infinity;
    run(g, { roll: 0, pitch: 0 }, 10, flat(1000));
    expect(Math.abs(g.bank)).toBeLessThan(0.5 * DEG);
    expect(Math.abs(g.pitch)).toBeLessThan(0.5 * DEG);
    const y10 = g.y;
    run(g, { roll: 0, pitch: 0 }, 5, flat(1000), 1 / 60, (s) => { minY = Math.min(minY, s.y); });
    expect(g.y).toBeGreaterThanOrEqual(y10 - 0.5);
  });

  test('cap 0 = nord (z négatif)', () => {
    const g = run(createGlider({ x: 0, y: 3000, z: 0, heading: 0 }), { roll: 0, pitch: 0 }, 10, flat(0));
    expect(g.z).toBeCloseTo(-g.speed * 10, 0);
    expect(Math.abs(g.x)).toBeLessThan(1e-6);
  });

  test('vers une montagne de 4 000 m à 2 km : jamais à moins de 40 m du sol, puis au-dessus', () => {
    // Cône de 4 000 m centré 2 km au nord, base à 2 000 m sur 3 km de rayon.
    const peak = { x: 0, z: -2000 };
    const heightAt = (x, z) => 2000 + 2000 * Math.max(0, 1 - Math.hypot(x - peak.x, z - peak.z) / 3000);
    const g = createGlider({ x: 0, y: 3000, z: 0, heading: 0 });
    let minClear = Infinity;
    run(g, { roll: 0, pitch: 0 }, 120, heightAt, 1 / 60, (s) => { minClear = Math.min(minClear, s.y - heightAt(s.x, s.z)); });
    expect(MIN_CLEARANCE).toBe(40);
    expect(minClear).toBeGreaterThanOrEqual(40 - 1e-6);
    expect(g.z).toBeLessThan(peak.z); // il est passé
    expect(g.y).toBeGreaterThan(4000);
  });

  test('dt = 30 (onglet repris) : comme dt = 0,1', () => {
    const a = createGlider({ x: 0, y: 3000, z: 0, heading: 1 });
    const b = createGlider({ x: 0, y: 3000, z: 0, heading: 1 });
    stepGlider(a, { roll: 0.5, pitch: 0.2 }, 30, flat(1000));
    stepGlider(b, { roll: 0.5, pitch: 0.2 }, 0.1, flat(1000));
    expect(a).toEqual(b);
  });

  test('dt négatif ou nul : rien ne bouge', () => {
    const g = createGlider({ x: 0, y: 3000, z: 0, heading: 0 });
    stepGlider(g, { roll: 1, pitch: 1 }, 0, flat(0));
    stepGlider(g, { roll: 1, pitch: 1 }, -1, flat(0));
    expect(g).toEqual(createGlider({ x: 0, y: 3000, z: 0, heading: 0 }));
  });

  test('roulis : le planeur tourne, l’inclinaison monte jusqu’à 60° sans la dépasser', () => {
    const g = createGlider({ x: 0, y: 3000, z: 0, heading: 0 });
    let maxBank = 0;
    run(g, { roll: 1, pitch: 0 }, 20, flat(0), 1 / 60, (s) => { maxBank = Math.max(maxBank, s.bank); });
    expect(maxBank).toBeLessThanOrEqual(60 * DEG + 1e-9);
    expect(maxBank).toBeGreaterThan(55 * DEG);
    expect(g.heading).toBeGreaterThan(0);
  });
});

import { ALLURES, setAllure } from '../src/flight/glider.js';

describe('phase 1 bis : commandes douces, vol bas, allures', () => {
  test('roulis progressif : rien de brusque sur 0,3 s, pleine inclinaison en quelques secondes', () => {
    const g = createGlider({ x: 0, y: 3000, z: 0, heading: 0 });
    run(g, { roll: 1, pitch: 0 }, 0.3, flat(0));
    expect(g.bank).toBeLessThan(4 * DEG);
    run(g, { roll: 1, pitch: 0 }, 6, flat(0));
    expect(g.bank).toBeGreaterThan(28 * DEG);
  });

  test('nez en bas au-dessus d’une vallée : descend jusqu’à 40-70 m du sol', () => {
    const g = createGlider({ x: 0, y: 2000, z: 0, heading: 0 });
    let minClear = Infinity;
    run(g, { roll: 0, pitch: -1 }, 300, flat(1000), 1 / 60, (s) => { minClear = Math.min(minClear, s.y - 1000); });
    expect(minClear).toBeGreaterThanOrEqual(40 - 1e-6);
    expect(g.y - 1000).toBeLessThan(70);
  });

  test('allures : 80, 150 et 600 km/h, atteintes en douceur', () => {
    expect(ALLURES.map((a) => a.kmh)).toEqual([80, 150, 600]);
    expect(ALLURES.map((a) => a.name)).toEqual(['Flânerie', 'Promenade', 'Voyage']);
    const g = createGlider({ x: 0, y: 3000, z: 0, heading: 0 });
    expect(g.speed * 3.6).toBeCloseTo(150, 5);
    setAllure(g, 2);
    run(g, { roll: 0, pitch: 0 }, 1, flat(0));
    expect(g.speed * 3.6).toBeLessThan(300);
    run(g, { roll: 0, pitch: 0 }, 15, flat(0));
    expect(g.speed * 3.6).toBeGreaterThan(590);
  });

  test('à 600 km/h vers une montagne : jamais à moins de 40 m du sol', () => {
    const peak = { x: 0, z: -6000 };
    const heightAt = (x, z) => 2000 + 2000 * Math.max(0, 1 - Math.hypot(x - peak.x, z - peak.z) / 3000);
    const g = createGlider({ x: 0, y: 2300, z: 0, heading: 0 });
    setAllure(g, 2);
    g.speed = g.targetSpeed;
    let minClear = Infinity;
    run(g, { roll: 0, pitch: 0 }, 60, heightAt, 1 / 60, (s) => { minClear = Math.min(minClear, s.y - heightAt(s.x, s.z)); });
    expect(minClear).toBeGreaterThanOrEqual(40 - 1e-6);
  });

  test('piqué et cabré francs : jusqu’à 35°, loin du sol', () => {
    const g = createGlider({ x: 0, y: 5000, z: 0, heading: 0 });
    run(g, { roll: 0, pitch: -1 }, 5, flat(0));
    expect(g.pitch).toBeLessThan(-30 * DEG);
    expect(g.pitch).toBeGreaterThanOrEqual(-35 * DEG - 1e-9);
    const h = createGlider({ x: 0, y: 2000, z: 0, heading: 0 });
    run(h, { roll: 0, pitch: 1 }, 5, flat(0));
    expect(h.pitch).toBeGreaterThan(30 * DEG);
  });

  test('piqué à 35° en Voyage : on se rétablit en douceur, sans toucher le plancher de 40 m', () => {
    const g = createGlider({ x: 0, y: 4000, z: 0, heading: 0 });
    setAllure(g, 2);
    g.speed = g.targetSpeed;
    let minClear = Infinity;
    run(g, { roll: 0, pitch: -1 }, 120, flat(1000), 1 / 60, (s) => { minClear = Math.min(minClear, s.y - 1000); });
    expect(minClear).toBeGreaterThan(42); // vol bas visé à 50 m, le plancher dur (40 m) n'est jamais touché
  });
});
