// Noms des lieux affichés dans le paysage (touche i) : sommets, cols, lacs, villages, glaciers, refuges.
// Un nom n'apparaît que s'il est à portée, devant soi, et qu'aucune montagne ne le cache.
import { toLocal, inZone } from '../geo/frame.js';

const fmt = (v) => Math.round(v).toLocaleString('fr-FR');

export async function loadLabels(url = './data/labels.json', fetchFn = globalThis.fetch?.bind(globalThis)) {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`Impossible de charger les noms des lieux (${res.status})`);
  const { labels } = await res.json();
  return labels
    .map(([name, kind, alt, lat, lon, reachKm]) => ({ name, kind, alt, reach: reachKm * 1000, ...toLocal(lat, lon) }))
    .filter((l) => inZone(l.x, l.z));
}

export function labelText(l) {
  const withAlt = l.alt != null && (l.kind === 'sommet' || l.kind === 'col' || l.kind === 'refuge');
  return [l.name, withAlt ? `${fmt(l.alt)} m` : ''];
}

// Le point visé est-il vu depuis la caméra ? On suit le trait de visée et on regarde si le relief le coupe.
// Les derniers 4 % du trait sont ignorés : c'est le sol autour du lieu lui-même.
export function isVisibleFrom(cam, p, heightAt, samples = 28) {
  for (let i = 1; i < samples; i++) {
    const t = (i / samples) * 0.96;
    const x = cam.x + (p.x - cam.x) * t;
    const z = cam.z + (p.z - cam.z) * t;
    const y = cam.y + (p.y - cam.y) * t;
    if (heightAt(x, z) > y + 5) return false;
  }
  return true;
}

// Point d'accroche du nom : un peu au-dessus du sommet ou du sol.
export function anchorOf(l, heightAt) {
  const ground = heightAt(l.x, l.z);
  const base = l.kind === 'sommet' && l.alt != null ? Math.max(l.alt, ground) : ground;
  return { x: l.x, y: base + 25, z: l.z };
}

const boxOf = (l, sx, sy) => {
  const w = Math.max(l.name.length * 9, 60) + 16;
  return { x0: sx - w / 2, x1: sx + w / 2, y0: sy - 48, y1: sy };
};
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

// Choisit les noms à montrer. project(x, y, z) → {sx, sy} en pixels, ou null si derrière.
export function pickLabels(labels, { cam, project, heightAt, width, height, max = 30 }) {
  const near = [];
  for (const l of labels) {
    const d = Math.hypot(l.x - cam.x, l.z - cam.z);
    if (d <= l.reach && d > 80) near.push({ l, d, score: d / l.reach });
  }
  near.sort((a, b) => a.score - b.score);
  const picked = [];
  const boxes = [];
  for (const { l, d } of near) {
    if (picked.length >= max) break;
    const a = anchorOf(l, heightAt);
    const s = project(a.x, a.y, a.z);
    if (!s || s.sx < 0 || s.sx > width || s.sy < 40 || s.sy > height) continue;
    const box = boxOf(l, s.sx, s.sy);
    if (boxes.some((b) => overlaps(b, box))) continue;
    if (!isVisibleFrom(cam, a, heightAt)) continue;
    boxes.push(box);
    picked.push({ label: l, anchor: a, sx: s.sx, sy: s.sy, d });
  }
  return picked;
}

// Calque HTML posé sur la vue 3D. Les éléments sont réutilisés d'une image à l'autre.
export function createLabelLayer(root) {
  const pool = [];
  return {
    show(items, projectFn) {
      items.forEach((it, i) => {
        let el = pool[i];
        if (!el) {
          el = document.createElement('div');
          el.innerHTML = '<b></b><small></small>';
          root.appendChild(el);
          pool.push(el);
        }
        const s = projectFn(it.anchor.x, it.anchor.y, it.anchor.z);
        if (!s) { el.hidden = true; return; }
        const [name, sub] = labelText(it.label);
        if (el.dataset.name !== name) {
          el.dataset.name = name;
          el.className = `place-label kind-${it.label.kind}`;
          el.firstChild.textContent = name;
          el.lastChild.textContent = sub;
        }
        el.hidden = false;
        el.style.transform = `translate(${Math.round(s.sx)}px, ${Math.round(s.sy)}px) translate(-50%, -100%)`;
      });
      for (let i = items.length; i < pool.length; i++) pool[i].hidden = true;
    },
    hide() { for (const el of pool) el.hidden = true; },
  };
}
