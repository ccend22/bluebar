import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand } from "./commands.js";
import { initialState } from "../src/domain.js";
import { GRID_COLS, GRID_ROWS, arrange, cellsOf, collisions, footprint, sizeFor, spanOf } from "../src/floorGeometry.js";

const table = (id, posX, posY, shape = "Drejtkëndësh", cols = 1, rows = 1, rotation = 0) => ({
  id, posX, posY, rotation, shape, ...sizeFor(shape, cols, rows),
});

test("stored sizes read back as whole cells, including older 9%x9% tables", () => {
  assert.deepEqual(spanOf({ width: 9, height: 9, shape: "Rreth" }), { cols: 1, rows: 1 });
  assert.deepEqual(spanOf({ width: 9, height: 4, shape: "Bar" }), { cols: 1, rows: 1 });
  for (const [cols, rows] of [[1, 1], [2, 1], [3, 2]])
    assert.deepEqual(spanOf({ shape: "Oval", ...sizeFor("Oval", cols, rows) }), { cols, rows });
  // A 2x1 table turned 90° covers 1x2.
  assert.deepEqual(footprint(table(1, 50, 50, "Drejtkëndësh", 2, 1, 90)), { cols: 1, rows: 2 });
});

test("the room fills up without two tables ever sharing a cell", () => {
  let state = initialState();
  const free = GRID_COLS * GRID_ROWS - state.tables.length;
  for (let n = 0; n < free; n++)
    state = applyCommand(state, "table.save", { area: "Salla", shape: n % 3 ? "Rreth" : "Bar" }).state;
  assert.equal(state.tables.length, GRID_COLS * GRID_ROWS);
  assert.deepEqual(collisions(state.tables), []);
});

test("auto-arrange moves only the tables that clash, onto free cells", () => {
  const tables = [
    table(1, 6.25, 10),
    table(2, 8, 12), // same cell as table 1
    table(3, 50, 50, "Oval", 2, 1),
    table(4, 50, 50), // under table 3
  ];
  assert.deepEqual(collisions(tables), [[1, 2], [3, 4]]);
  const moves = arrange(tables);
  assert.deepEqual(Object.keys(moves), ["2", "4"], "1 and 3 stay where they are");
  const after = tables.map((t) => ({ ...t, ...moves[t.id] }));
  assert.deepEqual(collisions(after), []);
  assert.deepEqual(cellsOf(after[0]), cellsOf(tables[0]));
});
