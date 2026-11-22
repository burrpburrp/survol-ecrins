import { expect, test } from 'vitest';
import { decodeBil, isMissing } from '../src/tiles/bil.js';

test('decodeBil lit des flottants little-endian', () => {
  const buf = new ArrayBuffer(16);
  const v = new DataView(buf);
  [1, 2, 3, 4].forEach((x, i) => v.setFloat32(i * 4, x, true));
  expect(Array.from(decodeBil(buf, 2))).toEqual([1, 2, 3, 4]);
});

test('decodeBil rejette une taille inattendue', () => {
  expect(decodeBil(new ArrayBuffer(15), 2)).toBeNull();
});

test('isMissing', () => {
  expect(isMissing(-99999)).toBe(true);
  expect(isMissing(-500)).toBe(true);
  expect(isMissing(NaN)).toBe(true);
  expect(isMissing(Infinity)).toBe(true);
  expect(isMissing(-499)).toBe(false);
  expect(isMissing(3981.8)).toBe(false);
});
