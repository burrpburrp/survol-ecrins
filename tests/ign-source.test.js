import { describe, expect, test } from 'vitest';
import { IgnSource } from '../src/tiles/sources/ign.js';

const MNS = 'IGNF_LIDAR-HD_MNS_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93';
const MNT = 'IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93';
const N = 4;

function bil(values) {
  const buf = new ArrayBuffer(values.length * 4);
  const v = new DataView(buf);
  values.forEach((x, i) => v.setFloat32(i * 4, x, true));
  return buf;
}
const ok = (buf, type = 'image/x-bil;bits=32') => ({
  ok: true, status: 200, headers: new Headers({ 'content-type': type }), arrayBuffer: async () => buf,
});
const xmlError = () => ok(new TextEncoder().encode('<?xml version="1.0"?><ServiceExceptionReport/>').buffer, 'text/xml');
const fail = (status) => ({ ok: false, status, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0) });

/** fetch simulé : une réponse par couche, d'après le paramètre LAYERS. */
function fakeFetch(byLayer) {
  const calls = [];
  const f = async (url, opts) => {
    calls.push({ url, opts });
    const layer = new URL(url).searchParams.get('LAYERS');
    const r = byLayer[layer];
    if (!r) return fail(404);
    return typeof r === 'function' ? r() : r;
  };
  f.calls = calls;
  return f;
}

describe('IgnSource', () => {
  test('elevationUrl', () => {
    const url = new IgnSource({ fetch: () => {} }).elevationUrl(MNS, [960000, 6438000, 960256, 6438256], 257);
    expect(url.startsWith('https://data.geopf.fr/wms-r/wms?')).toBe(true);
    expect(url).toContain(`LAYERS=${MNS}`);
    expect(url).toContain('CRS=EPSG%3A2154');
    expect(url).toContain('FORMAT=image%2Fx-bil%3Bbits%3D32');
    expect(url).toContain('WIDTH=257');
    expect(url).toContain('HEIGHT=257');
    expect(url).toContain('BBOX=960000%2C6438000%2C960256%2C6438256');
  });

  test('orthoUrl', () => {
    const url = new IgnSource({ fetch: () => {} }).orthoUrl([1, 2, 3, 4], 512);
    expect(url).toContain('LAYERS=ORTHOIMAGERY.ORTHOPHOTOS');
    expect(url).toContain('FORMAT=image%2Fjpeg');
    expect(url).toContain('WIDTH=512');
  });

  test('200 avec XML d’erreur : passe au MNT', async () => {
    const heights = Array.from({ length: N * N }, (_, i) => 1000 + i);
    const src = new IgnSource({ fetch: fakeFetch({ [MNS]: xmlError, [MNT]: () => ok(bil(heights)) }) });
    const r = await src.getElevation([0, 0, 1, 1], N);
    expect(Array.from(r.heights)).toEqual(heights);
    expect(r.layers).toEqual(['MNT']);
  });

  test('corps de mauvaise taille : passe au MNT', async () => {
    const heights = new Array(N * N).fill(2000);
    const src = new IgnSource({ fetch: fakeFetch({ [MNS]: () => ok(new ArrayBuffer(10)), [MNT]: () => ok(bil(heights)) }) });
    const r = await src.getElevation([0, 0, 1, 1], N);
    expect(r.layers).toEqual(['MNT']);
  });

  test('MNS à moitié vide : trous bouchés par le MNT, échantillon par échantillon', async () => {
    const mns = Array.from({ length: N * N }, (_, i) => (i < 8 ? -99999 : 3000 + i));
    const mnt = new Array(N * N).fill(2500);
    const f = fakeFetch({ [MNS]: () => ok(bil(mns)), [MNT]: () => ok(bil(mnt)) });
    const r = await new IgnSource({ fetch: f }).getElevation([0, 0, 1, 1], N);
    const h = Array.from(r.heights);
    expect(h.some((v) => v <= -500)).toBe(false);
    expect(h.slice(0, 8)).toEqual(new Array(8).fill(2500));
    expect(h.slice(8)).toEqual(mns.slice(8));
    expect(r.layers).toEqual(['MNS', 'MNT']);
  });

  test('MNS complet : une seule requête', async () => {
    const f = fakeFetch({ [MNS]: () => ok(bil(new Array(N * N).fill(1))) });
    const r = await new IgnSource({ fetch: f }).getElevation([0, 0, 1, 1], N);
    expect(r.layers).toEqual(['MNS']);
    expect(f.calls.length).toBe(1);
  });

  test('les trois couches échouent : « relief indisponible »', async () => {
    const src = new IgnSource({ fetch: fakeFetch({}) });
    await expect(src.getElevation([0, 0, 1, 1], N)).rejects.toThrow(/relief indisponible/);
  });

  test('réseau coupé sur toutes les couches : « relief indisponible »', async () => {
    const src = new IgnSource({ fetch: async () => { throw new TypeError('Failed to fetch'); } });
    await expect(src.getElevation([0, 0, 1, 1], N)).rejects.toThrow(/relief indisponible/);
  });

  test('trous restant partout (hors de France) : bouchés par la valeur voisine', async () => {
    const vals = Array.from({ length: N * N }, (_, i) => (i % N === N - 1 ? -99999 : 1500));
    const allEmptyRight = () => ok(bil(vals));
    const f = fakeFetch({
      [MNS]: allEmptyRight, [MNT]: allEmptyRight, 'ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES': allEmptyRight,
    });
    const r = await new IgnSource({ fetch: f }).getElevation([0, 0, 1, 1], N);
    expect(Array.from(r.heights).every((v) => v === 1500)).toBe(true);
  });

  test('annulation : l’AbortError remonte sans essayer les autres couches', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const f = async (url, opts) => {
      f.n = (f.n || 0) + 1;
      if (opts?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      return fail(500);
    };
    await expect(new IgnSource({ fetch: f }).getElevation([0, 0, 1, 1], N, ctrl.signal)).rejects.toThrow(/aborted/);
    expect(f.n).toBe(1);
  });
});

describe('mesures', () => {
  test('stats : nombre et durée des requêtes de relief', async () => {
    let t = 1000;
    const src = new IgnSource({
      fetch: fakeFetch({ [MNS]: () => ok(bil(new Array(N * N).fill(1))) }),
      now: () => (t += 250),
    });
    await src.getElevation([0, 0, 1, 1], N);
    await src.getElevation([0, 0, 1, 1], N);
    expect(src.stats.elevation.count).toBe(2);
    expect(src.stats.elevation.totalMs).toBe(500);
  });

  test('mode d’orthophoto par défaut : wms', () => {
    expect(new IgnSource({ fetch: () => {} }).orthoMode).toBe('wms');
    expect(new IgnSource({ fetch: () => {}, orthoMode: 'wmts' }).orthoMode).toBe('wmts');
  });
});
