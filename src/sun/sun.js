// Position du soleil (algorithme NOAA), en heure légale française.
const RAD = Math.PI / 180;

/** Dernier dimanche d'un mois (1-12), jour du mois. */
const lastSunday = (year, month) => {
  const last = new Date(Date.UTC(year, month, 0));
  return last.getUTCDate() - last.getUTCDay();
};

/** Décalage de l'heure légale française sur UTC : 2 en heure d'été, 1 sinon (bascule à 1 h UTC). */
export function frenchOffsetHours(year, month, day, hour, minute = 0) {
  const t = Date.UTC(year, month - 1, day, hour, minute);
  const start = Date.UTC(year, 2, lastSunday(year, 3), 1); // 2 h locales en hiver
  const end = Date.UTC(year, 9, lastSunday(year, 10), 1); // 3 h locales en été
  // On compare en UTC estimé avec l'heure d'hiver puis d'été.
  return t - 2 * 3600e3 >= start && t - 2 * 3600e3 < end ? 2 : 1;
}

export function sunPositionUtc(date, lat = 44.91, lon = 6.30) {
  const y0 = Date.UTC(date.getUTCFullYear(), 0, 1);
  const doy = Math.floor((date.getTime() - y0) / 86400e3) + 1;
  const hourUtc = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const g = ((2 * Math.PI) / 365) * (doy - 1 + (hourUtc - 12) / 24);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const tst = hourUtc * 60 + eqt + 4 * lon; // temps solaire vrai, minutes
  const ha = (tst / 4 - 180) * RAD;
  const phi = lat * RAD;
  const el = Math.asin(Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha));
  let az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) + Math.PI;
  az %= 2 * Math.PI;
  // Repère local : x vers l'est, y vers le haut, z vers le sud.
  const dir = [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
  return { elevationDeg: el / RAD, azimuthDeg: az / RAD, dir };
}

/** {year, month (1-12), day, hour, minute} en heure légale française. */
export function sunPosition({ year, month, day, hour, minute = 0 }, lat = 44.91, lon = 6.30) {
  const off = frenchOffsetHours(year, month, day, hour, minute);
  return sunPositionUtc(new Date(Date.UTC(year, month - 1, day, hour - off, minute)), lat, lon);
}
