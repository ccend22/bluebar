import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  addItem,
  checkout,
  closeShift,
  total,
} from "./domain.js";
test("checkout preserves receipt prices, consumes stock and prevents duplicate payment", () => {
  let s = addItem(initialState(), 1, 1, 1);
  s = addItem(s, 1, 1, 1);
  s = checkout(s, 1, "Cash");
  assert.equal(s.products[0].stock, 118);
  assert.equal(s.invoices[0].total, 200);
  assert.equal(s.tables[0].lines.length, 0);
  assert.throws(() => checkout(s, 1, "Cash"));
  s.products[0].price = 999;
  assert.equal(total(s.invoices[0].lines), 200);
});
test("reservations across tables cannot exceed available stock", () => {
  let s = initialState();
  s.products[0].stock = 1;
  s = addItem(s, 1, 1, 1);
  assert.throws(() => addItem(s, 2, 1, 2));
  assert.equal(s.tables[1].lines.length, 0);
});
test("shift blocks open orders and reconciles cash excluding cards", () => {
  let s = addItem(initialState(), 1, 1, 1);
  assert.throws(() => closeShift(s, 5000));
  s = checkout(s, 1, "Cash");
  s = checkout(addItem(s, 2, 2, 2), 2, "Kartë");
  s = closeShift(s, 5090);
  assert.equal(s.shifts[0].expected, 5100);
  assert.equal(s.shifts[0].difference, -10);
  assert.equal(s.shift, null);
  assert.throws(() => addItem(s, 1, 1, 1));
});
test("invalid payment and counted cash are rejected", () => {
  const s = addItem(initialState(), 1, 1, 1);
  assert.throws(() => checkout(s, 1, "Other"));
  assert.throws(() => closeShift(initialState(), NaN));
  assert.throws(() => closeShift(initialState(), -1));
});
test("orders reject missing tables and inactive waiters", () => {
  const s = initialState();
  assert.throws(() => addItem(s, 999, 1, 1));
  s.waiters[0].active = false;
  assert.throws(() => addItem(s, 1, 1, 1));
  assert.equal(s.tables[0].lines.length, 0);
});
test("orders reject a deactivated table", () => {
  const s = initialState();
  s.tables[0].active = false;
  assert.throws(() => addItem(s, 1, 1, 1));
});
