// ============================================================================
// render.js shim — re-exports from scene.js so copied modules (turnManager.js)
// that import from "./render.js" work without path changes.
//   Highlights are rebuilt only when selection/reachable state changes
//   (tracked via dirty flag), NOT every frame.
// ============================================================================
import { render as sceneRender, getReachable, getSelectedUnit } from "./scene.js";
import { rebuildHighlights } from "./terrain.js";

let _lastReachableRef = null;
let _lastSelectedRef = null;

function _checkAndRebuild() {
  const r = getReachable();
  const s = getSelectedUnit();
  // Compare by reference — setReachable/setSelectedUnit always assign new values
  if (r !== _lastReachableRef || s !== _lastSelectedRef) {
    _lastReachableRef = r;
    _lastSelectedRef = s;
    rebuildHighlights(r, s);
  }
}

export function render() {
  _checkAndRebuild();
  sceneRender();
}

// Force highlight rebuild on next render (e.g. after camera rotation)
export function invalidateHighlights() {
  _lastReachableRef = null;
  _lastSelectedRef = null;
}

export {
  setSelectedUnit,
  getSelectedUnit,
  setReachable,
  getReachable,
} from "./scene.js";

// No-op: HUD is CSS-positioned in 3D version (right:12px; bottom:12px)
export function positionHUD() {}
