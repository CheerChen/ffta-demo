// ============================================================================
// UnitSprites: billboard plane meshes with sprite-strip textures.
//   - PlaneGeometry + NearestFilter + alphaTest:0.5 + depthWrite:true
//   - Frame selection via texture.offset.x / repeat.x
//   - Horizontal flip via repeat.x negative
//   - Billboard: rotation.y follows camera azimuth (no pitch)
//   - Pose resolution: world facing → camera-relative front/back + flip
//   - Real shadow: castShadow + customDepthMaterial (alpha-cutout silhouette)
// ============================================================================
import * as THREE from "three";
import { TILE, H_UNIT, worldFromTile } from "./world.js";
import { grid } from "./maps.js";
import {
  STRIP_SLOTS, STRIP_FALLBACK, FACING_TABLE,
  SPRITE_CELL, SPRITE_H, JUMP_POSE_SLOTS, jumpPhaseAt,
} from "../shared/config.js";
import { UNITS } from "../shared/units.js";
import { animData } from "../shared/animation.js";

// PPU = 32/√2 ≈ 22.63: GBA pixel-to-world-unit at 1:1 density.
// 48px sprite → 2.12 world units wide; 56px → 2.47 tall.
const PPU = 22.63;
const PLANE_W = SPRITE_CELL / PPU;
const PLANE_H = SPRITE_H / PPU;
// Measured transparent rows under feet in standing poses (idle/walk/atk: 5-7px).
// Downed poses have only 1-3px (acceptable: body sinks slightly into snow).
const FOOT_PAD_PX = 5;

// --- Texture loading ---
// Map: spriteDir -> slot -> THREE.Texture (resolved after fallback chain)
const textures = {}; // dir -> slot -> texture
const texLoadPromises = [];

export function loadAllSprites() {
  const dirs = [...new Set(UNITS.map(u => u.sprite))];
  const promises = [];
  for (const dir of dirs) {
    textures[dir] = {};
    for (const slot of STRIP_SLOTS) {
      promises.push(loadStrip(dir, slot));
    }
  }
  return Promise.all(promises);
}

function loadStrip(dir, slot) {
  return new Promise((resolve) => {
    const url = `sprites/${dir}/${slot}.webp`;
    const loader = new THREE.TextureLoader();
    loader.load(url, (tex) => {
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.transparent = true;
      tex.alphaTest = 0.5;
      tex.depthWrite = true;
      // Cache ImageData for pixel-alpha picking (once per texture)
      cacheImageData(tex);
      textures[dir][slot] = tex;
      resolve();
    }, undefined, () => {
      // Load failed — leave undefined, resolve later in fallback pass
      resolve();
    });
  });
}

// Build ImageData from the texture's image (offscreen canvas, once per texture).
// Stored on texture.userData.imageData for picking.js to query alpha.
function cacheImageData(tex) {
  const img = tex.image;
  if (!img || !img.width || !img.height) return;
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  tex.userData.imageData = ctx.getImageData(0, 0, img.width, img.height);
}

// After all loads, resolve fallback chains for missing slots
export function resolveFallbacks() {
  const dirs = Object.keys(textures);
  for (const dir of dirs) {
    for (const slot of STRIP_SLOTS) {
      if (!textures[dir][slot]) {
        let fbKey = STRIP_FALLBACK[slot];
        while (fbKey) {
          if (textures[dir][fbKey]) {
            textures[dir][slot] = textures[dir][fbKey];
            break;
          }
          fbKey = STRIP_FALLBACK[fbKey];
        }
      }
    }
  }
}

// Strip image for 2D HUD drawing (status card portrait). Resolved after
// fallback chains, so a missing slot yields its fallback image or null.
export function getSpriteImage(dir, slot) {
  return textures[dir]?.[slot]?.image || null;
}

// --- Unit mesh creation ---
const unitMeshes = new Map(); // unit object -> { plane, depthMat, spriteDir }
const unitGroup = new THREE.Group();

export function getUnitGroup() { return unitGroup; }

export function buildUnitSprites(scene) {
  scene.add(unitGroup);
  for (const u of UNITS) {
    createUnitMesh(u);
  }
}

function createUnitMesh(u) {
  // Billboard plane: anchored so sprite feet sit on tile surface.
  // Sink by the MEASURED art padding (5px), not by H_UNIT — the padding is
  // transparent so alphaTest discards those fragments in both color and
  // shadow passes, preventing any terrain intersection.
  const geo = new THREE.PlaneGeometry(PLANE_W, PLANE_H);
  geo.translate(0, PLANE_H / 2 - FOOT_PAD_PX / PPU, 0);

  const mat = new THREE.MeshBasicMaterial({
    transparent: true,
    alphaTest: 0.5,
    depthWrite: true,
    side: THREE.FrontSide,
  });

  const plane = new THREE.Mesh(geo, mat);
  plane.userData = { unit: u, isUnit: true };
  // Real shadow: cast into the directional light's shadow map.
  // customDepthMaterial with alphaTest so the silhouette (not the plane rect) casts.
  plane.castShadow = true;
  const depthMat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    alphaTest: 0.5,
  });
  plane.customDepthMaterial = depthMat;
  unitGroup.add(plane);

  unitMeshes.set(u, { plane, depthMat, spriteDir: u.sprite });
}

// --- Pose resolution (camera-relative) ---
// u.facing is world direction (0=N, 1=E, 2=S, 3=W).
// camDock is 0..3 (0 = default iso view).
// Returns { pose: "front"|"back", flip: bool }
export function poseFor(u, camDock) {
  // Relative facing: how the unit appears from this camera angle.
  // Calibration (verified k=0): matches FACING_TABLE[u.facing] exactly.
  // When camera rotates by +90° (dock+1), the unit's apparent facing
  // shifts by -1 in the facing table. So: rel = (facing - dock + 4) % 4.
  const rel = (u.facing - camDock + 4) % 4;
  return FACING_TABLE[rel];
}

// --- Determine which slot + frame to show for a unit ---
function resolveSlotAndFrame(u, camDock) {
  const entry = poseFor(u, camDock); // { pose, flip }
  let slot, fi;

  if (u.downed) {
    if (u.downedOverride) {
      slot = u.downedOverride[entry.pose] || `downed_${entry.pose}`;
    } else {
      slot = `downed_${entry.pose}`;
    }
    fi = 0;
  } else if (u.moving && u.renderPos && u.moving.jumping) {
    slot = JUMP_POSE_SLOTS[entry.pose][jumpPhaseAt(u.moving.stepProgress)];
    fi = 0;
  } else if (u.animOnce) {
    const data = animData(u.animOnce.kind, u.facing);
    // Use camera-relative pose for one-shot too
    const relData = ROM_ANIM_REL(u.animOnce.kind, entry.pose);
    fi = Math.min(u.frameIndex, (relData || data).dur.length - 1);
    slot = `${u.animOnce.kind}_${entry.pose}`;
  } else {
    const kind = u.moving ? "walk" : "idle";
    const data = animData(kind, u.facing);
    fi = u.frameIndex % data.dur.length;
    slot = `${kind}_${entry.pose}`;
  }

  return { slot, fi, flip: entry.flip };
}

// Helper: get ROM_ANIM entry for a specific pose (not facing-based)
import { ROM_ANIM } from "../shared/config.js";
function ROM_ANIM_REL(kind, pose) {
  return ROM_ANIM[`${kind}_${pose}`];
}

// --- Per-frame update ---
export function updateUnitSprites(camDock, camAzimuth) {
  for (const [u, { plane, depthMat, spriteDir }] of unitMeshes) {
    // Position
    let row, col, h;
    if (u.moving && u.renderPos) {
      row = u.renderPos.row;
      col = u.renderPos.col;
      h = u.renderPos.h;
    } else {
      row = u.pos.row;
      col = u.pos.col;
      const tile = grid[row]?.[col];
      h = tile ? tile.h : 0;
    }
    const w = worldFromTile(row, col, h);
    plane.position.set(w.x, w.y, w.z);

    // Billboard: face camera. -camAzimuth - PI/2 corrects the facing constant
    // (old camAzimuth + PI was 180° off on dock 1/3, DoubleSide hid it as silent mirror).
    plane.rotation.y = -camAzimuth - Math.PI / 2;

    // Slot + frame
    const { slot, fi, flip } = resolveSlotAndFrame(u, camDock);
    const tex = textures[spriteDir]?.[slot];
    if (tex) {
      plane.material.map = tex;
      plane.material.needsUpdate = true;

      // Sync depth material map so shadow silhouette matches the sprite frame
      if (depthMat.map !== tex) {
        depthMat.map = tex;
        depthMat.needsUpdate = true;
      }

      // Frame count from texture width
      const frameCount = Math.max(1, Math.round(tex.image.width / SPRITE_CELL));
      const frameIdx = Math.min(fi, frameCount - 1);

      // UV: repeat.x = 1/N, offset.x = frameIdx/N
      // Flip: scale.x = -1 (via repeat.x negative)
      if (flip) {
        tex.repeat.x = -1 / frameCount;
        tex.offset.x = (frameIdx + 1) / frameCount; // shift for negative repeat
      } else {
        tex.repeat.x = 1 / frameCount;
        tex.offset.x = frameIdx / frameCount;
      }
      tex.needsUpdate = true;
    }
  }
}

// Cached flat array of unit plane meshes (for raycasting).
// Recomputed only when unit set changes (i.e. once at init).
let _unitMeshCache = null;
export function getUnitMeshes() {
  if (!_unitMeshCache) {
    _unitMeshCache = [...unitMeshes.values()].map(v => v.plane);
  }
  return _unitMeshCache;
}

// Map unit → plane for hover highlight (built once)
const _unitToPlane = new Map();
export function getPlaneForUnit(unit) {
  if (_unitToPlane.size === 0) {
    for (const [u, v] of unitMeshes) _unitToPlane.set(u, v.plane);
  }
  return _unitToPlane.get(unit);
}
