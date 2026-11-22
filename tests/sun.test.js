import { describe, expect, test } from 'vitest';
import { sunPosition, sunPositionUtc, frenchOffsetHours } from '../src/sun/sun.js';

describe('soleil', () => {
  test('scène Sentinel-2 du 8 août 2025 à 12 h 39', () => {
    const s = sunPosition({ year: 2025, month: 8, day: 8, hour: 12, minute: 39 });
    expect(Math.abs(s.azimuthDeg - 150.6)).toBeLessThan(1);
    expect(Math.abs(s.elevationDeg - 58.5)).toBeLessThan(1);
  });

  test('21 décembre à 12 h 30 : entre 21° et 23°', () => {
    const s = sunPosition({ year: 2025, month: 12, day: 21, hour: 12, minute: 30 });
    expect(s.elevationDeg).toBeGreaterThan(21);
    expect(s.elevationDeg).toBeLessThan(23);
  });

  test('30 mars 2025 à 13 h 30 : heure d’été, comme 11 h 30 UTC', () => {
    const s = sunPosition({ year: 2025, month: 3, day: 30, hour: 13, minute: 30 });
    const u = sunPositionUtc(new Date(Date.UTC(2025, 2, 30, 11, 30)));
    expect(s.elevationDeg).toBeCloseTo(u.elevationDeg, 6);
    expect(s.azimuthDeg).toBeCloseTo(u.azimuthDeg, 6);
  });

  test('changements d’heure', () => {
    expect(frenchOffsetHours(2025, 3, 29, 12)).toBe(1);
    expect(frenchOffsetHours(2025, 3, 30, 12)).toBe(2);
    expect(frenchOffsetHours(2025, 10, 25, 12)).toBe(2);
    expect(frenchOffsetHours(2025, 10, 26, 12)).toBe(1);
    expect(frenchOffsetHours(2026, 3, 29, 12)).toBe(2);
  });

  test('dir normalisé, dir[1] > 0 si et seulement si le soleil est levé', () => {
    for (const hour of [3, 6, 9, 12, 15, 18, 21]) {
      const s = sunPosition({ year: 2025, month: 6, day: 21, hour, minute: 0 });
      expect(Math.hypot(...s.dir)).toBeCloseTo(1, 9);
      expect(s.dir[1] > 0).toBe(s.elevationDeg > 0);
    }
  });

  test('dir : le soleil de midi est au sud (z positif)', () => {
    const s = sunPosition({ year: 2025, month: 12, day: 21, hour: 12, minute: 30 });
    expect(s.dir[2]).toBeGreaterThan(0.8 * Math.cos((s.elevationDeg * Math.PI) / 180));
  });
});
