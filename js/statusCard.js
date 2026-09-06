// ============================================================================
// Status card + action menu — derived views, read-only, event-driven.
//
// Both components are anchored to the canvas bottom-right corner via
// positionHUD() from render.js.  Layout: [action menu] [status card]
// (menu on the left, card on the right).
//
// Neither component holds its own state.  They are refreshed by calling
// updateStatusCard(unit) and showActionMenu() / hideActionMenu()
// from turnManager / interaction / combat.
// ============================================================================

import { positionHUD } from "./render.js";
import { getSpriteImage } from "./unitSprites.js";
import { ROM_ANIM, TICK_MS, ANIM_SPEED, SPRITE_CELL, SPRITE_H } from "../shared/config.js";

// Portrait: the unit's own walk_front strip, looping at ROM timing, drawn into
// a transparent canvas. Downed units hold frame 0 of their KO pose instead.
// The canvas is scaled as a cutout: it floats over a fixed-width slot and may
// overflow the card upward, so PORTRAIT_SCALE never changes the card layout.
const PORTRAIT_SCALE = 3;
const PORTRAIT_SLOT_PX = 64;
let portraitUnit = null;   // unit currently shown on the card
let walkFrame = 0, walkTime = 0, lastFrameTs = null, portraitRaf = null;

function portraitSlot(unit) {
  if (unit.downed) return { slot: unit.downedOverride?.front || "downed_front", frame: 0 };
  return { slot: "walk_front", frame: walkFrame };
}

function drawPortrait() {
  const canvas = document.getElementById("status-portrait");
  if (!canvas || !portraitUnit) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const { slot, frame } = portraitSlot(portraitUnit);
  const img = getSpriteImage(portraitUnit.sprite, slot);
  if (!img) return;
  const frameCount = Math.max(1, Math.round(img.width / SPRITE_CELL));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, (frame % frameCount) * SPRITE_CELL, 0, SPRITE_CELL, SPRITE_H, 0, 0, SPRITE_CELL, SPRITE_H);
}

// Advance the walk cycle with the same tick durations the 3D sprites use.
function portraitLoop(ts) {
  if (!portraitUnit) { portraitRaf = null; return; }
  portraitRaf = requestAnimationFrame(portraitLoop);
  const dt = lastFrameTs == null ? 0 : Math.min(ts - lastFrameTs, 100);
  lastFrameTs = ts;
  const data = ROM_ANIM.walk_front;
  walkTime += dt * ANIM_SPEED;
  let frameDur = (data.dur[walkFrame] || 1) * TICK_MS;
  while (walkTime >= frameDur) {
    walkTime -= frameDur;
    walkFrame = (walkFrame + 1) % data.dur.length;
    frameDur = (data.dur[walkFrame] || 1) * TICK_MS;
  }
  drawPortrait();
}

function showPortrait(unit) {
  portraitUnit = unit;
  drawPortrait();
  if (portraitRaf == null) { lastFrameTs = null; portraitRaf = requestAnimationFrame(portraitLoop); }
}

function stopPortrait() {
  portraitUnit = null;
  if (portraitRaf != null) { cancelAnimationFrame(portraitRaf); portraitRaf = null; }
}

/**
 * Update the status card to show a unit's info.
 * Pass null to clear.
 */
export function updateStatusCard(unit) {
  const card = document.getElementById("status-card");
  if (!card) return;
  if (!unit) { card.style.display = "none"; stopPortrait(); return; }

  card.style.display = "block";

  const teamColor = unit.team === "player" ? "#5a9dff" : "#e0556a";
  const teamLabel = unit.team === "player" ? "玩家方" : "敌方";
  const hpPct = Math.max(0, (unit.hp / unit.maxHp) * 100);
  const ctPct = Math.min(100, (unit.ctCounter / 1000) * 100);
  const hpColor = hpPct > 50 ? "#4caf50" : hpPct > 25 ? "#ff9800" : "#f44336";
  const koLabel = unit.downed ? ' <span style="color:#888;">✕ KO</span>' : "";
  const facingName = ["北", "东", "南", "西"][unit.facing];

  card.innerHTML = `
    <div style="display:flex;gap:8px;align-items:stretch;height:100%;">
      <div style="width:${PORTRAIT_SLOT_PX}px;flex-shrink:0;position:relative;">
        <canvas id="status-portrait" width="${SPRITE_CELL}" height="${SPRITE_H}" style="position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:${SPRITE_CELL * PORTRAIT_SCALE}px;height:${SPRITE_H * PORTRAIT_SCALE}px;image-rendering:pixelated;pointer-events:none;"></canvas>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:bold;color:${teamColor};margin-bottom:2px;">${unit.name}${koLabel}</div>
        <div style="font-size:10px;color:#8899aa;margin-bottom:4px;">${teamLabel} | 朝向 ${facingName}</div>
        <div style="margin-bottom:3px;">
          <div style="display:flex;justify-content:space-between;font-size:10px;color:#aabbcc;margin-bottom:1px;">
            <span>HP</span><span>${unit.hp}/${unit.maxHp}</span>
          </div>
          <div style="height:6px;background:#1a1a2e;border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${hpPct}%;background:${hpColor};transition:width 0.3s;"></div>
          </div>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:#aabbcc;margin-bottom:1px;">
            <span>CT</span><span>${unit.ctCounter || 0}</span>
          </div>
          <div style="height:4px;background:#1a1a2e;border-radius:2px;overflow:hidden;">
            <div style="height:100%;width:${ctPct}%;background:#5a9dff;transition:width 0.3s;"></div>
          </div>
        </div>
      </div>
    </div>
  `;
  showPortrait(unit);
  positionHUD();
}

export function hideStatusCard() {
  const card = document.getElementById("status-card");
  if (card) card.style.display = "none";
  stopPortrait();
  positionHUD();
}

// --- Action menu (fixed bottom-right, no positioning math) ---

export function showActionMenuNear(_unit, moved, acted) {
  showActionMenu(moved, acted);
}

export function showActionMenu(moved, acted) {
  const menu = document.getElementById("action-menu-float");
  if (!menu) return;
  menu.style.display = "block";
  refreshActionMenuFloat(moved, acted);
  positionHUD();
}

export function hideActionMenu() {
  const menu = document.getElementById("action-menu-float");
  if (menu) menu.style.display = "none";
  positionHUD();
}

/** Refresh button labels. */
export function refreshActionMenuFloat(moved, acted) {
  const menu = document.getElementById("action-menu-float");
  if (!menu || menu.style.display === "none") return;
  const moveBtn = document.getElementById("act-move");
  const atkBtn = document.getElementById("act-attack");
  if (moveBtn) { moveBtn.textContent = moved ? "已移动 ✓" : "移动"; moveBtn.disabled = moved; }
  if (atkBtn) { atkBtn.textContent = acted ? "已行动 ✓" : "攻击"; atkBtn.disabled = acted; }
}
