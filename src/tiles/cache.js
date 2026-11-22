// Caches : en mémoire (LRU) et dans le navigateur (Cache API « ign-v1 »).

export class LruCache {
  constructor(maxEntries, onEvict = () => {}) {
    this.max = maxEntries;
    this.onEvict = onEvict;
    this.map = new Map(); // l'ordre d'insertion sert d'ordre d'usage
  }
  get size() { return this.map.size; }
  has(k) { return this.map.has(k); }
  peek(k) { return this.map.get(k); }
  get(k) {
    if (!this.map.has(k)) return undefined;
    const v = this.map.get(k);
    this.map.delete(k);
    this.map.set(k, v);
    return v;
  }
  set(k, v) {
    this.map.delete(k);
    this.map.set(k, v);
    while (this.map.size > this.max) {
      const [oldK, oldV] = this.map.entries().next().value;
      this.map.delete(oldK);
      this.onEvict(oldK, oldV);
    }
  }
  delete(k) {
    const v = this.map.get(k);
    if (this.map.delete(k)) this.onEvict(k, v);
  }
  values() { return this.map.values(); }
}

export const CACHE_NAME = 'ign-v1';
const isElevationUrl = (url) => /FORMAT=image%2Fx-bil/i.test(url);

/**
 * Enveloppe fetch : les réponses de relief valides sont gardées dans le Cache API,
 * sous l'URL de la requête, pour qu'une seconde visite soit presque instantanée.
 */
export function cachingFetch(fetchFn, { caches = globalThis.caches } = {}) {
  let opening = null;
  const open = () => (opening ??= caches.open(CACHE_NAME).catch(() => null));
  return async (url, opts) => {
    if (!caches || !isElevationUrl(url)) return fetchFn(url, opts);
    const cache = await open();
    const hit = cache && (await cache.match(url).catch(() => undefined));
    if (hit) return hit;
    const res = await fetchFn(url, opts);
    const type = res.headers?.get?.('content-type') || '';
    if (cache && res.ok && type.startsWith('image/x-bil')) {
      await cache.put(url, res.clone()).catch(() => {});
    }
    return res;
  };
}

/**
 * Enveloppe fetch : au plus `max` requêtes réseau en même temps (politesse envers l'IGN).
 * Une requête annulée pendant qu'elle attend sa place n'est jamais envoyée.
 */
export function limitFetch(fetchFn, max = 6) {
  let active = 0;
  const waiting = [];
  const next = () => {
    while (active < max && waiting.length) {
      const w = waiting.shift();
      if (w.signal?.aborted) { w.reject(new DOMException('requête annulée', 'AbortError')); continue; }
      active++;
      Promise.resolve().then(() => fetchFn(w.url, w.opts)).then(w.resolve, w.reject).finally(() => { active--; next(); });
    }
  };
  return (url, opts) => new Promise((resolve, reject) => {
    const signal = opts?.signal;
    if (signal?.aborted) { reject(new DOMException('requête annulée', 'AbortError')); return; }
    const w = { url, opts, signal, resolve, reject };
    waiting.push(w);
    signal?.addEventListener('abort', () => {
      const i = waiting.indexOf(w);
      if (i >= 0) { waiting.splice(i, 1); reject(new DOMException('requête annulée', 'AbortError')); }
    }, { once: true });
    next();
  });
}
