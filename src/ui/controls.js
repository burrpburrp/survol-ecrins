// Commandes au clavier : flèches comme un manche d'avion, + et −, pavé numérique, i, m,
// barre d'espace (pause), h (affichage immersif).
export const VIEWS = {
  devant: { yaw: 0, pitch: 0 },
  gauche: { yaw: Math.PI / 2, pitch: 0 },
  droite: { yaw: -Math.PI / 2, pitch: 0 },
  'arrière': { yaw: Math.PI, pitch: 0 },
  dessous: { yaw: 0, pitch: -Math.PI / 2 },
};
const VIEW_KEYS = { 8: 'devant', 4: 'gauche', 6: 'droite', 2: 'arrière', 0: 'dessous' };

export function createControls({ onAllure = () => {}, onView = () => {}, onToggle = () => {}, onPause = () => {} } = {}, root = document) {
  const held = new Set();
  const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'nose-down', ArrowDown: 'nose-up' };
  const typing = (e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
  window.addEventListener('keydown', (e) => {
    if (typing(e)) return;
    if (KEYS[e.key]) { held.add(KEYS[e.key]); e.preventDefault(); return; }
    if (e.key === ' ') {
      e.preventDefault(); // sinon la barre d'espace « clique » le dernier bouton utilisé
      document.activeElement?.blur?.();
      if (!e.repeat) onPause();
      return;
    }
    if (e.repeat) return;
    if (e.key === '+' || e.key === '=') onAllure(+1);
    else if (e.key === '-' || e.key === '_') onAllure(-1);
    else if (e.key in VIEW_KEYS) onView(VIEW_KEYS[e.key]);
    else if (e.key === 'i' || e.key === 'I') onToggle('labels');
    else if (e.key === 'm' || e.key === 'M') onToggle('map');
    else if (e.key === 'h' || e.key === 'H') onToggle('immersive');
  });
  window.addEventListener('keyup', (e) => { if (KEYS[e.key]) held.delete(KEYS[e.key]); });
  window.addEventListener('blur', () => held.clear());
  root.getElementById?.('slower')?.addEventListener('click', () => onAllure(-1));
  root.getElementById?.('faster')?.addEventListener('click', () => onAllure(+1));
  return {
    /** {roll, pitch} entre −1 et 1 ; pitch positif = nez en haut. */
    input() {
      return {
        roll: (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0),
        pitch: (held.has('nose-up') ? 1 : 0) - (held.has('nose-down') ? 1 : 0),
      };
    },
  };
}
