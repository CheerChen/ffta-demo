// ============================================================================
// BFS move range + path reconstruction
// ============================================================================
import { grid, ROWS, COLS } from "./maps.js";
import { UNITS, unitAt } from "./units.js";

// BFS for reachable tiles (cost only, no path)
export function bfsForUnit(unit) {
  const { row, col } = unit.pos;
  const maxMove = unit.move, jump = unit.jump;
  const visited = new Map([[`${row},${col}`, 0]]);
  const queue = [[row, col, 0]];
  while (queue.length) {
    const [r, c, cost] = queue.shift();
    for (const [nr, nc] of [[r-1,c],[r+1,c],[r,c-1],[r,c+1]]) {
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      const tile = grid[nr][nc];
      if (!tile || tile.h === 0 || tile.p === 1) continue;
      if (Math.abs(tile.h - grid[r][c].h) > jump) continue;
      const occupant = unitAt(nr, nc);
      if (occupant && occupant.team !== unit.team) continue;
      const newCost = cost + (tile.p === 2 ? 2 : 1);
      const key = `${nr},${nc}`;
      if (newCost > maxMove) continue;
      if (visited.has(key) && visited.get(key) <= newCost) continue;
      visited.set(key, newCost);
      queue.push([nr, nc, newCost]);
    }
  }
  for (const u of UNITS) visited.delete(`${u.pos.row},${u.pos.col}`);
  return visited;
}

// BFS with cameFrom for path reconstruction
export function bfsWithPath(unit) {
  const { row, col } = unit.pos;
  const maxMove = unit.move, jump = unit.jump;
  const startKey = `${row},${col}`;
  const visited = new Map([[startKey, 0]]);
  const cameFrom = new Map();
  const queue = [[row, col, 0]];
  while (queue.length) {
    const [r, c, cost] = queue.shift();
    for (const [nr, nc] of [[r-1,c],[r+1,c],[r,c-1],[r,c+1]]) {
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      const tile = grid[nr][nc];
      if (!tile || tile.h === 0 || tile.p === 1) continue;
      if (Math.abs(tile.h - grid[r][c].h) > jump) continue;
      const occupant = unitAt(nr, nc);
      if (occupant && occupant.team !== unit.team) continue;
      const newCost = cost + (tile.p === 2 ? 2 : 1);
      const key = `${nr},${nc}`;
      if (newCost > maxMove) continue;
      if (visited.has(key) && visited.get(key) <= newCost) continue;
      visited.set(key, newCost);
      cameFrom.set(key, `${r},${c}`);
      queue.push([nr, nc, newCost]);
    }
  }
  for (const u of UNITS) visited.delete(`${u.pos.row},${u.pos.col}`);
  return { visited, cameFrom, startKey };
}

export function reconstructPath(cameFrom, startKey, endKey) {
  const path = [];
  let key = endKey;
  while (key && key !== startKey) {
    const [r, c] = key.split(",").map(Number);
    path.unshift({ row: r, col: c });
    key = cameFrom.get(key);
  }
  return path;
}
