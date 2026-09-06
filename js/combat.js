// ============================================================================
// Combat: attack sequence orchestration
//   attacker turns to face target → plays unarmed_atk → at hit frame target
//   plays hit → damage popup → HP changes → both return to idle
// ============================================================================
// 3D port: popupPos uses worldToScreen instead of 2D canvas coords.
//   All HEIGHT_SCALE/TILE_W/TILE_H math removed (§11.2 of task doc).
import { grid } from "./maps.js";
import { playOnce, setUnitAnim } from "../shared/animation.js";
import { spawnPopup } from "./fx.js";
import { trace, rollDamage } from "../shared/trace.js";
import { spawnProjectile } from "./projectile.js";
import { updateStatusCard } from "./statusCard.js";
import { worldFromTile, H_UNIT, TILE } from "./world.js";
import { worldToScreen } from "./scene.js";
import { t } from "../shared/i18n.js";

// Facing direction from attacker to target (4-directional)
function facingToward(from, to) {
  const dr = to.row - from.row;
  const dc = to.col - from.col;
  if (Math.abs(dr) >= Math.abs(dc)) return dr > 0 ? 2 : 0; // S or N
  return dc > 0 ? 1 : 3;                                   // E or W
}

// Screen position for popup (above the unit's head, in CSS pixels)
function popupPos(unit) {
  const { row, col } = unit.pos;
  const tile = grid[row][col];
  const w = worldFromTile(row, col, tile.h);
  // Offset upward by ~1.5 world units (above sprite head)
  return worldToScreen(w.x, w.y + 1.5, w.z);
}

// Attack frame index where the impact happens (0-based).
// unarmed_atk dur = [6, 2, 16, 1, 1, ...] — frame 3 (index 3) is the strike.
const ATK_HIT_FRAME = 3;

/**
 * Apply damage to target and check for KO.
 * If HP drops to 0, set ko flag, play downed pose, fire trace event.
 * @param target   the unit taking damage
 * @param dmg      damage amount
 * @param attacker the unit dealing damage (for trace)
 * @param onKo     optional callback when KO happens (called after downed anim starts)
 */
function applyDamage(target, dmg, attacker, onKo) {
  target.hp = Math.max(0, target.hp - dmg);
  const pp = popupPos(target);
  spawnPopup(pp.x, pp.y, `-${dmg}`, "#ff4444");

  trace({
    type: "atk-impact",
    attacker: attacker.name,
    target: target.name,
    dmg,
    hp: target.hp,
    maxHp: target.maxHp,
  });

  // Refresh status card to show new HP
  updateStatusCard(target);

  if (target.hp <= 0 && !target.ko) {
    target.ko = true;
    trace({ type: "ko", unit: target.name, attacker: attacker.name });
    // Play downed pose as a one-shot (static frame, long duration)
    playOnce(target, "downed", {
      onDone: (u) => {
        // Stay in downed state — setUnitAnim would return to idle, so we
        // keep animOnce null but set a flag the renderer checks.
        u.animOnce = null;
        u.frameIndex = 0;
        u.downed = true;
        if (onKo) onKo(u);
      },
    });
  }
}

export function performAttack(attacker, target, onAllDone) {
  // 1. Turn attacker toward target
  const savedFacing = attacker.facing;
  attacker.facing = facingToward(attacker.pos, target.pos);
  trace({
    type: "atk-start",
    attacker: attacker.name,
    target: target.name,
    facingFrom: savedFacing,
    facingTo: attacker.facing,
  });

  document.getElementById("info").textContent =
    t("log.attack", { a: attacker.name, b: target.name });

  // 2. Play attack animation; at hit frame, trigger target's hit + damage
  playOnce(attacker, "unarmed_atk", {
    hitFrame: ATK_HIT_FRAME,
    onHitFrame: () => {
      // Target plays hit reaction (unless KO'd — downed pose replaces hit)
      const dmg = rollDamage();
      if (target.hp - dmg > 0) {
        trace({ type: "hit-start", target: target.name });
        playOnce(target, "hit", {
          onDone: (t) => {
            trace({ type: "hit-done", target: t.name, hp: t.hp });
            document.getElementById("info").textContent =
              t("log.hit_done", { name: t.name });
          },
        });
      }

      applyDamage(target, dmg, attacker);

      // Update info
      document.getElementById("info").textContent =
        t("log.hit", { a: attacker.name, b: target.name, d: dmg, hp: target.hp, max: target.maxHp });
    },
    onDone: () => {
      // Restore facing, return to idle
      attacker.facing = savedFacing;
      setUnitAnim(attacker, "idle");
      trace({
        type: "atk-done",
        attacker: attacker.name,
        facingRestored: savedFacing,
      });
      if (onAllDone) onAllDone();
    },
  });
}

// ============================================================================
// Ranged attack (snowball): attacker plays throw anim → snowball flies arc
//   → on arrival, target plays hit + takes damage.
//   This is the snowball-fight default; the arc math lives in projectile.js.
// ============================================================================

// Throw animation hit frame (same unarmed_atk — frame 3 is the release point)
const THROW_RELEASE_FRAME = 3;

// Flight time scales with tile distance (base 350ms + 80ms per tile)
function flightTime(from, to) {
  const dist = Math.abs(to.row - from.row) + Math.abs(to.col - from.col);
  return 350 + dist * 80;
}

export function performRangedAttack(attacker, target, onAllDone) {
  const savedFacing = attacker.facing;
  attacker.facing = facingToward(attacker.pos, target.pos);
  trace({
    type: "atk-start",
    attacker: attacker.name,
    target: target.name,
    facingFrom: savedFacing,
    facingTo: attacker.facing,
    ranged: true,
  });

  document.getElementById("info").textContent =
    t("log.throw", { a: attacker.name, b: target.name });

  playOnce(attacker, "unarmed_atk", {
    hitFrame: THROW_RELEASE_FRAME,
    onHitFrame: () => {
      // Launch snowball projectile
      spawnProjectile({
        from: { row: attacker.pos.row, col: attacker.pos.col },
        to:   { row: target.pos.row,   col: target.pos.col   },
        duration: flightTime(attacker.pos, target.pos),
        skin: "snowball",
        source: attacker.name,
        target: target.name,
        onArrive: () => {
          // Snowball hits → target plays hit + takes damage
          const dmg = rollDamage();
          if (target.hp - dmg > 0) {
            trace({ type: "hit-start", target: target.name });
            playOnce(target, "hit", {
              onDone: (t) => {
                trace({ type: "hit-done", target: t.name, hp: t.hp });
                document.getElementById("info").textContent =
                  t("log.hit_done", { name: t.name });
              },
            });
          }

          applyDamage(target, dmg, attacker);

          document.getElementById("info").textContent =
            t("log.hit", { a: attacker.name, b: target.name, d: dmg, hp: target.hp, max: target.maxHp });
        },
      });
    },
    onDone: () => {
      attacker.facing = savedFacing;
      setUnitAnim(attacker, "idle");
      trace({
        type: "atk-done",
        attacker: attacker.name,
        facingRestored: savedFacing,
        ranged: true,
      });
      if (onAllDone) onAllDone();
    },
  });
}
