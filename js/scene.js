// ============================================================================
// Scene: renderer, scene graph, lights, camera, render loop entry,
//   selection/reachable state holders (replaces demos/js/render.js).
// ============================================================================
import * as THREE from "three";
import { TILE, H_UNIT, worldFromTile, mapCenter } from "./world.js";
import { grid, ROWS, COLS, currentTerrain } from "./maps.js";
import { themeFor } from "../shared/config.js";

// --- Renderer / scene / camera ---
let renderer = null;
let scene = null;
let camera = null;
let canvasEl = null;

// --- Selection state (same role as old render.js module-level vars) ---
let _selectedUnit = null;
let _reachable = new Map();

export function getSelectedUnit() { return _selectedUnit; }
export function setSelectedUnit(u) { _selectedUnit = u; }
export function getReachable() { return _reachable; }
export function setReachable(m) { _reachable = m; }

export function getRenderer() { return renderer; }
export function getScene() { return scene; }
export function getCamera() { return camera; }
export function getCanvas() { return canvasEl; }

// 2×512 vertical gradient as scene.background (stretched to the canvas).
function makeSkyTexture() {
  const c = document.createElement("canvas");
  c.width = 2;
  c.height = 512;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#2f6fd0");   // zenith
  g.addColorStop(0.55, "#7db8ea");
  g.addColorStop(1, "#e8f6ff");   // horizon haze
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- Init ---
export function initScene(canvas) {
  canvasEl = canvas;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  // Sky-island backdrop: vertical gradient (zenith blue → warm horizon).
  // A screen-space CanvasTexture is enough here — the orthographic camera
  // has a fixed 30° elevation, so the horizon never moves on screen.
  scene.background = makeSkyTexture();
  // No fog: it tints the BG-textured terrain (MeshBasicMaterial) toward the
  // fog color, which fought the sky. Depth cueing comes from the cloud layer.

  // Orthographic camera: GBA original is ortho (no perspective distortion).
  // Frustum half-height sized from map diagonal; updated on resize.
  const diag = Math.hypot(ROWS, COLS) * TILE;
  const frustumHalfH = diag * 0.6;
  camera = new THREE.OrthographicCamera(
    -frustumHalfH, frustumHalfH, frustumHalfH, -frustumHalfH, 0.1, 200
  );
  camera._frustumHalfH = frustumHalfH;

  // Lights — tuned for BG-textured terrain.
  // BG pixels carry baked-in shading (NW light, SE shadows), so dynamic light
  // only does two things: cast unit shadows and give slight 3D form.
  // Directional light from straight above → unit shadows fall at their feet
  // (matches the snowball-fight map's overhead light). Total intensity ~1.0
  // so the texture is neither darkened nor brightened.
  //   top face: ambient(0.6) + dir(0.4)*NdotL(1.0) = 1.0
  //   side face: ambient(0.6) + dir(0.4)*NdotL(~0) = 0.6  (slight form)
  //   shadowed: ambient(0.6)                          = 0.6
  const hemi = new THREE.HemisphereLight(0xffffff, 0xeef3fb, 0.0);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 0.4);
  dir.castShadow = true;
  dir.shadow.mapSize.width = 1024;
  dir.shadow.mapSize.height = 1024;
  dir.shadow.camera.near = 0.5;
  dir.shadow.camera.far = 50;
  const span = Math.max(ROWS, COLS) * TILE;
  dir.shadow.camera.left = -span;
  dir.shadow.camera.right = span;
  dir.shadow.camera.top = span;
  dir.shadow.camera.bottom = -span;
  dir.shadow.bias = -0.0005;
  dir.shadow.normalBias = 0.03; // stabilize contact shadows for billboard feet
  // Sun directly overhead (shadows land at unit feet); slight offset avoids
  // degenerate shadow matrix for perfectly vertical rays.
  const center = mapCenter(ROWS, COLS, grid);
  dir.position.set(center.x, center.y + span * 1.5, center.z + 0.01);
  dir.target.position.set(center.x, center.y, center.z);
  scene.add(dir);
  scene.add(dir.target);

  // Ambient fills side faces so BG texture isn't crushed on non-lit faces.
  const amb = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(amb);

  resizeRenderer();
  window.addEventListener("resize", resizeRenderer);
  // Debug exposure
  window.__scene = scene;
  window.__camera = camera;
  window.__renderer = renderer;
  return { renderer, scene, camera };
}

export function resizeRenderer() {
  if (!renderer || !canvasEl) return;
  const w = canvasEl.clientWidth || window.innerWidth;
  const h = canvasEl.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  // Orthographic: adjust left/right from aspect ratio
  const halfH = camera._frustumHalfH;
  const aspect = w / h;
  camera.left = -halfH * aspect;
  camera.right = halfH * aspect;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.updateProjectionMatrix();
}

// --- World to screen projection (for HUD overlays) ---
export function worldToScreen(x, y, z) {
  if (!camera || !renderer) return { sx: 0, sy: 0 };
  const v = new THREE.Vector3(x, y, z);
  v.project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  return {
    sx: (v.x * 0.5 + 0.5) * rect.width + rect.left,
    sy: (-v.y * 0.5 + 0.5) * rect.height + rect.top,
  };
}

// --- Render one frame ---
export function render() {
  if (!renderer || !scene || !camera) return;
  renderer.render(scene, camera);
}

// Re-export terrain theme for convenience
export { themeFor };
