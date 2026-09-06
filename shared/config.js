// ============================================================================
// Constants, ROM animation timing, jump config, facing table, colors
// ============================================================================

// --- ROM-extracted animation timing (aFrame records, anim[0] = Marche) ---
// durations in game ticks; flag: 1=normal, 2=loop frame, 8=end marker
export const ROM_ANIM = {
  idle_front: { n: 4, dur: [16, 8, 16, 8], flag: [1, 1, 1, 1] },
  idle_back:  { n: 4, dur: [16, 8, 16, 8], flag: [1, 1, 1, 1] },
  walk_front: { n: 4, dur: [16, 8, 16, 8], flag: [1, 1, 1, 1] },
  walk_back:  { n: 4, dur: [16, 8, 16, 8], flag: [1, 1, 1, 1] },
  hit_front:  { n: 9, dur: [3, 3, 3, 3, 3, 3, 4, 1, 8], flag: [1, 2, 2, 2, 2, 2, 2, 8, 1] },
  hit_back:   { n: 9, dur: [3, 3, 3, 3, 3, 3, 4, 1, 8], flag: [1, 2, 2, 2, 2, 2, 2, 8, 1] },
  unarmed_atk_front: { n: 12, dur: [6, 2, 16, 1, 1, 1, 1, 24, 1, 6, 9, 8], flag: [1, 1, 1, 8, 1, 8, 8, 1, 8, 1, 1, 1] },
  unarmed_atk_back:  { n: 12, dur: [6, 2, 16, 1, 1, 1, 1, 24, 1, 6, 9, 8], flag: [1, 1, 1, 8, 1, 8, 8, 1, 8, 1, 1, 1] },
  low_unarmed_atk_front: { n: 12, dur: [6, 2, 16, 1, 1, 1, 1, 24, 1, 6, 9, 8], flag: [1, 1, 1, 8, 1, 8, 8, 1, 8, 1, 1, 1] },
  low_unarmed_atk_back:  { n: 12, dur: [6, 2, 16, 1, 1, 1, 1, 24, 1, 6, 9, 8], flag: [1, 1, 1, 8, 1, 8, 8, 1, 8, 1, 1, 1] },
  // downed: static pose, hold frame 0 for a long time then end
  downed_front: { n: 2, dur: [30, 1], flag: [1, 8] },
  downed_back:  { n: 2, dur: [30, 1], flag: [1, 8] },
};

// --- Jump step: crouch at origin → arc into the tile → landing crouch ---
// Single source of truth for BOTH motion (updateMove) and frames (drawUnit).
export const JUMP_CFG = {
  minDiff: 1,        // height diff (in height units) that triggers a jump step
  stepMult: 2.2,     // jump steps take stepMult × STEP_MS
  takeoffEnd: 0.18,  // [0, takeoffEnd): crouch at origin tile
  airEnd: 0.85,      // [takeoffEnd, airEnd): airborne arc
                     // [airEnd, 1]: landing crouch on dest tile
  clear: 1.2,        // arc clears the higher tile by ~this many height units
};

// Each jump phase holds a SINGLE frame (frame 0 of the strip) — no cycling.
// Pose roles calibrated by eye from the extracted strips:
//   jump_*_1 = crouch (front only), jump_*_2 = airborne stretched pose,
//   jump_*_4 = landing half-crouch (back only). jump_*_3 is a 6-frame
//   walk-like cycle unrelated to the movement hop — unused here.
export const JUMP_POSE_SLOTS = {
  front: { takeoff: "jump_front_1", air: "jump_front_2", land: "jump_front_1" },
  back:  { takeoff: "jump_back_4",  air: "jump_back_2",  land: "jump_back_4"  },
};

export function jumpPhaseAt(p) {
  if (p < JUMP_CFG.takeoffEnd) return "takeoff";
  if (p < JUMP_CFG.airEnd) return "air";
  return "land";
}

// --- Facing: single source of truth ---
// Derivation: sdx = dc - dr, sdy = dc + dr (from projection sx=(col-row)*W, sy=(col+row)*H)
//   sdy > 0 → moving down-screen → front; sdy < 0 → back
//   flip = (sdx > 0) !== NATIVE_FACES_RIGHT[pose]
// Calibration (observed from unflipped strips):
//   front unflipped faces SW (left-down) → NATIVE_FACES_RIGHT = false
//   back  unflipped faces NW (left-up)   → NATIVE_FACES_RIGHT = false
//     (verified: Marche going north/NE needed back+flip, so back native is NOT right)
export const FACING_TABLE = [
  { pose: "back",  flip: true  },  // 0 north (row-1), screen NE
  { pose: "front", flip: true  },  // 1 east  (col+1), screen SE
  { pose: "front", flip: false },  // 2 south (row+1), screen SW
  { pose: "back",  flip: false },  // 3 west  (col-1), screen NW
];

// --- Rendering config ---
export const TILE_W = 32;
export const TILE_H = 16;
export let HEIGHT_SCALE = 3;
export function setHeightScale(v) { HEIGHT_SCALE = v; }

// BG image alignment (verified against ROM-extracted map_000_bg.png):
// GBA native uses TILE_W=16, TILE_H=8, HEIGHT_SCALE=6, origin at pixel (256,256).
// Demo runs at 2x, so BG_HEIGHT_SCALE=12 and BG origin maps to (512,512) in the
// 2x-scaled image. When a BG image is loaded, HEIGHT_SCALE is forced to this value
// so the tile grid and unit positions align with the baked-in BG perspective.
export const BG_HEIGHT_SCALE = 12;
export const BG_ORIGIN_X = 256;  // in GBA-native BG pixels
export const BG_ORIGIN_Y = 256;
export const BG_SCALE = 2;       // demo runs at 2x GBA native

export const TICK_MS = 1000 / 60;
export let STEP_MS = 180;
export function setStepMs(v) { STEP_MS = v; }

export let SPRITE_SCALE = 2.0;
export function setSpriteScale(v) { SPRITE_SCALE = v; }

export let ANIM_SPEED = 1.0;
export function setAnimSpeed(v) { ANIM_SPEED = v; }

// --- Sprite dimensions ---
export const SPRITE_CELL = 48;
export const SPRITE_H = 56;

// --- Strip loading config ---
export const STRIP_SLOTS = [
  "idle_front", "idle_back", "walk_front", "walk_back",
  "hit_front", "hit_back",
  "unarmed_atk_front", "unarmed_atk_back",
  "low_unarmed_atk_front", "low_unarmed_atk_back",
  "jump_front_1", "jump_front_2", "jump_front_3",
  "jump_back_2", "jump_back_3", "jump_back_4",
  "downed_front", "downed_back",
  "critical_front", "critical_back",
];
export const STRIP_FALLBACK = {
  "jump_front_1": "idle_front",
  "jump_front_2": "idle_front",
  "jump_back_2":  "idle_back",
  "jump_back_4":  "idle_back",
  // unarmed_atk → low_unarmed_atk → punch → high_unarmed_atk → idle
  // (different anims have different subsets of attack slots)
  "unarmed_atk_front": "low_unarmed_atk_front",
  "unarmed_atk_back":  "low_unarmed_atk_back",
  "low_unarmed_atk_front": "punch_front",
  "low_unarmed_atk_back":  "punch_back",
  "punch_front": "high_unarmed_atk_front",
  "punch_back":  "high_unarmed_atk_back",
  "high_unarmed_atk_front": "idle_front",
  "high_unarmed_atk_back":  "idle_back",
  // downed_back → downed_front → hit_front (last frame) → idle_front
  "downed_back":  "downed_front",
  "downed_front": "hit_front",
};

// --- Terrain themes ---
// Each theme maps perm codes to { top, sideL, sideR } colors.
// sideL = left face (in shadow), sideR = right face (lit). When a theme
// only specifies `side`, both faces share it (flat look).
// `sparkle` = optional top-face texture kind ("snow" | null).
export const TERRAIN_THEMES = {
  default: {
    0: { top: "#4a9d4a", side: "#3a7d3a" },
    1: { top: "#9d4a4a", side: "#8b3a3a" },
    2: { top: "#4a6d9d", side: "#3a5a8b" },
    sparkle: null,
  },
  snow: {
    // packed snow ground (perm 0), snow mounds/walls (perm 1), ice/water (perm 2)
    0: { top: "#eef3fb", sideL: "#b8c8dc", sideR: "#d4dfee" },
    1: { top: "#e2eaf4", sideL: "#a4b6cc", sideR: "#c4d2e4" },
    2: { top: "#7a9cd0", sideL: "#5a7aac", sideR: "#6a8cc0" },
    sparkle: "snow",
  },
};

export function themeFor(terrain) {
  return TERRAIN_THEMES[terrain] || TERRAIN_THEMES.default;
}

export const INVALID_COLOR = "rgba(100,100,120,0.15)";
export const HIGHLIGHT_COLOR = "rgba(255,230,100,0.4)";
export const MOVE_COLOR = "rgba(100,200,255,0.35)";
export const UNIT_MOVE_COLOR = "rgba(100,200,255,0.45)";
