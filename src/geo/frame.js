// Repère 3D local : x = E − 962000, z = −(N − 6439000), y = altitude.
import { toL93, fromL93 } from './lambert93.js';

export const ROOT = { cx: 962000, cy: 6439000, size: 131072 };
export const ZONE = { latMin: 44.6, latMax: 45.4, lonMin: 5.8, lonMax: 6.85 };

export const l93ToLocal = (e, n) => ({ x: e - ROOT.cx, z: -(n - ROOT.cy) });
export const localToL93 = (x, z) => [x + ROOT.cx, ROOT.cy - z];

export function toLocal(lat, lon) {
  return l93ToLocal(...toL93(lat, lon));
}

export function toLatLon(x, z) {
  const [lat, lon] = fromL93(...localToL93(x, z));
  return { lat, lon };
}

export function inZone(x, z) {
  const { lat, lon } = toLatLon(x, z);
  return lat >= ZONE.latMin && lat <= ZONE.latMax && lon >= ZONE.lonMin && lon <= ZONE.lonMax;
}
