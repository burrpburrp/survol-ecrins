import { describe, expect, test } from 'vitest';
import { TileManager } from '../src/tiles/manager.js';
import { RequestQueue } from '../src/tiles/queue.js';
import { selectTiles } from '../src/tiles/quadtree.js';

const N = 257;
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

/** Source simulée. ready(bbox) décide si la réponse arrive tout de suite ou jamais. */
function fakeSource({ ready = () => true, height = 1000 } = {}) {
  const src = {
    started: [], aborted: [],
    getElevation(bbox, n, signal) {
      return this.respond(bbox, signal, () => ({ heights: new Float32Array(n * n).fill(height), layers: ['MNS'] }));
    },
    getOrtho(bbox, px, signal) {
      return this.respond(bbox, signal, () => ({ width: px, height: px, close() {} }));
    },
    respond(bbox, signal, make) {
      src.started.push(bbox);
      if (ready(bbox)) return Promise.resolve(make());
      return new Promise((_, rej) => signal.addEventListener('abort', () => {
        src.aborted.push(bbox);
        rej(new DOMException('aborted', 'AbortError'));
      }));
    },
  };
  return src;
}
const ROOT_WIDTH = 131072 + 512; // largeur de la bbox de relief de la racine (demi-échantillon de chaque côté)
const isRootBbox = (b) => b[2] - b[0] >= 131072;

describe('TileManager', () => {
  test('tout est prêt : update rend exactement les carrés de selectTiles', async () => {
    const m = new TileManager({ source: fakeSource(), queue: new RequestQueue({ concurrency: 64 }) });
    const cam = { x: 2000, y: 3500, z: -1000, ground: 3000 };
    for (let i = 0; i < 12; i++) { m.update(cam); await flush(); }
    const { visible, loading } = m.update(cam);
    // Le relief simulé est plat à 1 000 m : c'est lui qui compte, pas le sol annoncé sous la caméra.
    const flatRange = () => ({ min: 1000, max: 1000 });
    expect(visible.map((t) => t.key).sort()).toEqual(selectTiles(cam, { heightRange: flatRange }).map((t) => t.key).sort());
    expect(loading).toBe(0);
    expect(visible[0].heights.length).toBe(N * N);
    expect(visible[0].ortho).toBeTruthy();
  });

  test('seule la racine est prête : update rend la racine, jamais un trou', async () => {
    const m = new TileManager({ source: fakeSource({ ready: isRootBbox }), queue: new RequestQueue() });
    const cam = { x: 0, y: 3500, z: 0, ground: 3000 };
    m.update(cam);
    await flush();
    const { visible, loading } = m.update(cam);
    expect(visible.map((t) => t.key)).toEqual(['0/0/0']);
    expect(loading).toBeGreaterThan(0);
  });

  test('avant tout chargement : rien à afficher, la racine est demandée en premier', () => {
    const src = fakeSource({ ready: () => false });
    const m = new TileManager({ source: src, queue: new RequestQueue() });
    const { visible } = m.update({ x: 0, y: 3500, z: 0, ground: 3000 });
    expect(visible).toEqual([]);
    expect(isRootBbox(src.started[0])).toBe(true);
    expect(src.started[0][2] - src.started[0][0]).toBe(ROOT_WIDTH);
  });

  test('saut de 40 km : les requêtes devenues inutiles sont annulées', async () => {
    const src = fakeSource({ ready: isRootBbox });
    const queue = new RequestQueue();
    const m = new TileManager({ source: src, queue });
    const a = { x: -20000, y: 2300, z: 0, ground: 2000 };
    m.update(a);
    await flush();
    m.update(a);
    const before = queue.pending + queue.running;
    expect(before).toBeGreaterThan(6);
    const b = { x: 20000, y: 2300, z: 0, ground: 2000 };
    const wantedB = new Set(m.wantedKeys(b));
    const stale = [...queue.entries.keys()].filter((k) => !wantedB.has(k.replace(/^tile:/, '')));
    expect(stale.length).toBeGreaterThan(0);
    m.update(b);
    await flush();
    for (const k of stale) expect(queue.entries.has(k)).toBe(false);
    // Tout ce qui reste dans la file sert la nouvelle position.
    const wanted = new Set(m.wantedKeys(b));
    for (const k of queue.entries.keys()) expect(wanted.has(k.replace(/^tile:/, ''))).toBe(true);
    // Et en revenant au calme (caméra très haute), la file se vide.
    m.update({ x: 0, y: 1e6, z: 0, ground: 0 });
    await flush();
    expect(queue.pending).toBe(0);
    expect(queue.running).toBe(0);
  });

  test('heightAt sur un carré uniforme à 1 000 m', async () => {
    const m = new TileManager({ source: fakeSource({ height: 1000 }), queue: new RequestQueue() });
    m.update({ x: 0, y: 1e6, z: 0, ground: 0 });
    await flush();
    expect(m.heightAt(1234.5, -987.25)).toBeCloseTo(1000, 5);
    expect(m.heightAt(0, 0)).toBeCloseTo(1000, 5);
  });

  test('heightAt sans aucun carré prêt : 0', () => {
    const m = new TileManager({ source: fakeSource({ ready: () => false }), queue: new RequestQueue() });
    expect(m.heightAt(0, 0)).toBe(0);
  });

  test('le nombre de carrés en mémoire ne dépasse jamais maxTiles', async () => {
    const evicted = [];
    const m = new TileManager({
      source: fakeSource(), queue: new RequestQueue({ concurrency: 64 }), maxTiles: 40,
      onEvict: (t) => evicted.push(t.key),
    });
    for (let i = 0; i < 30; i++) {
      m.update({ x: -60000 + i * 4000, y: 2300, z: 0, ground: 2000 });
      await flush();
      expect(m.readyCount).toBeLessThanOrEqual(40);
    }
    expect(evicted.length).toBeGreaterThan(0);
  });
});
