// ============================================================================
// FX: damage popups (HTML overlay following world positions via worldToScreen).
//   Replaces the canvas-based popup system from render.js.
//   Each popup: { x, y, text, t (0..1), color, el }
// ============================================================================
import { worldToScreen } from "./scene.js";

const popups = [];
const popupLayer = () => document.getElementById("popup-layer");

export function spawnPopup(sx, sy, text, color = "#ff4444") {
  const el = document.createElement("div");
  el.style.cssText = `
    position: absolute;
    font-weight: bold;
    font-size: 18px;
    color: ${color};
    text-shadow: 0 0 3px #000, 0 0 3px #000, 0 0 3px #000;
    pointer-events: none;
    transform: translate(-50%, -50%);
    transition: none;
  `;
  el.textContent = text;
  popupLayer()?.appendChild(el);
  popups.push({ sx, sy, text, t: 0, color, el });
}

export function updatePopups(dt) {
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.t += dt / 800; // 800ms lifetime
    if (p.t >= 1) {
      p.el.remove();
      popups.splice(i, 1);
      continue;
    }
    // Rise and fade
    const rise = -40 * p.t;
    const alpha = 1 - p.t;
    const scale = 1 + p.t * 0.3;
    p.el.style.left = p.sx + "px";
    p.el.style.top = (p.sy + rise) + "px";
    p.el.style.opacity = alpha;
    p.el.style.fontSize = `${Math.round(18 * scale)}px`;
  }
}

export function clearPopups() {
  for (const p of popups) p.el.remove();
  popups.length = 0;
}
