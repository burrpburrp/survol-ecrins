import { describe, expect, test } from 'vitest';
import { createGlider, stepGlider } from '../src/flight/glider.js';
import { createAutopilot, setTarget, autopilotInput, ZONE_CENTER } from '../src/flight/autopilot.js';
import { inZone, toLocal } from '../src/geo/frame.js';

const meije = { name: 'La Meije', kind: 'sommet', alt: 3983, ...toLocal(45.0055, 6.3082) };
const heightAt = () => 1500;
const angleTo = (g, t) => {
  const want = Math.atan2(t.x - g.x, -(t.z - g.z));
  return Math.abs(((want - g.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
};

function fly(g, ap, seconds, manual = { roll: 0, pitch: 0 }, onStep = () => {}) {
  const dt = 1 / 30;
  for (let t = 0; t < seconds; t += dt) {
    const input = autopilotInput(ap, g, { manual, heightAt }) ?? manual;
    stepGlider(g, input, dt, heightAt);
    onStep(g);
  }
}

describe('pilote automatique', () => {
  test('inactif par défaut', () => {
    const ap = createAutopilot();
    expect(autopilotInput(ap, createGlider({ x: 0, y: 3000, z: 0, heading: 0 }), { heightAt })).toBeNull();
  });

  test('vers la Meije depuis 15 km : arrive et tourne autour', () => {
    const g = createGlider({ x: meije.x + 15000, y: 3000, z: meije.z + 2000, heading: 0 });
    const ap = createAutopilot();
    setTarget(ap, meije);
    fly(g, ap, 600);
    expect(Math.hypot(g.x - meije.x, g.z - meije.z)).toBeLessThan(2500);
    // Il tourne (un tour de 1,8 km de rayon prend près de 6 min) : sur les 4 minutes suivantes, il reste proche et son cap fait plus d'un demi-tour.
    let maxD = 0;
    let turned = 0;
    let last = g.heading;
    fly(g, ap, 240, undefined, (s) => {
      maxD = Math.max(maxD, Math.hypot(s.x - meije.x, s.z - meije.z));
      turned += Math.abs(((s.heading - last + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      last = s.heading;
    });
    expect(maxD).toBeLessThan(2500);
    expect(turned).toBeGreaterThan(Math.PI);
    expect(ap.active).toBe(true);
  });

  test('un roulis manuel coupe le pilote automatique', () => {
    const ap = createAutopilot();
    setTarget(ap, meije);
    const g = createGlider({ x: 0, y: 3000, z: 0, heading: 0 });
    expect(autopilotInput(ap, g, { manual: { roll: 0, pitch: 0 }, heightAt })).not.toBeNull();
    expect(autopilotInput(ap, g, { manual: { roll: -1, pitch: 0 }, heightAt })).toBeNull();
    expect(ap.active).toBe(false);
  });

  test('hors de la zone : 60 s plus tard, cap vers le centre à 30° près', () => {
    // Au nord de la zone (45,45° N), cap au nord.
    const start = toLocal(45.45, 6.3);
    expect(inZone(start.x, start.z)).toBe(false);
    const g = createGlider({ x: start.x, y: 3000, z: start.z, heading: 0 });
    const ap = createAutopilot();
    fly(g, ap, 60);
    expect(angleTo(g, ZONE_CENTER)).toBeLessThan((30 * Math.PI) / 180);
    expect(ap.reason).toBe('bord');
  });
});

import { setAllure } from '../src/flight/glider.js';

test('en allure Voyage : ralentit à l’approche pour pouvoir tourner autour', () => {
  const g = createGlider({ x: meije.x + 30000, y: 3000, z: meije.z, heading: 0 });
  setAllure(g, 2);
  const ap = createAutopilot();
  setTarget(ap, meije);
  fly(g, ap, 400);
  expect(g.allure).toBe(1);
  let maxD = 0;
  fly(g, ap, 240, undefined, (s) => { maxD = Math.max(maxD, Math.hypot(s.x - meije.x, s.z - meije.z)); });
  expect(maxD).toBeLessThan(2500);
});

import { createGlider as makeGlider, stepGlider as step } from '../src/flight/glider.js';
import { createAutopilot as makeAp, setTarget as aim, autopilotInput as apInput } from '../src/flight/autopilot.js';

test('le pilote automatique reste calme : inclinaison ≤ 28°, assiette ≤ 9°', () => {
  const g = makeGlider({ x: 0, y: 3000, z: 0, heading: 0 });
  const ap = makeAp();
  aim(ap, { name: 'Derrière', kind: 'village', alt: null, x: 0, z: 20000 });
  const heightAt = () => 1000;
  let maxBank = 0; let maxPitch = 0;
  for (let i = 0; i < 60 * 60; i++) {
    step(g, apInput(ap, g, { manual: { roll: 0, pitch: 0 }, heightAt }), 1 / 60, heightAt);
    maxBank = Math.max(maxBank, Math.abs(g.bank));
    maxPitch = Math.max(maxPitch, Math.abs(g.pitch));
  }
  expect(maxBank).toBeLessThanOrEqual((28 * Math.PI) / 180);
  expect(maxPitch).toBeLessThanOrEqual((9 * Math.PI) / 180);
});
