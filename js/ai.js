// ============================================================================
// Enemy AI — minimal greedy strategy:
//   1. Find nearest reachable enemy (Manhattan distance from current pos).
//   2. Among all reachable tiles, pick the one that minimizes distance to
//      that enemy.
//   3. Move there.
//   4. After move completes, if any enemy is within snowball range (≤5),
//      attack the nearest one.  Otherwise Wait.
//
// This is deliberately simple — no threat assessment, no kiting, no team
// coordination.  Just "walk toward the nearest player unit and throw".
// ============================================================================

import { UNITS } from "../shared/units.js";
import { bfsWithPath, reconstructPath } from "../shared/bfs.js";
import { performAttack, performRangedAttack } from "./combat.js";
import { moveUnitAlongPath } from "../shared/movement.js";
import { trace } from "../shared/trace.js";

const SNOWBALL_RANGE = 5;

/**
 * Plan and execute an enemy unit's turn.
 * @param unit     the enemy unit
 * @param onDone   callback when the full turn (move + attack) is complete
 */
export function enemyTurn(unit, onDone) {
  // --- 1. Find nearest living enemy (player team) ---
  const targets = UNITS.filter(u => u.team === "player" && u.hp > 0);
  if (targets.length === 0) { onDone(); return; }

  let nearest = targets[0];
  let nearestDist = manhattan(unit.pos, nearest.pos);
  for (const t of targets) {
    const d = manhattan(unit.pos, t.pos);
    if (d < nearestDist) { nearestDist = d; nearest = t; }
  }

  // --- 2. Find best reachable tile (closest to nearest enemy) ---
  const bfs = bfsWithPath(unit);
  let bestKey = null;
  let bestDist = nearestDist; // only move if it gets us closer

  for (const [key, _cost] of bfs.visited) {
    const [r, c] = key.split(",").map(Number);
    const d = manhattan({ row: r, col: c }, nearest.pos);
    if (d < bestDist) {
      bestDist = d;
      bestKey = key;
    }
  }

  const willMove = bestKey !== null;

  if (willMove) {
    // --- 3. Move ---
    const path = reconstructPath(bfs.cameFrom, bfs.startKey, bestKey);
    trace({ type: "ai-move", unit: unit.name, target: nearest.name, dist: bestDist });
    moveUnitAlongPath(unit, path);

    // Wait for move to complete, then try to attack
    waitForMove(unit, () => {
      tryAttack(unit, onDone);
    });
  } else {
    // Already in position (or can't get closer) — just attack
    tryAttack(unit, onDone);
  }
}

/** After moving, check if any player unit is in range and attack. */
function tryAttack(unit, onDone) {
  const targets = UNITS.filter(u => u.team === "player" && u.hp > 0);
  if (targets.length === 0) { onDone(); return; }

  // Find nearest target in range
  let target = null;
  let bestDist = Infinity;
  for (const t of targets) {
    const d = manhattan(unit.pos, t.pos);
    if (d <= SNOWBALL_RANGE && d < bestDist) {
      bestDist = d;
      target = t;
    }
  }

  if (target) {
    if (bestDist === 1) {
      trace({ type: "ai-attack", unit: unit.name, target: target.name, range: "melee" });
      performAttack(unit, target, () => onDone(true));
    } else {
      trace({ type: "ai-attack", unit: unit.name, target: target.name, range: "ranged" });
      performRangedAttack(unit, target, () => onDone(true));
    }
  } else {
    // No one in range — just wait
    onDone(false);
  }
}

/** Poll until unit.moving becomes null (move animation finished). */
function waitForMove(unit, cb) {
  if (!unit.moving) { cb(); return; }
  setTimeout(() => waitForMove(unit, cb), 100);
}

function manhattan(a, b) {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}
