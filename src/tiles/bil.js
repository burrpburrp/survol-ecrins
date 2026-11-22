// Décodage des grilles d'altitude BIL 32 bits renvoyées par le WMS-R de l'IGN.

/** Valeur d'altitude absente : « pas de données » (−99999) ou valeur non finie. */
export const isMissing = (v) => !Number.isFinite(v) || v <= -500;

/** Tampon de n × n flottants little-endian → Float32Array, ou null si la taille ne correspond pas. */
export function decodeBil(buffer, n) {
  if (!buffer || buffer.byteLength !== n * n * 4) return null;
  const view = new DataView(buffer);
  const out = new Float32Array(n * n);
  for (let i = 0; i < out.length; i++) out[i] = view.getFloat32(i * 4, true);
  return out;
}
