// Projection conique conforme de Lambert-93 (RGF93 / GRS80), formules IGN.
const A = 6378137;
const F = 1 / 298.257222101;
const E2 = 2 * F - F * F;
const E = Math.sqrt(E2);
const RAD = Math.PI / 180;
const LAT1 = 49 * RAD;
const LAT2 = 44 * RAD;
const LAT0 = 46.5 * RAD;
const LON0 = 3 * RAD;
const X0 = 700000;
const Y0 = 6600000;

const m = (phi) => Math.cos(phi) / Math.sqrt(1 - E2 * Math.sin(phi) ** 2);
// Latitude isométrique, sous forme exponentielle t(φ).
const t = (phi) => {
  const s = E * Math.sin(phi);
  return Math.tan(Math.PI / 4 - phi / 2) / ((1 - s) / (1 + s)) ** (E / 2);
};

const N = (Math.log(m(LAT1)) - Math.log(m(LAT2))) / (Math.log(t(LAT1)) - Math.log(t(LAT2)));
const C = (A * m(LAT1)) / (N * t(LAT1) ** N);
const R0 = C * t(LAT0) ** N;

/** (lat, lon) en degrés → [E, N] en mètres Lambert-93. */
export function toL93(lat, lon) {
  const r = C * t(lat * RAD) ** N;
  const g = N * (lon * RAD - LON0);
  return [X0 + r * Math.sin(g), Y0 + R0 - r * Math.cos(g)];
}

/** [E, N] Lambert-93 → [lat, lon] en degrés (itération sur la latitude isométrique). */
export function fromL93(x, y) {
  const dx = x - X0;
  const dy = R0 - (y - Y0);
  const r = Math.hypot(dx, dy);
  const g = Math.atan2(dx, dy);
  const tt = (r / C) ** (1 / N);
  let phi = Math.PI / 2 - 2 * Math.atan(tt);
  for (let i = 0; i < 20; i++) {
    const s = E * Math.sin(phi);
    const next = Math.PI / 2 - 2 * Math.atan(tt * ((1 - s) / (1 + s)) ** (E / 2));
    if (Math.abs(next - phi) < 1e-14) { phi = next; break; }
    phi = next;
  }
  return [phi / RAD, (LON0 + g / N) / RAD];
}
