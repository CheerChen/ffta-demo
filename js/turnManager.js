// ============================================================================
// Turn manager: nextActor-driven state machine.
//
// Architecture (as proposed):
//   1. nextActor(state)  — advance CT ticks until someone ≥ 1000, return actor
//   2. playTurn(actor)   — player input or AI; sets moved/acted flags
//   3. applyTurnCost()   — endTurn(unit, moved, acted) + recompute forecast
//   → repeat
//
// The turn-order bar is a *derived view*: clone state, run predictQueue,
// repaint.  It's recomputed after every turn ends, never used for execution.
//
// Execution = nextActor (generator-like, one actor at a time).
// Display   = predictQueue (clone + simulate, pure derivation).
// Both share the same tickOnce pure function → forecast always matches actual.
// ============================================================================

import { UNITS } from "../shared/units.js";
import { endTurn, initCT, predictQueue, nextActor } from "../shared/ct.js";
import { trace } from "../shared/trace.js";
import {
  setSelectedUnit, setReachable, render,
} from "./render.js";
import { bfsWithPath } from "../shared/bfs.js";
import { enemyTurn } from "./ai.js";
import {
  updateStatusCard, hideStatusCard,
  showActionMenuNear, hideActionMenu, refreshActionMenuFloat,
} from "./statusCard.js";

// --- State ---
let activeUnit = null;     // unit whose turn it is right now
let turnMoved = false;     // has active unit moved this turn?
let turnActed = false;     // has active unit acted this turn?
let phase = "idle";        // "idle" | "playerWait" | "enemyWait"

/** Initialize CT at battle start / map switch. */
export function initTurnManager() {
  initCT(UNITS);
  activeUnit = null;
  turnMoved = false;
  turnActed = false;
  phase = "idle";
  hideActionMenu();
  hideStatusCard();
  hideBattleEnd();
  updateTurnOrderBar();
  // Kick off the first turn
  advanceToNextTurn();
}

export function resetTurnManager() {
  initTurnManager();
}

/**
 * Core loop step: advance CT ticks until someone is ready, then start
 * their turn.  Called at init and after every turn ends.
 */
function advanceToNextTurn() {
  const actor = nextActor(UNITS);
  if (!actor) {
    document.getElementById("info").textContent = "没有单位可以行动。";
    return;
  }
  startTurn(actor);
}

function startTurn(unit) {
  activeUnit = unit;
  turnMoved = false;
  turnActed = false;

  trace({
    type: "ct-turn",
    unit: unit.name,
    priority: unit.ctPriority,
    counter: unit.ctCounter,
    reserve: unit.ctReserve,
  });

  if (unit.team === "player") {
    phase = "playerWait";
    setSelectedUnit(unit);
    const bfs = bfsWithPath(unit);
    setReachable(bfs.visited);
    document.getElementById("info").textContent =
      `${unit.name} 的回合 — 选择行动。`;
    updateStatusCard(unit);
    showActionMenuNear(unit, false, false);
    render();
  } else {
    // Enemy: run greedy AI
    phase = "enemyWait";
    setSelectedUnit(unit);
    setReachable(new Map());
    document.getElementById("info").textContent =
      `${unit.name} (敌方) 回合 — AI 思考中…`;
    updateStatusCard(unit);
    render();

    // Small delay for readability, then execute AI
    setTimeout(() => {
      if (phase !== "enemyWait" || activeUnit !== unit) return;
      enemyTurn(unit, (attacked) => {
        if (phase !== "enemyWait" || activeUnit !== unit) return;
        finishTurn(true, attacked);
      });
    }, 500);
  }

  updateTurnOrderBar();
}

/**
 * Finish the active unit's turn: deduct CT cost, clear state, advance
 * to the next actor.
 */
export function finishTurn(moved, acted) {
  if (!activeUnit) return;

  const unit = activeUnit;
  const oldCounter = unit.ctCounter;
  const oldReserve = unit.ctReserve;

  endTurn(unit, moved, acted);

  trace({
    type: "ct-endturn",
    unit: unit.name,
    moved,
    acted,
    counter: oldCounter,
    newCounter: unit.ctCounter,
    reserve: oldReserve,
  });

  activeUnit = null;
  phase = "idle";
  setSelectedUnit(null);
  setReachable(new Map());
  hideActionMenu();
  render();
  updateTurnOrderBar();

  // Check win/loss before advancing
  const result = checkBattleEnd();
  if (result) {
    showBattleEnd(result);
    return;
  }

  // Advance to next turn
  advanceToNextTurn();
}

/**
 * Check if one side is fully KO'd.
 * Returns "player" if player wins, "enemy" if enemy wins, null if ongoing.
 */
function checkBattleEnd() {
  const playersAlive = UNITS.filter(u => u.team === "player" && u.hp > 0).length;
  const enemiesAlive = UNITS.filter(u => u.team === "enemy" && u.hp > 0).length;
  if (playersAlive === 0) return "enemy";
  if (enemiesAlive === 0) return "player";
  return null;
}

/** Show the battle end overlay. result = "player" | "enemy" */
function showBattleEnd(result) {
  const overlay = document.getElementById("battle-end");
  if (!overlay) return;
  const title = document.getElementById("battle-end-title");
  const subtitle = document.getElementById("battle-end-subtitle");
  if (result === "player") {
    if (title) title.textContent = "胜利！";
    if (subtitle) subtitle.textContent = "敌方全灭。";
    if (title) title.style.color = "#5a9dff";
  } else {
    if (title) title.textContent = "败北…";
    if (subtitle) subtitle.textContent = "玩家方全灭。";
    if (title) title.style.color = "#e0556a";
  }
  overlay.style.display = "flex";
  trace({ type: "battle-end", result });
}

function hideBattleEnd() {
  const overlay = document.getElementById("battle-end");
  if (overlay) overlay.style.display = "none";
}

// --- Player input API (called by interaction.js) ---

export function isPlayerTurn() {
  return phase === "playerWait";
}

export function getActiveUnit() {
  return activeUnit;
}

export function markMoved() { turnMoved = true; }
export function markActed() { turnActed = true; }
export function hasMoved() { return turnMoved; }
export function hasActed() { return turnActed; }

/** Player explicitly ends turn via the "等待" button. */
export function playerEndTurn() {
  if (!isPlayerTurn()) return;
  finishTurn(turnMoved, turnActed);
}

// --- Turn-order prediction bar (derived view, recomputed after every turn) ---

function updateTurnOrderBar() {
  const el = document.getElementById("turn-order");
  if (!el) return;

  const queue = predictQueue(UNITS, 8, activeUnit);

  const colors = {};
  for (const u of UNITS) {
    colors[u.name] = u.team === "player" ? "#5a9dff" : "#e0556a";
  }

  let html = "";
  for (let i = 0; i < queue.length; i++) {
    const q = queue[i];
    const c = colors[q.unit] || "#aaa";
    const marker = i === 0 ? "▶" : " ";
    const tickLabel = q.tick === 0 ? "现在" : `+${q.tick}`;
    html += `<div style="color:${c};">${marker} ${q.unit.padEnd(8)} <span style="color:#556677;">${tickLabel}</span></div>`;
  }
  el.innerHTML = html || "<span style='color:#556677;'>等待中…</span>";
}
