// ============================================================================
// Projectile module: 3D snowball mesh flying a parabolic arc from tile A to B.
//   On arrival calls onArrive callback (typically → hit + damage).
//   spawn/update/clear/trace logic unchanged from 2D version;
//   only rendering is replaced (2D canvas draw → 3D mesh).
// ============================================================================
import * as THREE from "three";
import { grid } from "./maps.js";
import { trace } from "../shared/trace.js";
import { worldFromTile, H_UNIT, TILE } from "./world.js";
import { getScene } from "./scene.js";

const ARC_H = 1.2; // arc peak in world units above the linear path
const SNOWBALL_RADIUS = 0.12;

// --- Active projectiles ---
const projectiles = [];
const meshes = []; // active THREE.Mesh objects in scene

const ballGeo = new THREE.SphereGeometry(SNOWBALL_RADIUS, 8, 8);
const ballMat = new THREE.MeshStandardMaterial({
  color: 0xe8e8f0,
  roughness: 0.6,
});

/**
 * Spawn a projectile.
 * @param {object} opts
 *   from:     {row, col}       origin tile
 *   to:       {row, col}       target tile
 *   duration: number           flight time in ms
 *   skin:     "snowball" | ...  visual skin
 *   onArrive: (pos) => void     called when projectile reaches target
 *   source:   string           who fired (for trace)
 *   target:   string           who's being hit (for trace)
 */
export function spawnProjectile(opts) {
  const fromH = grid[opts.from.row][opts.from.col].h;
  const toH = grid[opts.to.row][opts.to.col].h;
  const p = {
    from: { ...opts.from, h: fromH },
    to:   { ...opts.to,   h: toH   },
    t: 0,
    duration: opts.duration || 600,
    skin: opts.skin || "snowball",
    onArrive: opts.onArrive,
    source: opts.source,
    targetName: opts.target,
  };
  projectiles.push(p);

  // Create 3D mesh
  const mesh = new THREE.Mesh(ballGeo, ballMat);
  mesh.castShadow = false;
  const scene = getScene();
  if (scene) scene.add(mesh);
  meshes.push(mesh);

  trace({
    type: "projectile-launch",
    skin: p.skin,
    source: p.source,
    target: p.targetName,
    fromRow: p.from.row, fromCol: p.from.col,
    toRow: p.to.row, toCol: p.to.col,
    duration: p.duration,
  });
}

/** Advance all projectiles by dt ms.  Call from the main loop. */
export function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.t += dt;
    const progress = Math.min(p.t / p.duration, 1);

    // Update mesh position: linear XZ + parabolic Y
    const mesh = meshes[i];
    if (mesh) {
      const row = p.from.row + (p.to.row - p.from.row) * progress;
      const col = p.from.col + (p.to.col - p.from.col) * progress;
      const d = p.to.h - p.from.h;
      const peak = Math.abs(d) / 2 * H_UNIT + ARC_H;
      const h = p.from.h + d * progress + (peak / H_UNIT) * 4 * progress * (1 - progress);
      const w = worldFromTile(row, col, h);
      // Offset upward to hand height (~0.8 world units)
      mesh.position.set(w.x, w.y + 0.8, w.z);
    }

    if (p.t >= p.duration) {
      // Arrived
      trace({
        type: "projectile-arrive",
        skin: p.skin,
        source: p.source,
        target: p.targetName,
        row: p.to.row, col: p.to.col,
      });
      // Remove mesh
      if (mesh) {
        const scene = getScene();
        if (scene) scene.remove(mesh);
      }
      meshes.splice(i, 1);
      const cb = p.onArrive;
      projectiles.splice(i, 1);
      if (cb) cb({ row: p.to.row, col: p.to.col });
    }
  }
}

/** Clear all projectiles (on map switch / reset). */
export function clearProjectiles() {
  const scene = getScene();
  for (const mesh of meshes) {
    if (scene) scene.remove(mesh);
  }
  meshes.length = 0;
  projectiles.length = 0;
}
