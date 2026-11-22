// Web Worker : téléchargement et décodage du relief (BIL) et des orthophotos hors du fil principal.
import { IgnSource } from './sources/ign.js';
import { cachingFetch, limitFetch } from './cache.js';

// Une seule limite pour toutes les requêtes IGN de la page (relief, orthophoto, tuiles WMTS).
const net = cachingFetch(limitFetch(fetch.bind(self), 6));

let source = new IgnSource({ fetch: net });
const controllers = new Map();

self.onmessage = async ({ data }) => {
  const { id, kind } = data;
  if (kind === 'abort') { controllers.get(id)?.abort(); return; }
  if (kind === 'config') { source = new IgnSource({ fetch: net, orthoMode: data.orthoMode }); return; }
  const ctrl = new AbortController();
  controllers.set(id, ctrl);
  try {
    if (kind === 'elevation') {
      const r = await source.getElevation(data.bbox, data.n, ctrl.signal);
      self.postMessage({ id, ok: true, value: r }, [r.heights.buffer]);
    } else {
      const bmp = await source.getOrtho(data.bbox, data.px, ctrl.signal);
      self.postMessage({ id, ok: true, value: bmp }, [bmp]);
    }
  } catch (e) {
    self.postMessage({ id, ok: false, name: e?.name, message: String(e?.message || e) });
  } finally {
    controllers.delete(id);
  }
};
