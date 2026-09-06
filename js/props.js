// ============================================================================
// Props: billboard the TOP-layer BG overlay (trees, fences, snowman, etc.)
//   so they stay upright across all 4 camera docks and cast real silhouettes.
//   Reuses the unit billboard pipeline: PPU=22.63, NearestFilter,
//   alphaTest 0.5, yaw = -azimuth - PI/2, castShadow + customDepthMaterial.
//   Static single frame — no pose switching, no facing logic.
//   Manifest: data/props_XXX.json (from tools/extract_props.py)
// ============================================================================
import * as THREE from "three";
import { TILE, H_UNIT } from "./world.js";
import { grid, bgTopPath } from "./maps.js";
import { schoolReplacesProp } from "./school.js";

const PPU = 22.63; // GBA pixel-to-world-unit at 1:1 density (matches unitSprites)

// BG back-projection constants (verified — see GLM_TASK_3D_BG_PROJECTION.md §1)
const BG_ORIGIN = 256;
const BG_HALF_W = 16;
const BG_TILE_H = 8;
const BG_H_SCALE = 6;  // native px per height step (measured on the BG art — see world.js)

const propGroup = new THREE.Group();
const propMeshes = []; // [{ plane, depthMat }]
let loadedManifest = null;

export function getPropGroup() { return propGroup; }

export function buildProps(scene) {
  scene.add(propGroup);
  if (!bgTopPath) return Promise.resolve();
  return loadPropsManifest(bgTopPath).then(manifest => {
    loadedManifest = manifest;
    computeFootprintClamp(manifest);
    for (const entry of manifest) {
      if (schoolReplacesProp(entry.file)) continue;
      createPropMesh(entry);
    }
  });
}

// --- Prop collision cells: clamp their RENDER height to the local ground ---
// Grid cells that are p=1 solely because a prop stands there (tree, fence,
// snowman) carry the prop's collision height. Rendering that as a box
// duplicates the billboard and pokes through it from rotated views. Generic
// rule, data-driven from the manifest: any p=1 cell under a billboard's
// footprint that has at least one walkable 4-neighbor renders at the tallest
// walkable-neighbor height. Real structures (building, ledges) never match —
// their neighbors are p=1 too. Logic (bfs/grid) is untouched: still blocked.
const footprintClamp = new Map(); // "r,c" -> render height
export function getPropFootprintClamp() { return footprintClamp; }

function computeFootprintClamp(manifest) {
  // The cell selection heuristics (crop-rect overlap, walkable neighbor,
  // max height diff, real-structure exclusions) run offline in
  // tools/extract_props.py and are emitted per entry as clampCells —
  // inspectable in props_XXX.json and hand-fixable there.
  footprintClamp.clear();
  for (const e of manifest) {
    for (const [r, c, clampH] of e.clampCells || []) {
      footprintClamp.set(`${r},${c}`, clampH);
    }
  }
}

function loadPropsManifest(topPath) {
  // Manifest lives next to the top PNG: map_XXX_bg_top.png -> props_XXX.json
  // topPath = "data/map_000_bg_top.png" -> "data/props_000.json"
  // Resolve from this module so the manifest URL does not depend on the page location.
  const m = topPath.match(/map_(\d+)_bg_top\.png$/);
  if (!m) return Promise.resolve([]);
  const manifestUrl = topPath.replace(/map_\d+_bg_top\.png$/, `props_${m[1]}.json`);
  return fetch(new URL(`../${manifestUrl}`, import.meta.url)).then(r => r.ok ? r.json() : []).catch(() => []);
}

function createPropMesh(entry) {
  const url = new URL(`../data/props/${entry.file}`, import.meta.url).href;
  const loader = new THREE.TextureLoader();
  loader.load(url, (tex) => {
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.transparent = true;
    tex.alphaTest = 0.5;
    tex.depthWrite = true;

    const wWorld = entry.widthPx / PPU;
    const hWorld = entry.heightPx / PPU;
    const geo = new THREE.PlaneGeometry(wWorld, hWorld);

    // Bottom-center anchor: shift the plane so its bottom-center sits at the
    // local origin (0,0). No FOOT_PAD_PX sink — prop alpha is exact.
    geo.translate(0, hWorld / 2, 0);

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.5,
      depthWrite: true,
      side: THREE.FrontSide,
    });

    const plane = new THREE.Mesh(geo, mat);
    plane.castShadow = true;
    const depthMat = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: tex,          // without the map the shadow silhouette is the full rect
      alphaTest: 0.5,
    });
    plane.customDepthMaterial = depthMat;

    // Exact inverse projection (§15): place the plane so its dock-0
    // reprojection lands EXACTLY on the source rect in the BG.
    // The plane carries the PADDED crop, so anchor on the crop rect itself:
    //   u_c = crop horizontal center, v_e = crop bottom edge (exclusive coord).
    //   r0, c0 = anchor tile (depth choice only, does not affect dock-0 XY).
    const [cx0, cy0, cx1, cy1] = entry.cropBBox || (() => {
      const [x0, y0, x1, y1] = entry.srcBBox;
      const p = entry.padPx || 0;
      return [Math.max(0, x0 - p), Math.max(0, y0 - p), Math.min(512, x1 + p + 1), Math.min(512, y1 + p + 1)];
    })();
    const u_c = (cx0 + cx1) / 2;
    const v_e = cy1;
    const sum = entry.anchorRow + entry.anchorCol;   // depth: anchor tile
    const diff = (u_c - BG_ORIGIN) / BG_HALF_W;      // (c - r), fractional
    const c = (sum + diff) / 2;
    const r = (sum - diff) / 2;
    const yBase = H_UNIT * (BG_ORIGIN + sum * BG_TILE_H - v_e) / BG_H_SCALE;
    plane.position.set(c * TILE, yBase, r * TILE);
    plane.userData = { isProp: true, entry };

    propGroup.add(plane);
    propMeshes.push({ plane, depthMat });
  });
}

// Per-frame: billboard yaw follows camera azimuth (same convention as units).
// Oriented props (fences, weathervane, trees) are no longer billboards: the
// authored map model (tools/build_school.py FIXED_PROPS) rebuilds them as
// fixed quads, so the old per-dock mirror trick is gone. The manifest's
// `orient` field is now unused here.
export function updateProps(camAzimuth, poseDock = 0) {
  const yaw = -camAzimuth - Math.PI / 2;
  for (const { plane } of propMeshes) plane.rotation.y = yaw;
}

export function clearProps() {
  for (const { plane, depthMat } of propMeshes) {
    plane.geometry.dispose();
    if (plane.material.map) plane.material.map.dispose();
    plane.material.dispose();
    depthMat.dispose();
    propGroup.remove(plane);
  }
  propMeshes.length = 0;
}
