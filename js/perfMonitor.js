// ============================================================================
// PerfMonitor: lightweight FPS + frame-time + draw-call stats overlay.
//   Samples every 500ms, shows: FPS, frame ms, draw calls, triangles,
//   geometries, programs. No external deps.
// ============================================================================
import { getRenderer } from "./scene.js";

let overlay = null;
let frames = 0;
let lastSample = 0;
let frameTimes = [];

export function initPerfMonitor() {
  overlay = document.createElement("div");
  overlay.id = "perf-monitor";
  overlay.style.cssText = `
    position: fixed;
    top: 8px;
    right: 8px;
    font-family: monospace;
    font-size: 11px;
    color: #0f0;
    background: rgba(0,0,0,0.7);
    padding: 4px 8px;
    border-radius: 4px;
    pointer-events: none;
    z-index: 9999;
    line-height: 1.4;
    white-space: pre;
  `;
  document.body.appendChild(overlay);
  lastSample = performance.now();
}

export function updatePerfMonitor(now, frameStartMs) {
  // Only count frames that actually rendered (called from main loop after early-return)
  frames++;
  if (frameStartMs > 0) frameTimes.push(frameStartMs);
  const elapsed = now - lastSample;
  if (elapsed < 500) return;

  const fps = (frames * 1000 / elapsed).toFixed(0);
  const avgFrame = frameTimes.length > 0
    ? (frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length).toFixed(1)
    : "?";

  const renderer = getRenderer();
  let drawCalls = "?", tris = "?", geos = "?", programs = "?";
  if (renderer && renderer.info) {
    drawCalls = renderer.info.render.calls;
    tris = renderer.info.render.triangles;
    geos = renderer.info.memory.geometries;
    programs = renderer.info.programs ? renderer.info.programs.length : "?";
  }

  overlay.textContent =
    `FPS: ${fps}  frame: ${avgFrame}ms\n` +
    `draws: ${drawCalls}  tris: ${tris}\n` +
    `geos: ${geos}  programs: ${programs}`;

  frames = 0;
  frameTimes = [];
  lastSample = now;
}
