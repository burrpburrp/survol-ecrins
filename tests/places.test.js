import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadPlaces, nearestPlace } from '../src/ui/places.js';
import { toLocal } from '../src/geo/frame.js';

const json = JSON.parse(readFileSync(new URL('../public/data/places.json', import.meta.url), 'utf8'));
const fakeFetch = async (url) => ({ ok: true, json: async () => json, url });

describe('lieux', () => {
  test('le fichier contient la Barre des Écrins à 4 102 m', () => {
    const barre = json.places.find((p) => p.name === 'Barre des Écrins');
    expect(barre.alt).toBe(4102);
    expect(json.places.length).toBe(26);
  });

  test('loadPlaces ajoute les coordonnées locales', async () => {
    const places = await loadPlaces('./data/places.json', fakeFetch);
    const meije = places.find((p) => p.name === 'La Meije');
    expect(meije.x).toBeCloseTo(-1417.748, 1);
    expect(meije.z).toBeCloseTo(-489.298, 1);
    expect(meije).toMatchObject({ kind: 'sommet', alt: 3983 });
  });

  test('nearestPlace au point de la Meije', async () => {
    const places = await loadPlaces('./data/places.json', fakeFetch);
    const p = toLocal(45.0055, 6.3082);
    const { place, distance } = nearestPlace(places, p.x + 120, p.z - 80);
    expect(place.name).toBe('La Meije');
    expect(distance).toBeLessThan(300);
  });

  test('loadPlaces en échec : message clair', async () => {
    await expect(loadPlaces('./x.json', async () => ({ ok: false, status: 404 }))).rejects.toThrow(/lieux/);
  });
});
