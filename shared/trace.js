// ============================================================================
// Trace infrastructure: structured event log + text panel rendering
//
// Every game event (move step, attack impact, hit, selection, …) is recorded
// as a plain JS object and pushed to window.__trace.  The on-screen #move-log
// panel is just a human-readable view of that array.
//
// Design goals:
//   1. Agent can read  window.__trace  via evaluate_script — no string parsing.
//   2. Golden-trace regression: same map + same scripted ops → identical trace.
//      → Events record game ticks (deterministic), never wall-clock time.
//      → Combat damage uses a seeded PRNG so results are reproducible.
// ============================================================================

import { TICK_MS } from "./config.js";

// --- Tick counter (game time, not wall time) ---
let tick = 0;

/** Advance the global tick counter by `dt` milliseconds worth of game time. */
export function advanceTicks(dt) {
  tick += dt / TICK_MS;
}

/** Current game tick (integer). */
export function getTick() {
  return Math.round(tick);
}

// --- Event store ---
/** @type {Record<string,any>[]} */
const events = [];
if (typeof window !== "undefined") window.__trace = events;

/** Reset trace + panel + tick counter.  Call on map switch / reset. */
export function resetTrace() {
  events.length = 0;
  tick = 0;
  const el = document.getElementById("move-log");
  if (el) el.textContent = "";
  const countEl = document.getElementById("trace-count");
  if (countEl) countEl.textContent = "";
}

// --- Seeded PRNG (mulberry32) for deterministic combat ---
let _seed = 0x9e3779b9; // default seed
export function seedTrace(s) {
  _seed = s >>> 0;
}
function nextRandom() {
  _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Roll damage in [5,8] using seeded PRNG. */
export function rollDamage() {
  return 5 + Math.floor(nextRandom() * 4);
}

// --- Core trace function ---
/**
 * Push a structured event into the trace.
 * `tick` is auto-stamped.  Extra fields are spread into the record.
 */
export function trace(ev) {
  const record = { tick: getTick(), ...ev };
  events.push(record);
  _renderEvent(record);
}

// --- Text rendering (the panel is a *view* of __trace) ---
function _renderEvent(rec) {
  const el = document.getElementById("move-log");
  if (!el) return;
  el.textContent += _formatEvent(rec) + "\n";
  el.scrollTop = el.scrollHeight;
  const countEl = document.getElementById("trace-count");
  if (countEl) countEl.textContent = `(${events.length} events)`;
}

function _formatEvent(e) {
  const t = e.tick;
  switch (e.type) {
    // --- Selection ---
    case "select":
      return `t${t} [SELECT] ${e.unit} (${e.team}) at (${e.row},${e.col})`;
    case "deselect":
      return `t${t} [DESELECT]`;

    // --- Movement ---
    case "move-start":
      return `t${t} [MOVE] ${e.unit} start (${e.row},${e.col})\n` +
             `  path: ${e.path.map(p => `(${p[0]},${p[1]})`).join(" → ")}`;
    case "move-step":
      return `  t${t} step${e.step}: (${e.fromRow},${e.fromCol})h${e.fromH} → (${e.toRow},${e.toCol})h${e.toH}  dr=${e.dr} dc=${e.dc}  facing=${e.facing} ${e.pose}${e.flip ? "+flip" : ""}${e.jump ? "  JUMP!" : ""}`;
    case "move-done":
      return `  t${t} [DONE] arrived at (${e.row},${e.col})`;

    // --- Combat ---
    case "atk-start":
      return `t${t} [ATK] ${e.attacker} → ${e.target}  facing ${e.facingFrom}→${e.facingTo}`;
    case "atk-impact":
      return `  t${t} [IMPACT] ${e.attacker} hit ${e.target}  dmg ${e.dmg}  HP ${e.hp}/${e.maxHp}`;
    case "hit-start":
      return `  t${t} [HIT] ${e.target} plays hit`;
    case "hit-done":
      return `  t${t} [HIT done] ${e.target} HP ${e.hp}`;
    case "atk-done":
      return `  t${t} [ATK done] ${e.attacker} back to idle, facing ${e.facingRestored}`;

    // --- Projectiles ---
    case "projectile-launch":
      return `  t${t} [THROW] ${e.source} → ${e.target}  ${e.skin}  (${e.fromRow},${e.fromCol}) → (${e.toRow},${e.toCol})  ${e.duration}ms`;
    case "projectile-arrive":
      return `  t${t} [THROW arrive] ${e.skin} at (${e.row},${e.col})`;

    // --- CT / Turn Order ---
    case "ct-tick":
      return `t${t} [CT] tick ${e.ctTick}  ${e.snapshot}`;
    case "ct-turn":
      return `t${t} [CT TURN] ${e.unit} (priority ${e.priority})  Cnt=${e.counter} Res=${e.reserve}`;
    case "ct-endturn":
      return `  t${t} [CT END] ${e.unit}  moved=${e.moved} acted=${e.acted}  Cnt=${e.counter}→${e.newCounter} Res=${e.reserve}→0`;

    // --- AI ---
    case "ai-move":
      return `  t${t} [AI] ${e.unit} → 追击 ${e.target}  距离 ${e.dist}`;
    case "ai-attack":
      return `  t${t} [AI] ${e.unit} 攻击 ${e.target}  ${e.range}`;

    // --- KO ---
    case "ko":
      return `t${t} [KO] ${e.unit} 被 ${e.attacker} 击倒！`;
    case "battle-end":
      return `t${t} === 战斗结束: ${e.result === "player" ? "玩家胜利" : "玩家败北"} ===`;

    default:
      return `t${t} [${e.type}] ${JSON.stringify(e)}`;
  }
}
