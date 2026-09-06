// ============================================================================
// Clouds: soft drifting cloud puffs that sell the "sky island" setting.
//   Procedural canvas texture (overlapping radial-gradient blobs), one
//   PlaneGeometry mesh per cloud whose quaternion is copied from the camera
//   each frame so it always faces the view (same visual as THREE.Sprite, but
//   with predictable sizing under the orthographic camera).
//   Clouds are world-anchored, so Q/E camera rotation produces parallax.
//   Motion is a slow bob + gentle horizontal sway (sine-based, no wrapping).
// ============================================================================
import * as THREE from "three";
import { ROWS, COLS } from "./maps.js";
import { getCamera } from "./scene.js";

const clouds = [];   // { mesh, homeX, homeZ, baseY, phase, bobAmp, speed, driftAmp }
let cloudGroup = null;

// deterministic RNG so the sky looks the same every run
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// soft puff: overlapping radial-gradient blobs on a 256x128 canvas
function makeCloudTexture(rand) {
  const W = 256, H = 128;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const blobs = 6 + Math.floor(rand() * 3);
  for (let i = 0; i < blobs; i++) {
    const x = 48 + rand() * (W - 96);
    const y = 48 + rand() * (H - 80);
    const r = 20 + rand() * 30;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.7, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildClouds(scene) {
  clearClouds(scene);
  cloudGroup = new THREE.Group();
  const rand = mulberry32(20260906);
  const cx = (COLS - 1) / 2, cz = (ROWS - 1) / 2;

  // A ring of clouds below the island (the "sea of clouds") plus two
  // distant high ones for depth. Angles/radii are relative to map center.
  const defs = [
    { ang: 0.4, rad: 13, y: -4.5, w: 11 },
    { ang: 1.6, rad: 16, y: -6.0, w: 14 },
    { ang: 2.8, rad: 12, y: -3.5, w: 9 },
    { ang: 4.1, rad: 17, y: -5.0, w: 12 },
    { ang: 5.3, rad: 14, y: -7.0, w: 10 },
    { ang: 3.6, rad: 26, y: 2.0,  w: 16 },
    { ang: 0.9, rad: 28, y: 4.0,  w: 13 },
  ];
  for (const d of defs) {
    const mat = new THREE.MeshBasicMaterial({
      map: makeCloudTexture(rand),
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.w * 0.42), mat);
    const homeX = cx + Math.cos(d.ang) * d.rad;
    const homeZ = cz + Math.sin(d.ang) * d.rad;
    mesh.position.set(homeX, d.y, homeZ);
    mesh.renderOrder = -1; // behind other transparents (highlights, popups)
    cloudGroup.add(mesh);
    clouds.push({
      mesh, homeX, homeZ, baseY: d.y,
      phase: rand() * Math.PI * 2,
      bobAmp: 0.15 + rand() * 0.2,
      speed: 0.12 + rand() * 0.1,
      driftAmp: 1.0 + rand() * 1.5,
    });
  }
  scene.add(cloudGroup);
}

// Per-frame: face the camera, bob vertically, sway horizontally.
export function updateClouds() {
  if (!cloudGroup) return;
  const cam = getCamera();
  if (!cam) return;
  const t = performance.now() / 1000;
  for (const c of clouds) {
    c.mesh.position.y = c.baseY + Math.sin(t * c.speed + c.phase) * c.bobAmp;
    c.mesh.position.x = c.homeX + Math.sin(t * c.speed * 0.6 + c.phase * 1.7) * c.driftAmp;
    c.mesh.quaternion.copy(cam.quaternion);
  }
}

export function clearClouds(scene) {
  if (cloudGroup && scene) scene.remove(cloudGroup);
  for (const c of clouds) {
    c.mesh.geometry.dispose();
    c.mesh.material.map.dispose();
    c.mesh.material.dispose();
  }
  clouds.length = 0;
  cloudGroup = null;
}
