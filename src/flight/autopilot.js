// Pilote automatique : cap vers un lieu, puis tour autour en le gardant à droite.
import { inZone, toLocal } from '../geo/frame.js';
import { setAllure, MAX_BANK, MAX_PITCH } from './glider.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const DEG = Math.PI / 180;
// Le pilote automatique vole calmement : 27° d'inclinaison et 8° d'assiette au plus.
const AP_ROLL = (27 * DEG) / MAX_BANK;
const AP_PITCH = (8 * DEG) / MAX_PITCH;

/** Angle ramené dans [−π, π]. */
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Centre de la zone de vol, cible du retour automatique au bord. */
export const ZONE_CENTER = { name: 'centre du massif', kind: 'lieu', alt: null, ...toLocal(45.0, 6.325) };

export function createAutopilot() {
  return { active: false, target: null, reason: null };
}

export function setTarget(ap, place, reason = 'choix') {
  ap.active = true;
  ap.target = place;
  ap.reason = reason;
}

/**
 * Commandes du pilote automatique, ou null s'il est inactif.
 * opts.manual : commandes du pilote ; un roulis non nul coupe le pilote automatique.
 * opts.heightAt : relief, pour l'altitude de croisière.
 */
export function autopilotInput(ap, g, { manual, heightAt = () => 0 } = {}) {
  if (manual && manual.roll !== 0) {
    ap.active = false;
    ap.reason = null;
    return null;
  }
  if (!inZone(g.x, g.z) && !(ap.active && ap.reason === 'bord')) setTarget(ap, ZONE_CENTER, 'bord');
  if (!ap.active) return null;
  const t = ap.target;
  const dx = t.x - g.x;
  const dz = t.z - g.z;
  const d = Math.hypot(dx, dz);
  const R = t.kind === 'sommet' ? 1800 : 1400;
  // À l'approche, on repasse en Promenade : à 600 km/h, impossible de tourner autour du lieu.
  if (d < 8000 && (g.allure ?? 0) > 1) setAllure(g, 1);
  let want = Math.atan2(dx, -dz);
  if (d < R * 1.6) want -= Math.PI / 2 - clamp((d - R) / R, -1, 1) * 0.7; // le lieu reste à droite
  const err = wrapAngle(want - g.heading);
  const ground = heightAt(t.x, t.z);
  const cruise = t.kind === 'sommet' ? Math.max(ground, t.alt ?? 0) + 450 : ground + 700;
  return {
    roll: clamp(err * 1.4, -1, 1) * AP_ROLL,
    pitch: clamp((cruise - g.y) / 400, -1, 1) * AP_PITCH,
  };
}
