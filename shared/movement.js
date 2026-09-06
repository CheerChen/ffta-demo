// ============================================================================
// Movement: path execution, per-step interpolation, jump arcs
// ============================================================================
import { STEP_MS, JUMP_CFG, FACING_TABLE, jumpPhaseAt } from "./config.js";
import { grid } from "./maps.js";
import { setUnitAnim } from "./animation.js";
import { trace } from "./trace.js";

// Duration of one path step in ms (jump steps are slower, like the original)
export function stepDurationMs(from, to) {
  const diff = Math.abs(grid[to.row][to.col].h - grid[from.row][from.col].h);
  return diff >= JUMP_CFG.minDiff ? STEP_MS * JUMP_CFG.stepMult : STEP_MS;
}

export function moveUnitAlongPath(u, path) {
  if (!path || path.length === 0) { u.moving = null; setUnitAnim(u, "idle"); return; }
  u.moving = { path, step: 0, t: 0, start: { row: u.pos.row, col: u.pos.col }, lastLoggedStep: -1 };
  setUnitAnim(u, "walk");
  trace({
    type: "move-start",
    unit: u.name,
    row: u.pos.row,
    col: u.pos.col,
    path: path.map(p => [p.row, p.col]),
  });
}

export function updateMove(u, dt) {
  if (!u.moving) return;
  u.moving.t += dt;

  const path = u.moving.path;
  const seq = [u.moving.start, ...path];

  // Locate current step by accumulating per-step durations (STEP_MS is
  // slider-adjustable, so recompute each frame instead of caching)
  let acc = 0, step = -1, stepDur = 0;
  for (let i = 0; i < path.length; i++) {
    const d = stepDurationMs(seq[i], seq[i + 1]);
    if (u.moving.t < acc + d) { step = i; stepDur = d; break; }
    acc += d;
  }
  if (step === -1) {
    const last = path[path.length - 1];
    u.pos = { row: last.row, col: last.col };
    u.moving = null;
    u.renderPos = null;
    setUnitAnim(u, "idle");
    trace({ type: "move-done", unit: u.name, row: last.row, col: last.col });
    return;
  }
  const stepProgress = (u.moving.t - acc) / stepDur; // 0..1

  const from = seq[step];
  const to = seq[step + 1];

  // Update facing from movement direction
  const dr = to.row - from.row, dc = to.col - from.col;
  if (dr < 0) u.facing = 0;
  else if (dr > 0) u.facing = 2;
  else if (dc > 0) u.facing = 1;
  else if (dc < 0) u.facing = 3;

  // Height difference determines jump vs walk
  const fromH = grid[from.row][from.col].h;
  const toH = grid[to.row][to.col].h;
  const heightDiff = Math.abs(toH - fromH);
  const isJumping = heightDiff >= JUMP_CFG.minDiff;
  u.moving.jumping = isJumping;
  u.moving.stepProgress = stepProgress;

  // Log on step change
  if (step !== u.moving.lastLoggedStep) {
    u.moving.lastLoggedStep = step;
    const fEntry = FACING_TABLE[u.facing];
    trace({
      type: "move-step",
      step,
      unit: u.name,
      fromRow: from.row, fromCol: from.col, fromH,
      toRow: to.row, toCol: to.col, toH,
      dr, dc,
      facing: u.facing,
      pose: fEntry.pose,
      flip: fEntry.flip,
      jump: isJumping,
    });
  }

  let renderRow, renderCol, renderH;
  if (isJumping) {
    // FFTA-style jump. Horizontal motion happens only inside the airborne
    // window: before it the unit crouches on the origin tile, after it the
    // unit settles on the destination. Vertically the airborne segment is a
    // parabola over the straight h0→h1 line whose apex clears the higher
    // tile, so up-jumps visibly drop INTO the tile and down-jumps hop off
    // the ledge before falling.
    const { takeoffEnd, airEnd, clear } = JUMP_CFG;
    const air = Math.min(Math.max((stepProgress - takeoffEnd) / (airEnd - takeoffEnd), 0), 1);
    renderRow = from.row + dr * air;
    renderCol = from.col + dc * air;
    const d = toH - fromH;
    const peak = Math.abs(d) / 2 + clear; // bump above the straight h0→h1 line
    renderH = fromH + d * air + peak * 4 * air * (1 - air);
  } else {
    renderRow = from.row + dr * stepProgress;
    renderCol = from.col + dc * stepProgress;
    renderH = fromH + (toH - fromH) * stepProgress;
  }

  u.renderPos = { row: renderRow, col: renderCol, h: renderH };
}
