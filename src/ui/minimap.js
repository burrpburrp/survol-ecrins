// Carte IGN dans un coin (touche m) : planeur au centre, nord en haut, destination et distance.
import { toLatLon } from '../geo/frame.js';
import { mercatorPixel } from '../tiles/sources/wmts.js';

const TILE = 256;

export function planUrl(z, col, row) {
  const p = new URLSearchParams({
    SERVICE: 'WMTS', REQUEST: 'GetTile', VERSION: '1.0.0', LAYER: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', STYLE: 'normal',
    TILEMATRIXSET: 'PM', TILEMATRIX: String(z), TILEROW: String(row), TILECOL: String(col), FORMAT: 'image/png',
  });
  return `https://data.geopf.fr/wmts?${p}`;
}

export function formatKm(m) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`;
}

const pixelOf = (p, z) => {
  const { lat, lon } = toLatLon(p.x, p.z);
  return mercatorPixel(lat, lon, z);
};

// Ce qu'il faut dessiner, en pixels de la carte (size × size).
export function mapLayout({ glider, target, z, size }) {
  const [gx, gy] = pixelOf(glider, z);
  const left = gx - size / 2;
  const top = gy - size / 2;
  const tiles = [];
  for (let row = Math.floor(top / TILE); row <= Math.floor((top + size) / TILE); row++) {
    for (let col = Math.floor(left / TILE); col <= Math.floor((left + size) / TILE); col++) {
      tiles.push({ z, col, row, url: planUrl(z, col, row), dx: col * TILE - left, dy: row * TILE - top });
    }
  }
  let t = null;
  if (target) {
    const [tx, ty] = pixelOf(target, z);
    let sx = tx - left;
    let sy = ty - top;
    const m = 14; // marge : une destination hors carte est posée au bord, dans sa direction
    const inside = sx >= m && sx <= size - m && sy >= m && sy <= size - m;
    if (!inside) {
      const c = size / 2;
      const k = (c - m) / Math.max(Math.abs(sx - c), Math.abs(sy - c));
      sx = c + (sx - c) * k;
      sy = c + (sy - c) * k;
    }
    t = { sx, sy, inside };
  }
  return { glider: { sx: size / 2, sy: size / 2 }, target: t, tiles };
}

export function createMinimap(canvas, { z = 11 } = {}) {
  const size = canvas.width;
  const ctx = canvas.getContext('2d');
  const images = new Map();
  const image = (t) => {
    const key = `${t.z}/${t.col}/${t.row}`;
    let img = images.get(key);
    if (!img) {
      img = new Image();
      img.src = t.url;
      images.set(key, img);
      if (images.size > 200) images.delete(images.keys().next().value);
    }
    return img;
  };
  return {
    draw({ glider, target, distance }) {
      const m = mapLayout({ glider, target, z, size });
      ctx.fillStyle = '#e8e4d8';
      ctx.fillRect(0, 0, size, size);
      for (const t of m.tiles) {
        const img = image(t);
        if (img.complete && img.naturalWidth) ctx.drawImage(img, Math.round(t.dx), Math.round(t.dy));
      }
      if (m.target) {
        ctx.strokeStyle = 'rgba(200, 30, 30, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(m.glider.sx, m.glider.sy);
        ctx.lineTo(m.target.sx, m.target.sy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#c81e1e';
        ctx.beginPath();
        ctx.arc(m.target.sx, m.target.sy, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      // Le planeur : une flèche qui montre le cap.
      ctx.save();
      ctx.translate(m.glider.sx, m.glider.sy);
      ctx.rotate(glider.heading);
      ctx.fillStyle = '#1f5fd0';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -14); ctx.lineTo(10, 10); ctx.lineTo(0, 5); ctx.lineTo(-10, 10); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
      if (target) {
        ctx.font = '600 15px system-ui, sans-serif';
        const text = `${target.name} : ${formatKm(distance)}`;
        ctx.fillStyle = 'rgba(8, 14, 24, 0.72)';
        ctx.fillRect(0, size - 26, size, 26);
        ctx.fillStyle = '#fff';
        ctx.fillText(text, 8, size - 8, size - 16);
      }
    },
  };
}
