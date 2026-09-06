// ============================================================================
// Picking: Raycaster-based tile/unit selection + interaction state machine.
//   - Pixel-alpha filter: transparent sprite pixels pass through to terrain
//   - Hover: tile cursor + unit highlight (pointermove, consumed in main loop)
//   - Click: replicate 2D demo interaction behavior
// ============================================================================
import * as THREE from "three";
import { getCanvas, getCamera, getScene } from "./scene.js";
import { grid, ROWS, COLS } from "./maps.js";
import { unitAt, resetUnits, UNITS } from "../shared/units.js";
import { bfsWithPath, reconstructPath } from "../shared/bfs.js";
import { moveUnitAlongPath } from "../shared/movement.js";
import { performAttack, performRangedAttack } from "./combat.js";
import { trace, resetTrace } from "../shared/trace.js";
import { clearProjectiles } from "./projectile.js";
import {
  isPlayerTurn, getActiveUnit, markMoved, markActed,
  playerEndTurn, resetTurnManager, hasMoved, hasActed,
} from "./turnManager.js";
import {
  updateStatusCard, showActionMenuNear, refreshActionMenuFloat,
} from "./statusCard.js";
import { setSelectedUnit, setReachable, getReachable, getSelectedUnit, render } from "./render.js";
import { rebuildHighlights, getTileMeshes, tileFromHit } from "./terrain.js";
import { getUnitMeshes, getPlaneForUnit } from "./unitSprites.js";
import { isCameraRotating } from "./cameraRig.js";
import { TILE, H_UNIT, worldFromTile } from "./world.js";
import { getSchoolMeshes, schoolTileFromHit, schoolHitIsProp } from "./school.js";
import { t } from "../shared/i18n.js";

let raycaster = null;
let mouse = null;

// --- Hover state ---
let pendingMouseEvent = null; // stored pointermove event, consumed in updateHover()
let hoverTile = null;         // { row, col } or null
let hoverMesh = null;         // tile cursor mesh
let hoveredUnit = null;       // unit currently hovered (for highlight restore)

export function initPicking() {
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  const canvas = getCanvas();

  canvas.addEventListener("click", onCanvasClick);
  canvas.addEventListener("pointermove", (e) => { pendingMouseEvent = e; });

  // Action menu buttons
  document.getElementById("act-wait").addEventListener("click", () => {
    playerEndTurn();
  });
  document.getElementById("act-move").addEventListener("click", () => {
    if (!isPlayerTurn()) return;
    const active = getActiveUnit();
    if (!active || hasMoved()) return;
    setSelectedUnit(active);
    const bfs = bfsWithPath(active);
    setReachable(bfs.visited);
    rebuildHighlights(bfs.visited, active);
    document.getElementById("info").textContent =
      t("hint.move", { name: active.name });
    render();
  });
  document.getElementById("act-attack").addEventListener("click", () => {
    if (!isPlayerTurn()) return;
    const active = getActiveUnit();
    if (!active) return;
    document.getElementById("info").textContent =
      t("hint.attack", { name: active.name });
    setReachable(new Map());
    rebuildHighlights(null, active);
    render();
  });

  // Create hover cursor mesh (hidden initially)
  const geo = new THREE.PlaneGeometry(TILE * 0.9, TILE * 0.9);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  hoverMesh = new THREE.Mesh(geo, mat);
  hoverMesh.visible = false;
  hoverMesh.renderOrder = 1;
  getScene().add(hoverMesh);
}

// --- Pixel alpha check for a raycast hit on a unit plane ---
function hitIsOpaque(hit) {
  const obj = hit.object;
  const tex = obj.material.map;
  if (!tex || !tex.userData.imageData) return true; // no data → treat as opaque
  const imgData = tex.userData.imageData;
  const uv = hit.uv;
  if (!uv) return true;
  // Transform plane UV → strip pixel coords using current offset/repeat
  const u = tex.offset.x + uv.x * tex.repeat.x;
  const v = tex.offset.y + uv.y * tex.repeat.y;
  const px = Math.floor(u * imgData.width);
  const py = Math.floor((1 - v) * imgData.height); // ImageData is y-down
  if (px < 0 || px >= imgData.width || py < 0 || py >= imgData.height) return false;
  const alpha = imgData.data[(py * imgData.width + px) * 4 + 3];
  return alpha >= 128;
}

// --- Combined raycast: units (alpha-filtered) + terrain, nearest wins ---
// Only raycasts unit planes + terrain tile meshes (not the whole scene tree).
let _candidates = null;

// Call after any terrain rebuild (e.g. BG/flat debug toggle) — the cached
// candidate list would otherwise hold the disposed old terrain mesh.
export function invalidatePickCandidates() { _candidates = null; }
function pickTarget(e) {
  const canvas = getCanvas();
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, getCamera());

  // Cached candidate list (unit planes + terrain tiles)
  if (!_candidates) {
    _candidates = [...getUnitMeshes(), ...getTileMeshes(), ...getSchoolMeshes()];
  }
  const allHits = raycaster.intersectObjects(_candidates, false);
  allHits.sort((a, b) => a.distance - b.distance);

  for (const hit of allHits) {
    const ud = hit.object.userData;
    // Authored mound domes pick as their tile; sprite quads (trees, fences)
    // are see-through for clicks; any other wall blocks selection behind it.
    if (ud?.isSchool) {
      if (schoolHitIsProp(hit)) continue;
      const cell = schoolTileFromHit(hit);
      return cell ? { type: "tile", row: cell[0], col: cell[1], hit } : null;
    }

    // Unit plane: check pixel alpha
    if (ud?.isUnit) {
      if (hitIsOpaque(hit)) {
        return { type: "unit", unit: ud.unit, hit };
      }
      continue; // transparent → fall through to next hit
    }

    // Merged terrain mesh: use faceIndex → tile lookup
    if (ud?.isTerrain) {
      const tile = tileFromHit(hit);
      if (tile) {
        return { type: "tile", row: tile.r, col: tile.c, hit };
      }
    }
  }
  return null;
}

function onCanvasClick(e) {
  if (isCameraRotating()) return;
  const target = pickTarget(e);
  if (!target) return;

  if (target.type === "unit") {
    handleUnitClick(target.unit);
  } else {
    handleTileClick(target.row, target.col);
  }
}

function handleUnitClick(unit) {
  const playerTurn = isPlayerTurn();
  const active = getActiveUnit();

  // Player turn: click enemy → attack
  if (playerTurn && active && unit.team === "enemy" && unit.hp > 0) {
    const dr = Math.abs(unit.pos.row - active.pos.row);
    const dc = Math.abs(unit.pos.col - active.pos.col);
    const manhattan = dr + dc;
    if (manhattan === 1) {
      markActed();
      performAttack(active, unit, () => playerEndTurn());
      setSelectedUnit(null);
      setReachable(new Map());
      rebuildHighlights(null, null);
      render();
      return;
    } else if (manhattan <= 5) {
      markActed();
      performRangedAttack(active, unit, () => playerEndTurn());
      setSelectedUnit(null);
      setReachable(new Map());
      rebuildHighlights(null, null);
      render();
      return;
    } else {
      document.getElementById("info").textContent =
        t("hint.too_far", { name: unit.name, d: manhattan });
      return;
    }
  }

  // Click any unit → info
  setSelectedUnit(unit);
  if (!playerTurn) setReachable(new Map());
  trace({ type: "select", unit: unit.name, team: unit.team, row: unit.pos.row, col: unit.pos.col });
  updateStatusCard(unit);
  rebuildHighlights(getReachable(), unit);
  render();
}

function handleTileClick(row, col) {
  const playerTurn = isPlayerTurn();
  const active = getActiveUnit();

  if (playerTurn && active) {
    const reachable = getReachable();
    if (reachable.has(`${row},${col}`)) {
      const bfs = bfsWithPath(active);
      const path = reconstructPath(bfs.cameFrom, bfs.startKey, `${row},${col}`);
      markMoved();
      moveUnitAlongPath(active, path);
      setReachable(new Map());
      rebuildHighlights(null, active);
      document.getElementById("info").textContent =
        t("hint.moving", { name: active.name });
      refreshActionMenuFloat(hasMoved(), hasActed());
      updateStatusCard(active);
      render();
      return;
    }
    document.getElementById("info").textContent =
      t("hint.turn", { name: active.name });
    return;
  }

  setSelectedUnit(null);
  setReachable(new Map());
  rebuildHighlights(null, null);
  render();
}

// --- Hover update (called from main loop, not from event handler) ---
export function updateHover() {
  if (isCameraRotating()) {
    if (hoverMesh) hoverMesh.visible = false;
    if (hoveredUnit) { restoreUnitHighlight(hoveredUnit); hoveredUnit = null; }
    getCanvas().style.cursor = "default";
    return;
  }
  if (!pendingMouseEvent) return;
  const e = pendingMouseEvent;
  pendingMouseEvent = null;

  const target = pickTarget(e);

  // Reset previous hover state
  if (hoveredUnit) { restoreUnitHighlight(hoveredUnit); hoveredUnit = null; }

  if (target?.type === "unit") {
    // Hover on unit: pointer cursor + slight brighten
    getCanvas().style.cursor = "pointer";
    const plane = getPlaneForUnit(target.unit);
    if (plane) {
      plane.material.color.setScalar(1.15);
      hoveredUnit = target.unit;
    }
    if (hoverMesh) hoverMesh.visible = false;
  } else if (target?.type === "tile") {
    getCanvas().style.cursor = "default";
    const tile = grid[target.row]?.[target.col];
    if (tile && tile.h > 0) {
      const w = worldFromTile(target.row, target.col, tile.h);
      hoverMesh.position.set(w.x, w.y + 0.03, w.z);
      hoverMesh.visible = true;
      // Red tint if hovering an attackable enemy target during player turn
      const active = getActiveUnit();
      if (isPlayerTurn() && active) {
        const u = unitAt(target.row, target.col);
        if (u && u.team === "enemy" && u.hp > 0) {
          const dist = Math.abs(u.pos.row - active.pos.row) + Math.abs(u.pos.col - active.pos.col);
          hoverMesh.material.color.setRGB(1, 0.3, 0.3);
        } else {
          hoverMesh.material.color.setRGB(1, 1, 1);
        }
      } else {
        hoverMesh.material.color.setRGB(1, 1, 1);
      }
    } else {
      if (hoverMesh) hoverMesh.visible = false;
    }
  } else {
    getCanvas().style.cursor = "default";
    if (hoverMesh) hoverMesh.visible = false;
  }
}

function restoreUnitHighlight(unit) {
  const plane = getPlaneForUnit(unit);
  if (plane) plane.material.color.setScalar(1.0);
}
