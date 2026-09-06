// ============================================================================
// Map state: BG paths + map selector UI (3D-specific)
// Core grid/ROWS/COLS/switchMap live in shared/maps.js (generated).
// ============================================================================
import {
  MAPS, currentMapId, MAP_DATA, grid, ROWS, COLS, currentTerrain,
  switchMap as _switchMap, getMapIds,
} from "../shared/maps.js";
import { t } from "../shared/i18n.js";

// Re-export for demo modules that import from "./maps.js"
export { currentMapId, MAP_DATA, grid, ROWS, COLS, currentTerrain, getMapIds };

// Human-readable labels for known maps (optional; falls back to index).
// Resolved at call time so the label follows the active i18n locale.
const MAP_LABEL_KEYS = {
  0: "map.0",
  74: "map.74",
};

export let bgImagePath = getBgPath(currentMapId);
export let bgBottomPath = getBgBottomPath(currentMapId);
export let bgTopPath = getBgTopPath(currentMapId);

// BG images are pre-extracted to demos/data/map_XXX_bg.png (shared with 2D demo).
// Only maps with extracted BGs get a path; others return null (flat-color path).
// Layered variants (_top / _bottom) are produced by `extract_map_bg.py --layers`.
// NOTE: paths are relative to the HTML page (demos/3d/index.html), not the JS file.
function getBgPath(id) {
  const known = [0]; // add map indices as BGs are extracted
  return known.includes(id) ? `data/map_${String(id).padStart(3, "0")}_bg.png` : null;
}
function getBgBottomPath(id) {
  const known = [0];
  // "_terrain": the transparency-filled bottom layer (tools/fill_bg_transparent.py,
  // kills black patches) PLUS terrain-hugging top-layer decals baked in
  // (snow caps / roof-edge snow — tools/extract_props.py DECAL_IDS).
  return known.includes(id) ? `data/map_${String(id).padStart(3, "0")}_bg_terrain.png` : null;
}
function getBgTopPath(id) {
  const known = [0];
  return known.includes(id) ? `data/map_${String(id).padStart(3, "0")}_bg_top.png` : null;
}

export function getMapLabel(id) {
  return MAP_LABEL_KEYS[id] ? t(MAP_LABEL_KEYS[id]) : `map${String(id).padStart(3, "0")}`;
}

export function switchMap(id) {
  _switchMap(id);
  bgImagePath = getBgPath(id);
  bgBottomPath = getBgBottomPath(id);
  bgTopPath = getBgTopPath(id);
}

export function populateMapSelector(selectEl) {
  for (const id of getMapIds()) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = getMapLabel(id);
    selectEl.appendChild(opt);
  }
}
