// Scène : carrés de terrain synchronisés avec le gestionnaire, ciel, couleurs du soleil.
import * as THREE from 'three';
import { buildTileGeometry } from './terrainMesh.js';
import { createTerrainMaterial, orthoTexture, sharedUniforms } from './terrainMaterial.js';
import { createSky, skyUniforms } from './sky.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const mixV = (a, b, t) => a.map((x, i) => lerp(x, b[i], t));
function dropArray() { this.array = null; }

export class SceneRenderer {
  constructor(canvas, { stride = 1 } = {}) {
    this.stride = stride; // 1 = pleine finesse ; plus grand = maillage allégé (tests, petites machines)
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.85;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.add(createSky());
    this.meshes = new Map(); // clé du carré → maillage
    this.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
  }

  /**
   * Crée les maillages des nouveaux carrés (au plus `budget` par appel, pour ne pas saccader),
   * puis libère ceux qui sortent, une fois tous les nouveaux prêts : jamais de trou entre-temps.
   * Rend le nombre de carrés encore à construire.
   */
  syncTiles(visible, budget = 2) {
    const keep = new Set();
    let todo = 0;
    for (const t of visible) {
      keep.add(t.key);
      if (this.meshes.has(t.key)) continue;
      if (budget-- <= 0) { todo++; continue; }
      const tex = t.ortho ? orthoTexture(t.ortho, this.anisotropy) : null;
      const geometry = buildTileGeometry(t, this.stride);
      // Une fois envoyés à la carte graphique, les sommets n'ont plus besoin d'une copie en mémoire.
      for (const name of ['position', 'normal', 'uv']) geometry.getAttribute(name).onUpload(dropArray);
      const mesh = new THREE.Mesh(geometry, createTerrainMaterial(tex));
      mesh.userData.texture = tex;
      this.scene.add(mesh);
      this.meshes.set(t.key, mesh);
    }
    if (todo > 0) return todo;
    for (const [key, mesh] of this.meshes) {
      if (keep.has(key)) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.userData.texture?.dispose();
      this.meshes.delete(key);
    }
    return 0;
  }

  /** dir : direction du soleil dans le repère local (x est, y haut, z sud). */
  setSun(dir) {
    const v = new THREE.Vector3(...dir).normalize();
    const e = (Math.asin(clamp(v.y, -1, 1)) * 180) / Math.PI;
    const day = clamp((e + 3) / 22, 0, 1);
    const warm = clamp(1 - Math.abs(e - 3) / 12, 0, 1);
    let zen = mixV([0.006, 0.009, 0.022], [0.07, 0.17, 0.48], day);
    let hor = mixV([0.02, 0.025, 0.045], [0.42, 0.55, 0.74], day);
    hor = mixV(hor, [0.95, 0.52, 0.26], warm * 0.55);
    zen = mixV(zen, [0.18, 0.16, 0.3], warm * 0.25);
    const sunAmt = clamp((e + 1) / 5, 0, 1) * 2.4;
    const tint = mixV([1.0, 0.42, 0.14], [1.0, 0.96, 0.9], clamp((e - 1) / 22, 0, 1)).map((x) => x * sunAmt);
    for (const u of [sharedUniforms, skyUniforms]) {
      u.uSun.value.copy(v);
      u.uSunCol.value.set(...tint);
      u.uFogCol.value.set(...hor.map((x) => x * 0.92));
    }
    skyUniforms.uZen.value.set(...zen);
    skyUniforms.uHor.value.set(...hor);
    sharedUniforms.uAmb.value.set(...mixV(hor, zen, 0.5).map((x) => x * 0.95));
    this.renderer.toneMappingExposure = lerp(1.5, 0.8, day);
  }

  render(camera) {
    sharedUniforms.uCam.value.copy(camera.position);
    this.renderer.render(this.scene, camera);
  }
}
