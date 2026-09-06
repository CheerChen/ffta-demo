// ============================================================================
// Animation state management and frame advancement
// ============================================================================
import { ROM_ANIM, TICK_MS, ANIM_SPEED, FACING_TABLE, JUMP_CFG, jumpPhaseAt } from "./config.js";
import { grid } from "./maps.js";
import { UNITS } from "./units.js";

export function setUnitAnim(u, kind) {
  u.anim = kind;                       // "idle" | "walk"
  u.frameIndex = 0;
  u.animTime = 0;
  u.animOnce = null;                   // clear any one-shot
}

export function animData(kind, facing) {
  const entry = FACING_TABLE[facing];
  return ROM_ANIM[`${kind}_${entry.pose}`];
}

// Play a one-shot animation (e.g. "hit", "unarmed_atk") once, then call onDone
// and return to idle. Options:
//   onHitFrame: called when frameIndex reaches hitFrame (e.g. impact moment)
//   hitFrame:   frame index to fire onHitFrame (default: none)
export function playOnce(u, kind, { onDone, onHitFrame, hitFrame } = {}) {
  u.animOnce = { kind, onDone, onHitFrame, hitFrame, hitFired: false };
  u.frameIndex = 0;
  u.animTime = 0;
}

// Advance unit animations from ROM timing
export function updateAnimations(dtRaw, updateMove) {
  const dt = Math.max(0, Math.min(dtRaw, 100));
  for (const u of UNITS) {
    if (u.moving) { updateMove(u, dt); }

    // One-shot takes priority over idle/walk cycling
    if (u.animOnce) {
      const data = animData(u.animOnce.kind, u.facing);
      // Fire hit-frame callback when crossing the threshold
      if (!u.animOnce.hitFired && u.animOnce.hitFrame != null
          && u.frameIndex >= u.animOnce.hitFrame) {
        u.animOnce.hitFired = true;
        if (u.animOnce.onHitFrame) u.animOnce.onHitFrame(u);
      }
      u.animTime += dt * ANIM_SPEED;
      let frameDur = (data.dur[u.frameIndex] || 1) * TICK_MS;
      while (u.animTime >= frameDur) {
        u.animTime -= frameDur;
        u.frameIndex++;
        // Check hit-frame after advancing
        if (!u.animOnce.hitFired && u.animOnce.hitFrame != null
            && u.frameIndex >= u.animOnce.hitFrame) {
          u.animOnce.hitFired = true;
          if (u.animOnce.onHitFrame) u.animOnce.onHitFrame(u);
        }
        if (u.frameIndex >= data.dur.length) {
          // One-shot finished — call onDone, return to idle
          const cb = u.animOnce.onDone;
          u.animOnce = null;
          setUnitAnim(u, "idle");
          if (cb) cb(u);
          break;
        }
        frameDur = (data.dur[u.frameIndex] || 1) * TICK_MS;
      }
      continue;
    }

    const data = animData(u.moving ? "walk" : "idle", u.facing);
    u.animTime += dt * ANIM_SPEED;
    // advance through frames using ROM tick durations
    let frameDur = (data.dur[u.frameIndex] || 1) * TICK_MS;
    while (u.animTime >= frameDur) {
      u.animTime -= frameDur;
      u.frameIndex = (u.frameIndex + 1) % data.dur.length;
      frameDur = (data.dur[u.frameIndex] || 1) * TICK_MS;
    }
  }
}

export { jumpPhaseAt };
