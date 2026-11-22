// Vol calme : sans perte d'altitude, retour à plat automatique, protection du relief.
// Phase 1 bis : commandes progressives, vol bas possible en vallée, trois allures.
const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const approach = (v, target, rate, dt) => v + (target - v) * (1 - Math.exp(-rate * dt));

export const MAX_DT = 0.1;
export const MIN_CLEARANCE = 40; // plancher absolu
export const LOW_FLIGHT = 50; // hauteur de vol bas visée quand on pique vers le sol
export const ALLURES = [
  { name: 'Flânerie', kmh: 80 },
  { name: 'Promenade', kmh: 150 },
  { name: 'Voyage', kmh: 600 },
];
export const DEFAULT_ALLURE = 1;
export const DEFAULT_SPEED = ALLURES[DEFAULT_ALLURE].kmh / 3.6;
// Débattements francs ; le pilote automatique, lui, n'en utilise qu'une partie.
export const MAX_BANK = 60 * DEG;
export const MAX_PITCH = 35 * DEG;
const MAX_PROTECT_PITCH = 35 * DEG;
const LOOKAHEAD_S = [0, 1, 2, 3, 5, 8]; // anticipation en secondes de vol, quelle que soit l'allure
const COMMAND_RATE = 0.9; // une commande met environ une seconde à s'établir
const CEILING = 6500;

export function createGlider({ x, y, z, heading = 0 }) {
  return {
    x, y, z, heading, pitch: 0, bank: 0,
    speed: DEFAULT_SPEED, targetSpeed: DEFAULT_SPEED, allure: DEFAULT_ALLURE,
    rollCmd: 0, pitchCmd: 0,
  };
}

export function setAllure(g, index) {
  g.allure = clamp(index, 0, ALLURES.length - 1);
  g.targetSpeed = ALLURES[g.allure].kmh / 3.6;
  return g;
}

/** Avance le planeur de dt secondes (plafonné à 0,1 s). Cap 0 = nord, x vers l'est, z vers le sud. */
export function stepGlider(g, input, dt, heightAt) {
  if (!(dt > 0)) return g;
  dt = Math.min(dt, MAX_DT);
  // Commandes adoucies : la position du « manche » rejoint la demande progressivement.
  g.rollCmd = approach(g.rollCmd ?? 0, clamp(input.roll, -1, 1), COMMAND_RATE * 2, dt);
  g.pitchCmd = approach(g.pitchCmd ?? 0, clamp(input.pitch, -1, 1), COMMAND_RATE * 2, dt);
  g.speed = approach(g.speed, g.targetSpeed ?? g.speed, 1 / 3, dt);

  g.bank = approach(g.bank, g.rollCmd * MAX_BANK, 0.9, dt);
  let pitchT = g.pitchCmd * MAX_PITCH;

  // Anticipation : relief le plus haut sur les prochaines secondes de vol.
  const fx = Math.sin(g.heading);
  const fz = -Math.cos(g.heading);
  let gmax = -Infinity;
  for (const t of LOOKAHEAD_S) {
    const d = t * g.speed;
    gmax = Math.max(gmax, heightAt(g.x + fx * d, g.z + fz * d));
  }
  const floor = gmax + LOW_FLIGHT;
  // En piqué, la descente s'adoucit à l'approche du sol et s'arrête à 50 m. La ressource commence
  // d'autant plus haut que l'on descend vite (environ 6 s de descente à la vitesse verticale actuelle).
  const sink = Math.max(0, -Math.sin(g.pitch) * g.speed);
  if (pitchT < 0) pitchT *= clamp((g.y - floor) / Math.max(150, sink * 6), 0, 1);
  // Relief devant : on remonte, d'autant plus fort qu'on va vite.
  if (g.y < floor) pitchT = Math.max(pitchT, clamp((floor - g.y) / 100, 0, 1) * MAX_PROTECT_PITCH);
  if (g.y > CEILING) pitchT = Math.min(pitchT, -4 * DEG);
  g.pitch = approach(g.pitch, pitchT, 1.0, dt);

  g.heading += ((9.81 * Math.tan(g.bank)) / g.speed) * dt;
  g.heading = ((g.heading % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const v = g.speed;
  g.x += fx * Math.cos(g.pitch) * v * dt;
  g.z += fz * Math.cos(g.pitch) * v * dt;
  g.y += Math.sin(g.pitch) * v * dt;
  // Jamais à moins de 40 m du relief.
  g.y = Math.max(g.y, heightAt(g.x, g.z) + MIN_CLEARANCE);
  g.protecting = g.y < floor;
  return g;
}
