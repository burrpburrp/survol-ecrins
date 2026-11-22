import { describe, expect, test, vi } from 'vitest';
import { LruCache, cachingFetch } from '../src/tiles/cache.js';

describe('LruCache', () => {
  test('évince la clé la moins récemment vue', () => {
    const evicted = [];
    const c = new LruCache(2, (k, v) => evicted.push(k));
    c.set('a', 1);
    c.set('b', 2);
    expect(c.get('a')).toBe(1);
    c.set('c', 3);
    expect(evicted).toEqual(['b']);
    expect(c.has('b')).toBe(false);
    expect(c.size).toBe(2);
  });
  test('peek ne rafraîchit pas', () => {
    const evicted = [];
    const c = new LruCache(2, (k) => evicted.push(k));
    c.set('a', 1);
    c.set('b', 2);
    c.peek('a');
    c.set('c', 3);
    expect(evicted).toEqual(['a']);
  });
});

describe('cachingFetch (Cache API « ign-v1 »)', () => {
  function fakeCaches() {
    const store = new Map();
    const cache = {
      match: vi.fn(async (url) => store.get(url)?.clone()),
      put: vi.fn(async (url, res) => { store.set(url, res); }),
    };
    return { open: vi.fn(async () => cache), cache, store };
  }
  const BIL_URL = 'https://data.geopf.fr/wms-r/wms?FORMAT=image%2Fx-bil%3Bbits%3D32&X=1';
  const bilResponse = () => new Response(new ArrayBuffer(8), { headers: { 'content-type': 'image/x-bil;bits=32' } });

  test('met en cache une réponse de relief, puis la ressert sans réseau', async () => {
    const caches = fakeCaches();
    const net = vi.fn(async () => bilResponse());
    const f = cachingFetch(net, { caches });
    await f(BIL_URL);
    const again = await f(BIL_URL);
    expect(net).toHaveBeenCalledTimes(1);
    expect(caches.open).toHaveBeenCalledWith('ign-v1');
    expect((await again.arrayBuffer()).byteLength).toBe(8);
  });

  test('ne met pas en cache un XML d’erreur ni une orthophoto', async () => {
    const caches = fakeCaches();
    const net = vi.fn(async (url) => url.includes('jpeg')
      ? new Response('x', { headers: { 'content-type': 'image/jpeg' } })
      : new Response('<xml/>', { headers: { 'content-type': 'text/xml' } }));
    const f = cachingFetch(net, { caches });
    await f(BIL_URL);
    await f('https://data.geopf.fr/wms-r/wms?FORMAT=image%2Fjpeg');
    expect(caches.cache.put).not.toHaveBeenCalled();
  });

  test('sans Cache API : simple passage au réseau', async () => {
    const net = vi.fn(async () => bilResponse());
    await cachingFetch(net, { caches: undefined })(BIL_URL);
    expect(net).toHaveBeenCalledTimes(1);
  });
});
