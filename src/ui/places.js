// Lieux nommés : sommets, villages, cols, glaciers, lacs.
import { toLocal } from '../geo/frame.js';

export async function loadPlaces(url = './data/places.json', fetchFn = globalThis.fetch?.bind(globalThis)) {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`Impossible de charger la liste des lieux (${res.status})`);
  const { places } = await res.json();
  return places.map((p) => ({ ...p, ...toLocal(p.lat, p.lon) }));
}

export function nearestPlace(places, x, z) {
  let best = null;
  let distance = Infinity;
  for (const p of places) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < distance) { distance = d; best = p; }
  }
  return { place: best, distance };
}
