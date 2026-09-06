// ============================================================================
// Terrain: build 3D box-column meshes from the ROM height grid.
//   All tiles merged into a single BufferGeometry for 1 draw call.
//   Per-tile vertex colors preserved; raycasting via faceIndex → tile lookup.
//   p===1 (snow mounds/walls) rendered but not walkable.
//   h===0 (void/edge padding) not rendered.
// ============================================================================
import * as THREE from "three";
import { mergeGeometries } from "../vendor/BufferGeometryUtils.js";
import { TILE, H_UNIT } from "./world.js";
import { grid, ROWS, COLS, currentTerrain, bgImagePath, bgBottomPath } from "./maps.js";
import { themeFor } from "../shared/config.js";
import { getPropFootprintClamp } from "./props.js";
import { hasSchool, schoolGroundHeight, schoolGroundPath, schoolPatches, schoolPatchStepPx, schoolBaseH } from "./school.js";

// Visual height of a tile: prop collision cells (tree/fence/snowman p=1
// tiles under a billboard footprint) render at local ground height so the
// box doesn't duplicate the billboard. Logic reads grid directly — unchanged.
function renderH(r, c, t) {
  return schoolGroundHeight(r,c) ?? getPropFootprintClamp().get(`${r},${c}`) ?? t.h;
}

let terrainMesh = null;       // single merged mesh
let shadowMesh = null;        // BG path: ShadowMaterial catcher (same geometry)
const tileList = [];          // [{r, c, h, perm}] indexed by tile order in merge
const tileFaceRanges = [];    // [{start, count, r, c, h, perm}] for faceIndex→tile
const TRIS_PER_BOX = 12;      // BoxGeometry = 6 faces × 2 tris (flat-color path)

// BG back-projection constants (verified against map_000_bg.png, see config.js)
const BG_TEX_SIZE = 512;
const BG_HALF_W = 16;   // TILE_W half-width in native BG pixels
const BG_TILE_H = 8;    // TILE_H in native BG pixels
const BG_H_SCALE = 6;   // native px per height step (measured on the BG art — see world.js)

// native BG pixel → Three.js UV (v-axis flip). The BG is the original
// (dock-0) view; its pixels are glued to the geometry and rotate with it.
//   u = 256 + (c-r)*16, v = 256 + (c+r)*8 - h*6
function uvOf(rf, cf, hf) {
  const u_px = 256 + (cf - rf) * BG_HALF_W;
  const v_px = 256 + (cf + rf) * BG_TILE_H - hf * BG_H_SCALE;
  return [u_px / BG_TEX_SIZE, 1 - v_px / BG_TEX_SIZE];
}

// Side faces turned away from the dock-0 camera (-x, -z) were never painted
// in the source. Mirroring the opposite face puts yard snow on the outer
// cliffs, so when the authored map provides patches (ground.png rects from
// build_school.py), sample a tiled one instead. Returns (fx, hf) -> uv with
// fx = fraction along the face and hf = vertex height; `top` anchors row 0.
function patchSideUV(rect, top) {
  const step = schoolPatchStepPx();
  return (fx, hf) => [
    (rect[0] + fx * rect[2]) / BG_TEX_SIZE,
    1 - (rect[1] + Math.min((top - hf) * step, rect[3])) / BG_TEX_SIZE,
  ];
}

// neighbor height (0 if void/out-of-bounds) — clamp-aware so faces adjacent
// to clamped prop cells are culled/generated consistently
function neighborH(r, c) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return 0;
  const t = grid[r][c];
  return t && t.h > 0 ? renderH(r, c, t) : 0;
}

// Debug switch: when false, render the flat-color path even if a BG texture
// exists — instantly comparable against the BG-projected view (key: B).
let bgEnabled = true;
export function isBgEnabled() { return bgEnabled; }
export function setBgEnabled(v) { bgEnabled = v; }

// Called when the camera docks. Textures are fixed to the geometry, so no
// dock-specific rebuild is needed any more (per-dock BG images were dropped).
export function rebuildTerrainForDock(scene, dock) {}

export function buildTerrain(scene) {
  clearTerrain(scene);
  // Authored map: its ground image (source art + clean patches); otherwise
  // the transparency-filled bottom layer of the extracted BG.
  let texPath = null;
  if (bgEnabled) {
    texPath = hasSchool() ? schoolGroundPath() : (bgBottomPath || bgImagePath);
  }
  if (texPath) {
    return buildTerrainBg(scene, texPath);
  }
  return buildTerrainFlat(scene);
}

// --- BG-texture path: back-projected UVs onto ROM-extracted BG image ---
function buildTerrainBg(scene, texPath) {
  const loader = new THREE.TextureLoader();
  const bgTex = loader.load(texPath);
  bgTex.magFilter = THREE.NearestFilter;
  bgTex.minFilter = THREE.NearestFilter;
  bgTex.colorSpace = THREE.SRGBColorSpace;
  bgTex.generateMipmaps = false;

  const positions = [];
  const uvs = [];
  const indices = [];
  let vIdx = 0;
  let triIdx = 0;
  tileList.length = 0;
  tileFaceRanges.length = 0;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = grid[r][c];
      if (!t || t.h === 0) continue;
      const h = renderH(r, c, t);
      const perm = t.p || 0;
      const startTri = triIdx;

      // Hidden ground under the authored building has no reliable BG pixels.
      // Use a clean snow patch only there; retain adjacent shed/source art.
      const surfaceUV = schoolGroundHeight(r,c) !== undefined
        ? (rf,cf,hf) => [(4+(cf-c+.5)*8)/512, 1-(4+(rf-r+.5)*8)/512]
        : uvOf;

      // One side face between edge points a=[c,r] and b=[c,r] (outward
      // winding), from `top` down to `bottom`. Faces the source shows use
      // its projected pixels; hidden faces (turned away from the dock-0
      // camera) use tiled patches, split at the yard base so dirt only
      // appears below ground level.
      const side = (a, b, top, bottom, fallbackUV, hidden) => {
        const emit = (t, btm, uvAt) => {
          addQuad(positions, uvs, indices, vIdx,
            [P(a[0],t,a[1]), P(a[0],btm,a[1]), P(b[0],btm,b[1]), P(b[0],t,b[1])],
            [uvAt(a,t,0), uvAt(a,btm,0), uvAt(b,btm,1), uvAt(b,t,1)]);
          vIdx += 4; triIdx += 2;
        };
        const patches = schoolPatches();
        if (!patches || !hidden) {
          emit(top, bottom, (p, hf) => fallbackUV(p[0], p[1], hf));
          return;
        }
        const base = schoolBaseH();
        const segments = (bottom < base && base < top) ? [[top, base], [base, bottom]] : [[top, bottom]];
        for (const [t, btm] of segments) {
          const patch = patchSideUV(patches[btm < base ? "cliff" : "snowSide"], t);
          emit(t, btm, (p, hf, fx) => patch(fx, hf));
        }
      };

      // world corner helper: (c_frac, h_data, r_frac) → [x, y, z]
      const P = (cf, hf, rf) => [cf * TILE, hf * H_UNIT, rf * TILE];

      // top face (normal +y)
      addQuad(positions, uvs, indices, vIdx,
        [P(c-0.5,h,r-0.5), P(c-0.5,h,r+0.5), P(c+0.5,h,r+0.5), P(c+0.5,h,r-0.5)],
        [surfaceUV(r-0.5,c-0.5,h), surfaceUV(r+0.5,c-0.5,h), surfaceUV(r+0.5,c+0.5,h), surfaceUV(r-0.5,c+0.5,h)]);
      vIdx += 4; triIdx += 2;

      const projected = (cf, rf, hf) => uvOf(rf, cf, hf);

      // +z face (south, neighbor r+1) — visible in the source
      const hz = neighborH(r+1, c);
      if (hz < h) side([c-0.5, r+0.5], [c+0.5, r+0.5], h, hz, projected, false);

      // +x face (east, neighbor c+1) — visible in the source
      const hx = neighborH(r, c+1);
      if (hx < h) side([c+0.5, r+0.5], [c+0.5, r-0.5], h, hx, projected, false);

      // -z face (north, neighbor r-1) — hidden; fallback mirrors the +z face UV
      const hnz = neighborH(r-1, c);
      if (hnz < h) side([c+0.5, r-0.5], [c-0.5, r-0.5], h, hnz, (cf, rf, hf) => uvOf(2*r-rf, cf, hf), true);

      // -x face (west, neighbor c-1) — hidden; fallback mirrors the +x face UV
      const hnx = neighborH(r, c-1);
      if (hnx < h) side([c-0.5, r-0.5], [c-0.5, r+0.5], h, hnx, (cf, rf, hf) => uvOf(rf, 2*c-cf, hf), true);

      tileFaceRanges.push({ start: startTri, count: triIdx - startTri, r, c, h, perm });
      tileList.push({ r, c, h, perm });
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  // Unlit: BG pixels carry baked-in shading, so lighting the texture would
  // double-darken it. MeshBasicMaterial shows exact PNG colors.
  const mat = new THREE.MeshBasicMaterial({ map: bgTex });

  terrainMesh = new THREE.Mesh(geo, mat);
  terrainMesh.castShadow = false;
  terrainMesh.receiveShadow = false;
  terrainMesh.userData = { isTerrain: true };
  scene.add(terrainMesh);

  // Shadow catcher: same geometry, ShadowMaterial only renders incoming
  // shadows as darkened alpha. This keeps unit shadows on the ground without
  // darkening the BG texture itself.
  const shadowMat = new THREE.ShadowMaterial({ opacity: 0.3 });
  shadowMesh = new THREE.Mesh(geo, shadowMat);
  shadowMesh.receiveShadow = true;
  shadowMesh.userData = { isShadowCatcher: true };
  scene.add(shadowMesh);

  return terrainMesh;
}

// append a quad (4 verts + 4 uvs, 2 triangles) to the buffer arrays
function addQuad(positions, uvs, indices, vIdx, verts, vertUVs) {
  for (let i = 0; i < 4; i++) {
    positions.push(verts[i][0], verts[i][1], verts[i][2]);
    uvs.push(vertUVs[i][0], vertUVs[i][1]);
  }
  indices.push(vIdx, vIdx + 1, vIdx + 2, vIdx, vIdx + 2, vIdx + 3);
}

// --- Flat-color path (no BG image) ---
function buildTerrainFlat(scene) {
  const theme = themeFor(currentTerrain);
  const geometries = [];
  tileList.length = 0;
  tileFaceRanges.length = 0;
  let triIdx = 0;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = grid[r][c];
      if (!t || t.h === 0) continue;

      const hVis = renderH(r, c, t);
      const hWorld = hVis * H_UNIT;
      const perm = t.p || 0;
      const colors = theme[perm] || { top: "#777", side: "#555" };
      const topColor = new THREE.Color(colors.top);
      const sideColorL = new THREE.Color(colors.sideL || colors.side);
      const sideColorR = new THREE.Color(colors.sideR || colors.side);

      const geo = new THREE.BoxGeometry(TILE, hWorld, TILE);
      geo.translate(c * TILE, hWorld / 2, r * TILE); // position baked into geometry

      // Vertex colors: top face bright, side faces darker
      const positions = geo.attributes.position;
      const colorsAttr = new Float32Array(positions.count * 3);
      for (let i = 0; i < positions.count; i++) {
        const y = positions.getY(i);
        const x = positions.getX(i);
        let col;
        if (y > hWorld - 0.01) {
          col = topColor;
        } else if (x > c * TILE) {
          col = sideColorR;
        } else {
          col = sideColorL;
        }
        colorsAttr[i * 3] = col.r;
        colorsAttr[i * 3 + 1] = col.g;
        colorsAttr[i * 3 + 2] = col.b;
      }
      geo.setAttribute("color", new THREE.BufferAttribute(colorsAttr, 3));

      geometries.push(geo);
      tileFaceRanges.push({ start: triIdx, count: TRIS_PER_BOX, r, c, h: hVis, perm });
      tileList.push({ r, c, h: hVis, perm });
      triIdx += TRIS_PER_BOX;
    }
  }

  const merged = mergeGeometries(geometries, false);
  // Dispose per-tile geometries (data now in merged)
  for (const g of geometries) g.dispose();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0.0,
    flatShading: true,
  });

  terrainMesh = new THREE.Mesh(merged, mat);
  terrainMesh.castShadow = true;
  terrainMesh.receiveShadow = true;
  terrainMesh.userData = { isTerrain: true };
  scene.add(terrainMesh);
  return terrainMesh;
}

export function clearTerrain(scene) {
  if (terrainMesh && scene) {
    scene.remove(terrainMesh);
    terrainMesh.geometry.dispose();
    if (terrainMesh.material.map) terrainMesh.material.map.dispose();
    terrainMesh.material.dispose();
  }
  if (shadowMesh && scene) {
    scene.remove(shadowMesh);
    // geometry shared with terrainMesh — already disposed above
    shadowMesh.material.dispose();
  }
  terrainMesh = null;
  shadowMesh = null;
  tileList.length = 0;
  tileFaceRanges.length = 0;
}

// --- Raycasting support ---
// Returns array containing the single merged mesh (for raycaster.intersectObjects).
export function getTileMeshes() {
  return terrainMesh ? [terrainMesh] : [];
}

// Keep the ROM mesh alive for picking while an authored/AI map supplies the
// pixels. colorWrite=false makes the collider invisible without disabling its
// Mesh.raycast implementation.
export function setTerrainVisualVisible(visible) {
  if (terrainMesh) {
    terrainMesh.material.colorWrite = visible;
    terrainMesh.material.depthWrite = visible;
    terrainMesh.material.needsUpdate = true;
  }
  if (shadowMesh) shadowMesh.visible = visible;
}

// Map a raycast intersection's faceIndex back to tile {row, col, height, perm}.
// Uses tileFaceRanges (works for both flat-color and BG paths with variable
// tri counts per tile).
export function tileFromHit(hit) {
  if (!hit || hit.faceIndex == null) return null;
  const fi = hit.faceIndex;
  for (let i = 0; i < tileFaceRanges.length; i++) {
    const range = tileFaceRanges[i];
    if (fi >= range.start && fi < range.start + range.count) {
      return { r: range.r, c: range.c, h: range.h, perm: range.perm };
    }
  }
  return null;
}

export function getTileMesh(row, col) {
  // Not supported in merged mode — use tileFromHit for picking.
  return null;
}

// --- Highlight overlays (separate meshes, only created when needed) ---
const highlightGroup = new THREE.Group();
let highlightGroupAdded = false;
const highlightMeshes = new Map(); // "row,col" → mesh

export function clearHighlights() {
  for (const mesh of highlightMeshes.values()) {
    if (mesh.parent) mesh.parent.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  highlightMeshes.clear();
}

export function highlightTile(row, col, color, opacity = 0.4) {
  const key = `${row},${col}`;
  if (highlightMeshes.has(key)) return;
  const t = grid[row][col];
  if (!t || t.h === 0) return;
  const geo = new THREE.PlaneGeometry(TILE * 0.95, TILE * 0.95);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(col * TILE, t.h * H_UNIT + 0.02, row * TILE);
  mesh.userData = { row, col, highlight: true };
  highlightGroup.add(mesh);
  highlightMeshes.set(key, mesh);
}

export function rebuildHighlights(reachable, selectedUnit) {
  clearHighlights();
  if (reachable) {
    for (const key of reachable.keys()) {
      const [r, c] = key.split(",").map(Number);
      highlightTile(r, c, 0x64c8ff, 0.35);
    }
  }
  if (selectedUnit) {
    highlightTile(selectedUnit.pos.row, selectedUnit.pos.col, 0xffe066, 0.4);
  }
  // Attach highlight group to scene lazily
  if (!highlightGroupAdded && highlightMeshes.size > 0) {
    // Will be added via getScene in main; for now add to terrainMesh's parent
    if (terrainMesh && terrainMesh.parent) {
      terrainMesh.parent.add(highlightGroup);
      highlightGroupAdded = true;
    }
  }
}
