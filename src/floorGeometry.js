// Floor-plan geometry shared by the browser (FloorPlan.jsx) and the server
// (new tables' first free spot), so both agree on where a table sits.
//
// The room is a lattice of GRID_COLS x GRID_ROWS square cells (on a 16:10 canvas).
// A table occupies a whole block of cells (1-3 each way). Its body fills FILL of that
// block and its chairs the rest, so tables in different cells can never touch —
// collisions are simply two tables claiming the same cell.
export const GRID_COLS = 8;
export const GRID_ROWS = 5;
export const CELL_W = 100 / GRID_COLS;
export const CELL_H = 100 / GRID_ROWS;
export const MAX_SPAN = 3;
const FILL = 0.7;
const BAR_HEIGHT = 0.34;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
// Stored width/height (percent of the canvas) -> whole cells.
const toCells = (size, cell) => clamp(Math.round(size / cell + (1 - FILL)), 1, MAX_SPAN);

export function spanOf(t) {
  return { cols: toCells(t.width, CELL_W), rows: t.shape === "Bar" ? 1 : toCells(t.height, CELL_H) };
}
export function sizeFor(shape, cols, rows) {
  return {
    width: (cols - (1 - FILL)) * CELL_W,
    height: shape === "Bar" ? BAR_HEIGHT * CELL_H : (rows - (1 - FILL)) * CELL_H,
  };
}
// A table turned sideways covers its block the other way round.
const sideways = (rotation = 0) => {
  const r = ((rotation % 180) + 180) % 180;
  return r > 45 && r < 135;
};
export function footprint(t) {
  const { cols, rows } = spanOf(t);
  return sideways(t.rotation) ? { cols: rows, rows: cols } : { cols, rows };
}
// The block of cells a table occupies, nearest to where it's stored.
export function cellsOf(t, at = t) {
  const { cols, rows } = footprint(t);
  return {
    left: clamp(Math.round(at.posX / CELL_W - cols / 2), 0, GRID_COLS - cols),
    top: clamp(Math.round(at.posY / CELL_H - rows / 2), 0, GRID_ROWS - rows),
    cols,
    rows,
  };
}
export const centerOf = ({ left, top, cols, rows }) => ({
  posX: (left + cols / 2) * CELL_W,
  posY: (top + rows / 2) * CELL_H,
});
const intersects = (a, b) =>
  a.left < b.left + b.cols && b.left < a.left + a.cols && a.top < b.top + b.rows && b.top < a.top + a.rows;
export const fits = (block, taken) =>
  block.left >= 0 &&
  block.top >= 0 &&
  block.left + block.cols <= GRID_COLS &&
  block.top + block.rows <= GRID_ROWS &&
  !taken.some((b) => intersects(block, b));

// A table's space on the floor, in percent of the room: its footprint of cells around its
// centre, wherever that centre is. Tables move freely (no snapping to cells); two tables never
// share any of this space, which keeps a gap between them for a finger.
export function rectOf(t, at = t) {
  const { cols, rows } = footprint(t);
  return { x: at.posX - (cols * CELL_W) / 2, y: at.posY - (rows * CELL_H) / 2, w: cols * CELL_W, h: rows * CELL_H };
}
const EPS = 0.01;
const overlaps = (a, b) => a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;
export const rectFits = (r, taken) =>
  r.x >= -EPS && r.y >= -EPS && r.x + r.w <= 100 + EPS && r.y + r.h <= 100 + EPS && !taken.some((b) => overlaps(r, b));
// The nearest centre that keeps a table of this footprint inside the room.
export function inRoom(t, at) {
  const { cols, rows } = footprint(t);
  const hw = (cols * CELL_W) / 2, hh = (rows * CELL_H) / 2;
  return { posX: clamp(at.posX, hw, 100 - hw), posY: clamp(at.posY, hh, 100 - hh) };
}
// The first free block of cells (reading order) for this table, among tables placed anywhere:
// its centre, or null if the room is full.
export function openSpot(t, taken) {
  const { cols, rows } = footprint(t);
  for (let top = 0; top + rows <= GRID_ROWS; top++)
    for (let left = 0; left + cols <= GRID_COLS; left++) {
      const at = centerOf({ left, top, cols, rows });
      if (rectFits(rectOf(t, at), taken)) return at;
    }
  return null;
}

// First free block (reading order) for a table of this footprint, or null if the room is full.
export function freeSpot({ cols, rows }, taken) {
  for (let top = 0; top + rows <= GRID_ROWS; top++)
    for (let left = 0; left + cols <= GRID_COLS; left++)
      if (fits({ left, top, cols, rows }, taken)) return { left, top, cols, rows };
  return null;
}
// Pairs of tables whose spaces overlap.
export function collisions(tables) {
  const rects = tables.map((t) => ({ id: t.id, ...rectOf(t) }));
  const pairs = [];
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++)
      if (overlaps(rects[i], rects[j])) pairs.push([rects[i].id, rects[j].id]);
  return pairs;
}
// Tidy the room: keep every table's size and turn, keep tables that already sit on a
// free block where they are, and move only the ones that clash into the first free block.
// Returns { id: {posX, posY, width, height} } for tables whose layout changes.
export function arrange(tables) {
  const taken = [];
  const moves = {};
  const clean = (t) => ({ ...sizeFor(t.shape, spanOf(t).cols, spanOf(t).rows) });
  const pending = [];
  for (const t of [...tables].sort((a, b) => a.id - b.id)) {
    const rect = rectOf(t);
    if (rectFits(rect, taken)) taken.push(rect);
    else pending.push(t);
  }
  for (const t of pending) {
    const at = openSpot(t, taken);
    if (!at) continue;
    taken.push(rectOf(t, at));
    moves[t.id] = { ...at, ...clean(t) };
  }
  return moves;
}
