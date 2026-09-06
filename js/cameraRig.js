// ============================================================================
// CameraRig: 4-direction dock with tweened rotation.
//   Q = counterclockwise (k-1), E = clockwise (k+1)
//   azimuth(k) = -135° + k*90°  (look direction; camera sits opposite)
//   Elevation fixed ~35°, distance fixed to frame the whole map.
//   During tween: billboard rotation.y follows current azimuth; input locked.
// ============================================================================
import * as THREE from "three";
import { TILE, mapCenter } from "./world.js";
import { grid, ROWS, COLS } from "./maps.js";

// Elevation 30°: derived from GBA tile diamond 2:1 ratio (sinθ = 0.5).
const ELEV = THREE.MathUtils.degToRad(30);
const TWEEN_MS = 350;

let camera = null;
let center = null;
let distance = 0;
let dock = 0;          // 0..3 (target dock after tween)
let prevDock = 0;      // dock before rotation started (for pose hold)
let azimuth = 0;       // current rendered azimuth (radians)
let targetAzimuth = 0; // dock target
let tweenT = 1;        // 0..1 (1 = arrived)
let fromAzimuth = 0;
let isRotating = false;
let onDocked = null;   // callback when tween completes

export function initCameraRig(cam) {
  camera = cam;
  center = mapCenter(ROWS, COLS, grid);
  // Distance to frame the map: diagonal * tile / (2 * tan(fov/2)) * margin
  const diag = Math.hypot(ROWS, COLS) * TILE;
  distance = diag * 0.9;
  dock = 0;
  azimuth = targetAzimuth = THREE.MathUtils.degToRad(-135);
  fromAzimuth = azimuth;
  tweenT = 1;
  applyCamera();
}

export function getCurrentDock() { return dock; }
export function getCurrentAzimuth() { return azimuth; }
export function isCameraRotating() { return isRotating; }

// Dock to use for POSE resolution: hold the old dock until the camera
// crosses the 45° diagonal (tween midpoint), then switch once.
// Billboard rotation.y still follows azimuth every frame (not held).
export function getPoseDock() {
  return (isRotating && tweenT < 0.5) ? prevDock : dock;
}

export function rotateCW() { // E (clockwise)
  if (isRotating) return;
  prevDock = dock;
  dock = (dock + 1) % 4;
  startTween(+90);
}
export function rotateCCW() { // Q (counterclockwise)
  if (isRotating) return;
  prevDock = dock;
  dock = (dock + 3) % 4;
  startTween(-90);
}

// Incremental tween: azimuth accumulates without normalization,
// so dock 3→0 always sweeps +90° (not -270°).
function startTween(deltaDeg) {
  fromAzimuth = azimuth;
  targetAzimuth = azimuth + THREE.MathUtils.degToRad(deltaDeg);
  tweenT = 0;
  isRotating = true;
}

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function updateCameraRig(dt) {
  if (!isRotating) return;
  tweenT += dt / TWEEN_MS;
  if (tweenT >= 1) {
    tweenT = 1;
    azimuth = targetAzimuth;
    isRotating = false;
    applyCamera();
    if (onDocked) onDocked();
    return;
  }
  azimuth = fromAzimuth + (targetAzimuth - fromAzimuth) * easeInOutQuad(tweenT);
  applyCamera();
}

function applyCamera() {
  if (!camera || !center) return;
  const horiz = distance * Math.cos(ELEV);
  camera.position.set(
    center.x - horiz * Math.cos(azimuth),
    center.y + distance * Math.sin(ELEV),
    center.z - horiz * Math.sin(azimuth)
  );
  camera.lookAt(center.x, center.y, center.z);
}

export function setOnDocked(cb) { onDocked = cb; }
