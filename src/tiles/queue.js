// File de requêtes polie : concurrence bornée, priorités, annulation, nouvelles tentatives.

const RETRY_DELAYS = [1000, 2000, 4000];
const abortError = () => new DOMException('requête annulée', 'AbortError');

export class RequestQueue {
  constructor({ concurrency = 6 } = {}) {
    this.concurrency = concurrency;
    this.entries = new Map(); // clé → entrée, tant que la promesse n'est pas réglée
    this.queue = []; // entrées en attente, triées par priorité croissante
    this.active = 0;
  }

  get running() { return this.active; }
  get pending() { return this.queue.length; }

  /** La priorité la plus basse passe en premier. Une clé déjà présente rend la même promesse. */
  push(key, priority, job) {
    const known = this.entries.get(key);
    if (known) return known.promise;
    const e = { key, priority, job, attempt: 0, state: 'pending', controller: new AbortController() };
    e.promise = new Promise((res, rej) => { e.resolve = res; e.reject = rej; });
    this.entries.set(key, e);
    this.#enqueue(e);
    this.#pump();
    return e.promise;
  }

  /** fn(clé) → nouvelle priorité, ou null pour annuler (en attente ou en cours). */
  reprioritize(fn) {
    for (const e of [...this.entries.values()]) {
      const p = fn(e.key);
      if (p === null || p === undefined) this.#cancel(e);
      else e.priority = p;
    }
    this.queue.sort((a, b) => a.priority - b.priority);
    this.#pump();
  }

  #enqueue(e) {
    let i = this.queue.length;
    while (i > 0 && this.queue[i - 1].priority > e.priority) i--;
    this.queue.splice(i, 0, e);
  }

  #settle(e, ok, value) {
    if (this.entries.get(e.key) === e) this.entries.delete(e.key);
    e.state = 'done';
    ok ? e.resolve(value) : e.reject(value);
  }

  #cancel(e) {
    if (e.state === 'done') return;
    if (e.state === 'pending') this.queue.splice(this.queue.indexOf(e), 1);
    if (e.state === 'waiting') clearTimeout(e.timer);
    e.controller.abort();
    // Une tâche en cours libère sa place tout de suite ; sa promesse est réglée ici.
    if (e.state === 'running') this.active--;
    this.#settle(e, false, abortError());
  }

  #pump() {
    while (this.active < this.concurrency && this.queue.length) this.#run(this.queue.shift());
  }

  async #run(e) {
    e.state = 'running';
    this.active++;
    let ok = false;
    let value;
    try {
      value = await e.job(e.controller.signal);
      ok = true;
    } catch (err) {
      value = err;
    }
    if (e.state !== 'running') return; // annulée pendant l'exécution : déjà réglée
    this.active--;
    if (!ok && value?.name !== 'AbortError' && !value?.noRetry && e.attempt < RETRY_DELAYS.length) {
      e.state = 'waiting';
      e.timer = setTimeout(() => {
        if (e.state !== 'waiting') return;
        e.state = 'pending';
        this.#enqueue(e);
        this.#pump();
      }, RETRY_DELAYS[e.attempt++]);
    } else {
      this.#settle(e, ok, value);
    }
    this.#pump();
  }
}
