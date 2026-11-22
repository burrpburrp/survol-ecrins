import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { RequestQueue } from '../src/tiles/queue.js';

/** Tâche contrôlable de l'extérieur. */
function deferredJob(log, name) {
  let resolve;
  const job = (signal) => {
    log.push(name);
    job.signal = signal;
    return new Promise((r, rej) => {
      resolve = r;
      signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
    });
  };
  job.finish = (v) => resolve(v);
  return job;
}
const flush = () => new Promise((r) => setImmediate(r));

describe('RequestQueue', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
  afterEach(() => vi.useRealTimers());

  test('au plus 6 tâches en même temps', async () => {
    const q = new RequestQueue();
    const log = [];
    const jobs = Array.from({ length: 10 }, (_, i) => deferredJob(log, i));
    jobs.forEach((j, i) => q.push(`k${i}`, i, j).catch(() => {}));
    await flush();
    expect(q.running).toBe(6);
    expect(q.pending).toBe(4);
    jobs[0].finish(1);
    await flush();
    expect(q.running).toBe(6);
    expect(q.pending).toBe(3);
  });

  test('l’ordre de démarrage suit la priorité', async () => {
    const q = new RequestQueue({ concurrency: 1 });
    const log = [];
    const a = deferredJob(log, 'a');
    q.push('a', 0, a);
    q.push('c', 30, deferredJob(log, 'c'));
    q.push('b', 10, deferredJob(log, 'b'));
    q.push('d', 5, deferredJob(log, 'd'));
    await flush();
    a.finish();
    await flush();
    expect(log).toEqual(['a', 'd']);
  });

  test('reprioritize(() => null) annule tout', async () => {
    const q = new RequestQueue({ concurrency: 2 });
    const log = [];
    const jobs = Array.from({ length: 5 }, (_, i) => deferredJob(log, i));
    const results = jobs.map((j, i) => q.push(`k${i}`, i, j).then(() => 'ok', (e) => e.name));
    await flush();
    q.reprioritize(() => null);
    expect(jobs[0].signal.aborted).toBe(true);
    expect(jobs[1].signal.aborted).toBe(true);
    expect(await Promise.all(results)).toEqual(new Array(5).fill('AbortError'));
    expect(q.running).toBe(0);
    expect(q.pending).toBe(0);
    expect(log).toEqual([0, 1]);
  });

  test('reprioritize change l’ordre des tâches en attente', async () => {
    const q = new RequestQueue({ concurrency: 1 });
    const log = [];
    const a = deferredJob(log, 'a');
    q.push('a', 0, a);
    q.push('b', 1, deferredJob(log, 'b'));
    q.push('c', 2, deferredJob(log, 'c'));
    q.reprioritize((k) => ({ a: 0, b: 9, c: 1 })[k]);
    await flush();
    a.finish();
    await flush();
    expect(log).toEqual(['a', 'c']);
  });

  test('une même clé ne lance qu’une tâche', async () => {
    const q = new RequestQueue();
    const job = vi.fn(async () => 42);
    const [r1, r2] = [q.push('x', 0, job), q.push('x', 0, job)];
    expect(await r1).toBe(42);
    expect(await r2).toBe(42);
    expect(job).toHaveBeenCalledTimes(1);
  });

  test('deux échecs puis réussite : résolue au bout de 3 s', async () => {
    const q = new RequestQueue();
    let n = 0;
    const job = async () => { n++; if (n < 3) throw new TypeError('Failed to fetch'); return 'ok'; };
    let done = false;
    const p = q.push('x', 0, job).then((v) => { done = true; return v; });
    await vi.advanceTimersByTimeAsync(2999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toBe('ok');
    expect(n).toBe(3);
  });

  test('quatre échecs : rejetée après 3 nouvelles tentatives', async () => {
    const q = new RequestQueue();
    let n = 0;
    const p = q.push('x', 0, async () => { n++; throw new TypeError('Failed to fetch'); });
    const settled = p.catch((e) => e.message);
    await vi.advanceTimersByTimeAsync(7000);
    expect(await settled).toBe('Failed to fetch');
    expect(n).toBe(4);
  });
});
