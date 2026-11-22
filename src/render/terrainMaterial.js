// Matériau du terrain : orthophoto, éclairage de Lambert par le soleil, ciel ambiant, brume d'altitude.
import * as THREE from 'three';

/** Uniformes partagés par tous les carrés (le soleil, la brume, la caméra). */
export const sharedUniforms = {
  uSun: { value: new THREE.Vector3(0, 1, 0) },
  uSunCol: { value: new THREE.Vector3(2.4, 2.3, 2.15) },
  uAmb: { value: new THREE.Vector3(0.3, 0.38, 0.5) },
  uFogCol: { value: new THREE.Vector3(0.45, 0.55, 0.7) },
  uFogDen: { value: 1 / 70000 },
  uCam: { value: new THREE.Vector3() },
};

const vertexShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
varying vec3 vW;
varying vec3 vN;
void main() {
  vUv = uv;
  vN = normal;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;

const fragmentShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uOrtho;
uniform vec3 uSun, uSunCol, uAmb, uFogCol, uCam;
uniform float uFogDen;
varying vec2 vUv;
varying vec3 vW;
varying vec3 vN;
void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vN);
  vec3 c = texture2D(uOrtho, vUv).rgb * 0.95;
  float ndl = max(dot(n, uSun), 0.0);
  vec3 col = c * (uSunCol * ndl + uAmb * (0.55 + 0.45 * n.y));
  // Perspective aérienne : l'air est plus fin en altitude (échelle de hauteur 7 500 m).
  vec3 V = uCam - vW;
  float dist = length(V);
  float h1 = max(vW.y, 0.0), h2 = max(uCam.y, 0.0), Hs = 7500.0, dh = h2 - h1;
  float avg = abs(dh) > 1.0 ? Hs * (exp(-h1 / Hs) - exp(-h2 / Hs)) / dh : exp(-h1 / Hs);
  float f = 1.0 - exp(-dist * uFogDen * avg * 2.2);
  vec3 fc = uFogCol + uSunCol * 0.10 * pow(max(dot(-V / max(dist, 1.0), uSun), 0.0), 6.0);
  gl_FragColor = vec4(mix(col, fc, f), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

let grey = null;
/** Texture neutre en attendant l'orthophoto. */
function placeholder() {
  if (!grey) {
    grey = new THREE.DataTexture(new Uint8Array([118, 112, 104, 255]), 1, 1);
    grey.colorSpace = THREE.SRGBColorSpace;
    grey.needsUpdate = true;
  }
  return grey;
}

export function createTerrainMaterial(orthoTexture = null) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { ...sharedUniforms, uOrtho: { value: orthoTexture ?? placeholder() } },
  });
}

/** Texture WebGL à partir de l'ImageBitmap de l'orthophoto (ligne 0 au nord). */
export function orthoTexture(bitmap, anisotropy = 8) {
  const t = new THREE.Texture(bitmap);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}
