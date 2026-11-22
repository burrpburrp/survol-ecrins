// Panneau de mesure, affiché avec ?debug : temps moyens des requêtes, carrés, images par seconde.
export function createDebugPanel({ source, tiles, queue }) {
  const el = document.createElement('pre');
  el.id = 'debug';
  el.style.cssText = 'position:fixed;left:16px;bottom:16px;margin:0;padding:10px 14px;background:rgba(0,0,0,0.7);color:#cfe;font:14px/1.5 ui-monospace,monospace;border-radius:8px;z-index:5;';
  document.body.appendChild(el);
  let frames = 0;
  let since = performance.now();
  let fps = 0;
  const avg = (s) => (s.count ? `${Math.round(s.totalMs / s.count)} ms (${s.count})` : '—');
  return {
    frame(now, visibleCount) {
      frames++;
      if (now - since < 1000) return;
      fps = (frames * 1000) / (now - since);
      frames = 0;
      since = now;
      el.textContent = [
        `Orthophoto : ${source.orthoMode === 'wmts' ? 'WMTS (grille PM)' : 'WMS-R (Lambert-93)'}`,
        `Images/s : ${fps.toFixed(0)}`,
        `Relief, moyenne : ${avg(source.stats.elevation)}`,
        `Orthophoto, moyenne : ${avg(source.stats.ortho)}`,
        `Carrés affichés : ${visibleCount} · en mémoire : ${tiles.readyCount}`,
        `File : ${queue.running} en cours, ${queue.pending} en attente`,
      ].join('\n');
    },
    get fps() { return fps; },
  };
}
