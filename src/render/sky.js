// Ciel en dégradé, halo et disque solaire (repris du prototype).
import * as THREE from 'three';

export const skyUniforms = {
  uSun: { value: new THREE.Vector3(0, 1, 0) },
  uSunCol: { value: new THREE.Vector3(2.4, 2.3, 2.15) },
  uZen: { value: new THREE.Vector3(0.07, 0.17, 0.48) },
  uHor: { value: new THREE.Vector3(0.42, 0.55, 0.74) },
  uFogCol: { value: new THREE.Vector3(0.39, 0.5, 0.68) },
};

export function createSky() {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      uniforms: skyUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          // Rotation seule : le ciel est à l'infini.
          vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun, uSunCol, uZen, uHor, uFogCol;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float y = max(d.y, 0.0);
          vec3 col = mix(uHor, uZen, pow(y, 0.45));
          float mu = max(dot(d, uSun), 0.0);
          col += uSunCol * (pow(mu, 10.0) * 0.18 + pow(mu, 300.0) * 1.2) * (1.0 - y * 0.5);
          col += uSunCol * smoothstep(0.99985, 0.99993, mu) * 30.0;
          if (d.y < 0.0) col = mix(uHor, uFogCol, min(-d.y * 8.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
}
