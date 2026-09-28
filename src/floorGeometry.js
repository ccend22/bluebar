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

// First free block (reading order) for a table of this footprint, or null if the room is full.
export function freeSpot({ cols, rows }, taken) {
  for (let top = 0; top + rows <= GRID_ROWS; top++)
    for (let left = 0; left + cols <= GRID_COLS; left++)
      if (fits({ left, top, cols, rows }, taken)) return { left, top, cols, rows };
  return null;
}
// Pairs of tables that claim the same cell.
export function collisions(tables) {
  const blocks = tables.map((t) => ({ id: t.id, ...cellsOf(t) }));
  const pairs = [];
  for (let i = 0; i < blocks.length; i++)
    for (let j = i + 1; j < blocks.length; j++)
      if (intersects(blocks[i], blocks[j])) pairs.push([blocks[i].id, blocks[j].id]);
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
    const block = cellsOf(t);
    if (fits(block, taken)) taken.push(block);
    else pending.push(t);
  }
  for (const t of pending) {
    const block = freeSpot(footprint(t), taken);
    if (!block) continue;
    taken.push(block);
    moves[t.id] = { ...centerOf(block), ...clean(t) };
  }
  return moves;
}
