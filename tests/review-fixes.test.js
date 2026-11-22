// Corrections issues de la relecture finale : chaque test reproduit un défaut constaté.
import { describe, expect, test, vi } from 'vitest';
import { limitFetch } from '../src/tiles/cache.js';
import { IgnSource, NoDataError } from '../src/tiles/sources/ign.js';
import { RequestQueue } from '../src/tiles/queue.js';
import { TileManager, WorkerSource } from '../src/tiles/manager.js';
import { buildTileGeometry } from '../src/render/terrainMesh.js';
import { wrapAngle } from '../src/flight/autopilot.js';

const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

describe('au plus 6 requêtes IGN en même temps', () => {
  test('limitFetch plafonne les requêtes en cours', async () => {
    let inFlight = 0, max = 0;
    const resolvers = [];
    const f = limitFetch(async () => {
      inFlight++; max = Math.max(max, inFlight);
      await new Promise((r) => resolvers.push(r));
      inFlight--;
      return 'ok';
    }, 6);
    const all = Promise.all(Array.from({ length: 20 }, () => f('u')));
    for (let i = 0; i < 40; i++) { await flush(); resolvers.splice(0).forEach((r) => r()); }
    await all;
    expect(max).toBe(6);
  });

  test('une requête annulée en attente de place n’est jamais envoyée', async () => {
    const net = vi.fn(() => new Promise(() => {}));
    const f = limitFetch(net, 1);
    f('a');
    const ctrl = new AbortController();
    const p = f('b', { signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(net).toHaveBeenCalledTimes(1);
  });
});

describe('carré sans aucune donnée (Italie)', () => {
  const N = 4;
  const empty = () => {
    const buf = new ArrayBuffer(N * N * 4);
    new Float32Array(buf).fill(-99999);
    return { ok: true, status: 200, headers: new Headers({ 'content-type': 'image/x-bil;bits=32' }), arrayBuffer: async () => buf };
  };
  test('IgnSource rend une NoDataError, distincte d’une panne', async () => {
    await expect(new IgnSource({ fetch: async () => empty() }).getElevation([0, 0, 1, 1], N)).rejects.toBeInstanceOf(NoDataError);
    await expect(new IgnSource({ fetch: async () => ({ ok: false, status: 503 }) }).getElevation([0, 0, 1, 1], N))
      .rejects.not.toBeInstanceOf(NoDataError);
  });

  test('la file ne retente pas une NoDataError', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const q = new RequestQueue();
    let n = 0;
    const p = q.push('k', 0, async () => { n++; throw new NoDataError(); }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(10000);
    expect(await p).toBeInstanceOf(NoDataError);
    expect(n).toBe(1);
    vi.useRealTimers();
  });

  test('le gestionnaire ne redemande pas un carré sans données et n’affiche pas de panne', async () => {
    const calls = new Map();
    const source = {
      getElevation(bbox, n) {
        const k = bbox.join(); calls.set(k, (calls.get(k) || 0) + 1);
        if (bbox[2] - bbox[0] < 131072) return Promise.reject(new NoDataError());
        return Promise.resolve({ heights: new Float32Array(n * n).fill(100), layers: ['MNS'] });
      },
      getOrtho: () => Promise.resolve({ close() {} }),
    };
    const m = new TileManager({ source, queue: new RequestQueue() });
    const cam = { x: 0, y: 2300, z: 0, ground: 2000 };
    for (let i = 0; i < 10; i++) { m.update(cam); await flush(); }
    expect(Math.max(...calls.values())).toBe(1);
    expect(m.lastError).toBeNull();
    expect(m.update(cam).visible.map((t) => t.key)).toEqual(['0/0/0']);
  });
});

describe('gestionnaire : file et cache', () => {
  test('un carré en cours de chargement n’est pas repoussé à chaque mise à jour', async () => {
    const source = { getElevation: () => new Promise(() => {}), getOrtho: () => new Promise(() => {}) };
    const queue = new RequestQueue();
    const push = vi.spyOn(queue, 'push');
    const m = new TileManager({ source, queue });
    const cam = { x: 0, y: 2300, z: 0, ground: 2000 };
    m.update(cam);
    const first = push.mock.calls.length;
    m.update(cam);
    m.update(cam);
    expect(push.mock.calls.length).toBe(first);
  });

  test('les carrés voulus restent les plus récents du cache', async () => {
    const source = {
      getElevation: (b, n) => Promise.resolve({ heights: new Float32Array(n * n), layers: [] }),
      getOrtho: () => Promise.resolve({ close() {} }),
    };
    const m = new TileManager({ source, queue: new RequestQueue({ concurrency: 64 }) });
    const near = { x: 0, y: 2300, z: 0, ground: 2000 };
    for (let i = 0; i < 12; i++) { m.update(near); await flush(); }
    m.update({ x: 40000, y: 2300, z: 40000, ground: 2000 }); // charge d'autres carrés
    await flush();
    m.update({ x: 40000, y: 2300, z: 40000, ground: 2000 });
    const order = [...m.ready.map.keys()];
    const wanted = new Set(m.wantedKeys({ x: 40000, y: 2300, z: 40000, ground: 2000 }));
    // Tous les carrés qui ne sont plus voulus partiront avant n'importe quel carré voulu (racine comprise).
    const lastStale = Math.max(...order.map((k, i) => (wanted.has(k) ? -1 : i)));
    const firstWanted = order.findIndex((k) => wanted.has(k));
    expect(order.includes('0/0/0')).toBe(true);
    expect(lastStale).toBeLessThan(firstWanted);
  });
});

describe('maillage', () => {
  test('tous les carrés partagent le même tableau d’indices', () => {
    const t = () => ({ bounds: { x0: 0, z0: 0, size: 256 }, heights: new Float32Array(257 * 257) });
    expect(buildTileGeometry(t()).index).toBe(buildTileGeometry(t()).index);
    expect(buildTileGeometry(t(), 2).index).not.toBe(buildTileGeometry(t()).index);
  });
});

describe('worker', () => {
  test('si le worker plante, les appels en cours échouent au lieu de rester bloqués', async () => {
    let w;
    const src = new WorkerSource({ createWorker: () => (w = { postMessage() {}, onmessage: null, onerror: null }) });
    const p = src.getElevation([0, 0, 1, 1], 4);
    w.onerror(new Event('error'));
    await expect(p).rejects.toThrow(/worker/i);
  });
});

describe('pilote automatique', () => {
  test('wrapAngle ramène dans [−π, π], même pour un angle très négatif', () => {
    for (const a of [-10, -5.4, -Math.PI - 2.27, 0.3, 7, 12.5]) {
      const w = wrapAngle(a);
      expect(w).toBeGreaterThanOrEqual(-Math.PI);
      expect(w).toBeLessThanOrEqual(Math.PI);
      expect(Math.cos(w)).toBeCloseTo(Math.cos(a), 9);
      expect(Math.sin(w)).toBeCloseTo(Math.sin(a), 9);
    }
  });
});
