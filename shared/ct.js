// ============================================================================
// CT (Charge Time) scheduler — FFTA's Reserve-based turn system.
//
// Pure functions only.  No rendering, no wall-clock, no side effects on DOM.
// Deterministic: same inputs → same outputs, every time.
//
// Algorithm (from Terence's mechanics guide, verified against two golden
// tick-by-tick tables — see reference/turn_order_mechanics.txt):
//
//   tickOnce(units):
//     1. Each unit: Counter += Speed + Reserve; Reserve = 0
//        (Haste: +2×Speed; Slow: +floor(Speed/2); Stop: +0)
//     2. If highest Counter ≥ 1000:
//        BaseReserve = min(highest − 1000, 500)
//        Each unit: Counter −= BaseReserve; Reserve = BaseReserve
//          (if Counter < BaseReserve: Reserve = remaining Counter, Counter = 0)
//     3. Units with Counter ≥ 1000 are eligible to act.
//        Ties broken by priority ID (lowest first).
//
//   endTurn(unit, moved, acted):
//     Counter −= 500 + (moved ? 300 : 0) + (acted ? 200 : 0)
//     Counter = max(0, Counter)
//     Reserve = 0
//
// Priority ID: assigned by starting position — westmost column first,
// northmost within a column.  Lower ID = acts first on ties.
// ============================================================================

export const CT_THRESHOLD = 1000;
export const CT_MAX_RESERVE = 500;
export const CT_COST_TURN = 500;
export const CT_COST_MOVE = 300;
export const CT_COST_ACT = 200;

/**
 * Assign priority IDs to units based on starting position.
 * Westmost (lowest col) first; within a column, northmost (lowest row) first.
 * Mutates each unit by setting `.ctPriority`.
 */
export function assignPriorityIds(units) {
  const sorted = [...units].sort((a, b) => {
    if (a.pos.col !== b.pos.col) return a.pos.col - b.pos.col;
    return a.pos.row - b.pos.row;
  });
  sorted.forEach((u, i) => { u.ctPriority = i + 1; });
}

/**
 * Initialize CT state for all units (Counter=0, Reserve=0).
 * Call at battle start / map switch.
 */
export function initCT(units) {
  assignPriorityIds(units);
  for (const u of units) {
    u.ctCounter = 0;
    u.ctReserve = 0;
  }
}

/**
 * Effective speed increment for a unit on one tick.
 * Haste → 2×Speed, Slow → floor(Speed/2), Stop → 0, else Speed.
 */
function speedIncrement(u) {
  if (u.status === "stop") return 0;
  if (u.hp !== undefined && u.hp <= 0) return 0; // KO'd units don't accrue CT
  const spd = u.speed;
  if (u.status === "haste") return spd * 2;
  if (u.status === "slow") return Math.floor(spd / 2);
  return spd;
}

/** Is this unit alive and able to act? */
function isAlive(u) {
  return u.hp === undefined || u.hp > 0;
}

/**
 * Advance one clocktick.  Returns the list of units eligible to act
 * (Counter ≥ 1000 after step 2), sorted by priority ID (lowest first).
 * If no unit is eligible, returns [].
 *
 * Pure: mutates only the CT fields (ctCounter, ctReserve) on the unit objects.
 */
export function tickOnce(units) {
  const alive = units.filter(isAlive);

  // Step 1: increment counters, clear reserves (alive units only)
  for (const u of alive) {
    u.ctCounter += speedIncrement(u) + u.ctReserve;
    u.ctReserve = 0;
  }

  // Step 2: if anyone reached 1000, compute BaseReserve (alive units only)
  let highest = 0;
  for (const u of alive) if (u.ctCounter > highest) highest = u.ctCounter;

  if (highest >= CT_THRESHOLD) {
    const baseReserve = Math.min(highest - CT_THRESHOLD, CT_MAX_RESERVE);
    for (const u of alive) {
      if (u.ctCounter >= baseReserve) {
        u.ctCounter -= baseReserve;
        u.ctReserve = baseReserve;
      } else {
        // Counter can't cover the full reserve — take what's left
        u.ctReserve = u.ctCounter;
        u.ctCounter = 0;
      }
    }
  }

  // Step 3: collect eligible actors from alive units, sorted by priority
  const actors = alive
    .filter(u => u.ctCounter >= CT_THRESHOLD)
    .sort((a, b) => a.ctPriority - b.ctPriority);

  return actors;
}

/**
 * End a unit's turn.  Deduct Counter based on what they did, reset Reserve.
 * `moved` and `acted` are booleans.
 */
export function endTurn(unit, moved, acted) {
  let cost = CT_COST_TURN;
  if (moved) cost += CT_COST_MOVE;
  if (acted) cost += CT_COST_ACT;
  unit.ctCounter = Math.max(0, unit.ctCounter - cost);
  unit.ctReserve = 0;
}

/**
 * Predict the next N actors by cloning CT state and running tickOnce forward.
 * Returns an array of { unit, tick } where tick is how many ticks from now.
 * Does NOT mutate the real units.
 *
 * `currentActor` = the unit whose turn it is right now (not yet resolved), or null.
 * They are included as tick 0.  Prediction assumes Wait (−500) for every turn
 * since we can't know future choices.
 */
export function predictQueue(units, n, currentActor = null) {
  // Clone CT state (only alive units)
  const clones = units.filter(isAlive).map(u => ({
    name: u.name,
    ctPriority: u.ctPriority,
    ctCounter: u.ctCounter,
    ctReserve: u.ctReserve,
    speed: u.speed,
    status: u.status,
    hp: u.hp,
  }));

  const queue = [];
  let tick = 0;

  // Include current unresolved actor first
  if (currentActor) {
    queue.push({ unit: currentActor.name, tick: 0, priority: currentActor.ctPriority });
    // Simulate endTurn (wait — we don't know if they'll move/act, assume wait)
    const clone = clones.find(c => c.name === currentActor.name);
    if (clone) {
      clone.ctCounter = Math.max(0, clone.ctCounter - CT_COST_TURN);
      clone.ctReserve = 0;
    }
  }

  while (queue.length < n && tick < 200) {
    tick++;
    const actors = tickOnce(clones);
    for (const a of actors) {
      if (queue.length >= n) break;
      queue.push({ unit: a.name, tick, priority: a.ctPriority });
      // Assume wait for prediction
      a.ctCounter = Math.max(0, a.ctCounter - CT_COST_TURN);
      a.ctReserve = 0;
    }
  }

  return queue.slice(0, n);
}

/**
 * Advance ticks until at least one unit has Counter ≥ 1000, then return
 * the first eligible actor (lowest priority ID).  Mutates CT state on units.
 *
 * This is the core scheduler call: the game loop calls nextActor, gets back
 * a unit whose turn it is, waits for that turn to resolve, then calls
 * endTurn + nextActor again.
 *
 * Generator semantics: the next event may be at the *current* moment.
 * Before advancing time, we check for leftover same-tick actors (units that
 * were tied on the previous tickOnce call but didn't get picked).  This
 * prevents them from eating an extra Speed+Reserve increment and polluting
 * BaseReserve for everyone else.
 *
 * Returns null if no unit will ever act (e.g. all stopped) within maxTicks.
 */
export function nextActor(units, maxTicks = 200) {
  // Resolve leftover same-tick actors before advancing time (alive only)
  const ready = units
    .filter(u => isAlive(u) && u.ctCounter >= CT_THRESHOLD)
    .sort((a, b) => a.ctPriority - b.ctPriority);
  if (ready.length) return ready[0];

  for (let i = 0; i < maxTicks; i++) {
    const actors = tickOnce(units);
    if (actors.length > 0) return actors[0];
  }
  return null;
}
