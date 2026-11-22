import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadLabels, pickLabels, isVisibleFrom, labelText } from '../src/ui/labels.js';

const json = JSON.parse(readFileSync(new URL('../public/data/labels.json', import.meta.url), 'utf8'));
const fakeFetch = async () => ({ ok: true, json: async () => json });

// Caméra simple regardant vers le nord (−z), écran 1000 × 600, champ ±45°.
const project = (cam) => (x, y, z) => {
  const dx = x - cam.x; const dy = y - cam.y; const dz = -(z - cam.z);
  if (dz <= 0) return null;
  return { sx: 500 + (dx / dz) * 500, sy: 300 - (dy / dz) * 500 };
};
const flat = () => 1000;

describe('noms à l’écran', () => {
  test('le fichier contient sommets, cols, lacs, villages, glaciers et refuges', () => {
    const kinds = new Set(json.labels.map((l) => l[1]));
    for (const k of ['sommet', 'col', 'lac', 'village', 'glacier', 'refuge']) expect(kinds.has(k)).toBe(true);
    expect(json.source).toMatch(/OpenStreetMap/);
  });

  test('loadLabels donne des coordonnées locales et la portée en mètres', async () => {
    const labels = await loadLabels('./data/labels.json', fakeFetch);
    const barre = labels.find((l) => l.name === 'Barre des Écrins');
    expect(barre).toMatchObject({ kind: 'sommet', alt: 4102, reach: 40000 });
    expect(Math.abs(barre.x - 3500)).toBeLessThan(2000); // à l'est de la Meije
  });

  test('labelText : altitude des sommets, cols et refuges', () => {
    expect(labelText({ name: 'La Meije', kind: 'sommet', alt: 3983 })).toEqual(['La Meije', `${(3983).toLocaleString('fr-FR')} m`]);
    expect(labelText({ name: 'La Grave', kind: 'village', alt: null })).toEqual(['La Grave', '']);
  });

  test('un nom caché derrière une montagne n’est pas visible', () => {
    const cam = { x: 0, y: 1500, z: 0 };
    const target = { x: 0, y: 1500, z: -10000 };
    const wall = (x, z) => (z < -4000 && z > -6000 ? 3000 : 1000);
    expect(isVisibleFrom(cam, target, flat)).toBe(true);
    expect(isVisibleFrom(cam, target, wall)).toBe(false);
  });

  test('pickLabels garde ce qui est devant, à portée, et ne se chevauche pas', () => {
    const cam = { x: 0, y: 2000, z: 0 };
    const labels = [
      { name: 'Devant', kind: 'sommet', alt: 2500, x: 0, z: -5000, reach: 15000 },
      { name: 'Collé', kind: 'sommet', alt: 2500, x: 10, z: -5000, reach: 15000 },
      { name: 'Derrière', kind: 'sommet', alt: 2500, x: 0, z: 5000, reach: 15000 },
      { name: 'Trop loin', kind: 'village', alt: null, x: 3000, z: -20000, reach: 5000 },
      { name: 'À droite', kind: 'lac', alt: null, x: 2000, z: -6000, reach: 12000 },
    ];
    const picked = pickLabels(labels, { cam, project: project(cam), heightAt: flat, width: 1000, height: 600 });
    expect(picked.map((p) => p.label.name).sort()).toEqual(['Devant', 'À droite']);
  });

  test('pickLabels limite le nombre de noms', () => {
    const cam = { x: 0, y: 2000, z: 0 };
    const labels = Array.from({ length: 200 }, (_, i) => ({
      name: `S${i}`, kind: 'sommet', alt: 2000, x: (i % 20) * 900 - 9000, z: -3000 - Math.floor(i / 20) * 1500, reach: 40000,
    }));
    const picked = pickLabels(labels, { cam, project: project(cam), heightAt: flat, width: 1000, height: 600, max: 12 });
    expect(picked.length).toBeLessThanOrEqual(12);
    expect(picked.length).toBeGreaterThan(3);
  });
});
