// ============================================================================
// World coordinate constants — single source of truth for 3D space.
//   row -> +z, col -> +x, height h -> +y
//   1 tile = 1.0 world unit (XZ), 1 height step = H_UNIT world units (Y)
// ============================================================================
export const TILE = 1.0;
// H_UNIT derived from GBA constants:
//   The ART's surface convention is 6 native px per height step. SETTLED BY
//   MEASUREMENT on map_000_bg.png (do not re-derive from 2D demo code — its
//   double-shift is a sprite-anchor artifact, not the surface):
//     front edge (13,13) h=2: snow->base transition measured v=462 (6px/h
//       predicts 460, 12px/h predicts 448);
//     crate (13,7) h=4: wood->snow top measured ~v=400 (6px/h: 400, 12px/h: 376);
//     wall (0,8) h=6: snow top edge measured ~v=278 (6px/h: 284; 12px/h: 248 —
//       outside the painted area, impossible).
//   All BG samplers (terrain.js uvOf, props.js, extract_props.py) must use the
//   same 6px/h or textures and props drift apart vertically.
//   H_UNIT = 6 / (32/√2) / cos(30°) = 6 / 22.63 / 0.866 ≈ 0.31
export const H_UNIT = 0.31;

export function worldFromTile(row, col, h) {
  return { x: col * TILE, y: h * H_UNIT, z: row * TILE };
}

// Map center for camera lookAt
export function mapCenter(rows, cols, grid) {
  let sumH = 0, count = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = grid[r][c];
      if (t && t.h > 0) { sumH += t.h; count++; }
    }
  }
  const avgH = count > 0 ? sumH / count : 0;
  return {
    x: (cols - 1) * TILE * 0.5,
    y: avgH * H_UNIT,
    z: (rows - 1) * TILE * 0.5,
  };
}
