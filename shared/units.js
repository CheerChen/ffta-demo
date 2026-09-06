// ============================================================================
// Unit definitions and per-map placements
// ============================================================================

// Player team: isekai protagonist versions (anim 43/45/47, palette row 0)
// Enemy team: snowball-fight kids (anim 56/56/59, palette rows from VRAM dump)
// downedOverride: per-unit slot override for KO pose (front/back), since
//   snowball kids don't have downed_* strips — they reuse critical/jump poses.
export const UNITS = [
  { id: 1, name: "Marche", team: "player", sprite: "anim_043_p0", portrait: "MarcheF", pos: { row: 12, col: 3 }, facing: 0, move: 4, jump: 2, hp: 24, maxHp: 24, speed: 151 },
  { id: 2, name: "Lyle",   team: "player", sprite: "anim_045_p0", portrait: "Lyle",    pos: { row: 12, col: 6 }, facing: 0, move: 4, jump: 2, hp: 22, maxHp: 22, speed: 145 },
  { id: 3, name: "Ritz",   team: "player", sprite: "anim_047_p0", portrait: "RitzF",   pos: { row: 12, col: 9 }, facing: 0, move: 4, jump: 2, hp: 22, maxHp: 22, speed: 148 },
  { id: 4, name: "Colm",    team: "enemy", sprite: "anim_056_p0", portrait: "Colm",    pos: { row: 2, col: 5 },  facing: 2, move: 4, jump: 2, hp: 20, maxHp: 20, speed: 162, downedOverride: { front: "critical_front", back: "critical_back" } },
  { id: 5, name: "Guinness",team: "enemy", sprite: "anim_056_p1", portrait: "Guinness",pos: { row: 1, col: 8 },  facing: 2, move: 4, jump: 2, hp: 20, maxHp: 20, speed: 155, downedOverride: { front: "critical_front", back: "critical_back" } },
  { id: 6, name: "Mewt",    team: "enemy", sprite: "anim_059_p0", portrait: "Mewt",    pos: { row: 1, col: 11 }, facing: 2, move: 4, jump: 2, hp: 20, maxHp: 20, speed: 150, downedOverride: { front: "jump_front_3", back: "jump_back_3" } },
];

// Per-map unit placements (row/col must be on a valid tile)
export const MAP_UNIT_POS = {
  0:  [ {row:12,col:3}, {row:12,col:6}, {row:12,col:9},
       {row:2,col:5},  {row:1,col:8},  {row:1,col:11} ],
  74: [ {row:14,col:3}, {row:14,col:5}, {row:14,col:7},
       {row:0,col:4},  {row:0,col:6},  {row:0,col:8} ],
};

// Initialize runtime animation state
UNITS.forEach((u) => { u.animTime = Math.random() * 300; u.moving = null; });

export function unitAt(row, col) {
  return UNITS.find(u => u.pos.row === row && u.pos.col === col);
}

/**
 * Reset all units to battle-start state: full HP, clear KO/downed flags,
 * restore positions for the given map id, clear animation/movement state.
 */
export function resetUnits(mapId) {
  const placements = MAP_UNIT_POS[mapId] || MAP_UNIT_POS[0];
  UNITS.forEach((u, i) => {
    u.hp = u.maxHp;
    u.ko = false;
    u.downed = false;
    u.pos = { ...placements[i] };
    u.moving = null;
    u.renderPos = null;
    u.animOnce = null;
    u.frameIndex = 0;
    u.animTime = 0;
    u.anim = "idle";
  });
}

export function getSpriteDirs() {
  return [...new Set(UNITS.map(u => u.sprite))];
}
