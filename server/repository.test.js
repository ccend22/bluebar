import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { createManager, issueSession } from "./auth.js";
import { verifyEmptyDatabase } from "./verify.js";
import { buildApp } from "./app.js";
import { applyCommand } from "./commands.js";
import { configIssues, drawer, initialState, posOf, shiftFor } from "../src/domain.js";
test("PostgreSQL schema, transactions, price snapshots, stock, shifts and retry keys", async () => {
  const db = new PGlite();
  const query = (sql, params) =>
    params
      ? db.query(sql, params)
      : db.exec(sql).then((results) => results.at(-1) || { rows: [] });
  const pool = { query, connect: async () => ({ query, release() {} }) };
  try {
    const result = await verifyEmptyDatabase(pool);
    assert.equal(result.payments, "atomic and deduplicated");
    const token = await issueSession(pool, (await createManager(pool, "boss")).id);
    const app = buildApp({ pool, origins: ["http://127.0.0.1:5173"] });
    try {
      const headers = {
        cookie: `bluebar_session=${token}`,
        "x-bluebar-client": "1",
        host: "localhost",
        origin: "http://127.0.0.1:5173",
      };
      const state = await app.inject({ url: "/api/state", headers });
      assert.equal(state.statusCode, 200);
      assert.equal(state.json().state.invoices.length, 2);
      assert.equal(
        (
          await app.inject({
            url: "/api/state",
            headers: { ...headers, origin: "https://evil.example" },
          })
        ).statusCode,
        403,
      );
      assert.equal(
        (
          await app.inject({
            url: "/api/state",
            headers: { host: "localhost" },
          })
        ).statusCode,
        403,
      );
      assert.equal(
        (
          await app.inject({
            url: "/api/state",
            headers: { ...headers, host: "evil.example" },
          })
        ).statusCode,
        403,
      );
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/api/commands",
            headers,
            payload: { type: "unknown" },
          })
        ).statusCode,
        400,
      );
    } finally {
      await app.close();
    }
  } finally {
    await db.close();
  }
});
test("missing database returns actionable error without credentials", async () => {
  const app = buildApp({ pool: null });
  try {
    const r = await app.inject({
      url: "/api/state",
      headers: { host: "localhost", "x-bluebar-client": "1" },
    });
    assert.equal(r.statusCode, 503);
    assert.match(r.json().error, /DATABASE_URL/);
  } finally {
    await app.close();
  }
});
test("server validates product, stock, category and staff inputs", () => {
  const s = initialState();
  assert.throws(() =>
    applyCommand(s, "product.save", {
      name: " ",
      price: 100,
      category: "Kafe",
    }),
  );
  assert.throws(() =>
    applyCommand(s, "product.save", {
      name: "New",
      price: -1,
      category: "Kafe",
    }),
  );
  assert.throws(() =>
    applyCommand(s, "stock.receive", { productId: 1, qty: 1.5 }),
  );
  assert.throws(() => applyCommand(s, "category.create", { name: "kafe" }));
  assert.throws(() =>
    applyCommand(s, "waiter.create", { name: "Ardit Hoxha" }),
  );
});
test("departments route products by station, orthogonally to category", () => {
  const s = { ...initialState(), departments: ["Bar"] };
  // Case-insensitive duplicate, like categories.
  assert.throws(() => applyCommand(s, "department.create", { name: "bar" }));
  // Referencing a department that doesn't exist yet is rejected.
  assert.throws(() =>
    applyCommand(s, "product.save", {
      name: "Pica",
      price: 500,
      category: "Ushqim",
      department: "Kuzhinë",
    }),
  );
  const withDept = applyCommand(s, "product.save", {
    name: "Shpritz",
    price: 350,
    category: "Pije",
    department: "Bar",
  }).state;
  assert.equal(withDept.products.find((x) => x.name === "Shpritz").department, "Bar");
  // Omitting department on an existing product preserves it, matching how price/category
  // are updated without needing every field re-sent.
  const productId = withDept.products.find((x) => x.name === "Shpritz").id;
  const updated = applyCommand(withDept, "product.save", {
    id: productId,
    name: "Shpritz",
    price: 400,
    category: "Pije",
  }).state;
  assert.equal(updated.products.find((x) => x.id === productId).department, "Bar");
  const created = applyCommand(s, "department.create", { name: "Kuzhinë" }).state;
  assert.deepEqual(created.departments, ["Bar", "Kuzhinë"]);
});
test("tables.save confirms several new/edited/moved tables at once, all or nothing", () => {
  const s = initialState();
  const next = applyCommand(s, "tables.save", {
    tables: [
      { area: "Tarraca", shape: "Rreth", seats: 2 },
      { area: "Tarraca", shape: "Rreth", seats: 2 },
      { id: 1, area: "Salla", shape: "Oval", seats: 8, posX: 40, posY: 60 },
    ],
  }).state;
  const added = next.tables.slice(-2);
  assert.deepEqual(added.map((t) => [t.area, t.shape, t.seats]), [["Tarraca", "Rreth", 2], ["Tarraca", "Rreth", 2]]);
  assert.notDeepEqual([added[0].posX, added[0].posY], [added[1].posX, added[1].posY], "each new table gets its own spot");
  const edited = next.tables.find((t) => t.id === 1);
  assert.deepEqual([edited.shape, edited.seats, edited.posX, edited.posY], ["Oval", 8, 40, 60]);
  assert.throws(() =>
    applyCommand(s, "tables.save", { tables: [{ area: "Tarraca", shape: "Rreth" }, { area: "Salla", shape: "Trekëndësh" }] }),
  );
  assert.throws(() => applyCommand(s, "tables.save", { tables: [] }));
});
test("two tills in two zones, a bar station in each: tickets, bills and drawers stay with their own", () => {
  let s = { ...initialState(), openShifts: [], departments: [] };
  const run = (type, payload, actor = { role: "manager", name: "boss" }) => {
    const r = applyCommand(s, type, payload, actor);
    s = r.state;
    return r.result;
  };
  // Tables 1-8 are Salla, 9-12 Tarraca (the seed).
  run("pos.save", { id: 1, name: "Bari brenda", areas: ["Salla"] });
  run("pos.save", { name: "Bari jashtë", areas: ["Tarraca"] });
  run("department.create", { name: "Bar" });
  run("department.create", { name: "Kuzhinë" });
  run("product.save", { name: "Kafe X", price: 100, category: "Kafe", department: "Bar" });
  run("product.save", { name: "Pica X", price: 700, category: "Ushqim", department: "Kuzhinë" });
  const kafe = s.products.find((p) => p.name === "Kafe X").id, pica = s.products.find((p) => p.name === "Pica X").id;
  run("stock.receive", { productId: kafe, qty: 50 });
  run("stock.receive", { productId: pica, qty: 50 });
  run("station.save", { name: "Banaku brenda", departments: ["Bar"], areas: ["Salla"] });
  run("station.save", { name: "Banaku jashtë", departments: ["Bar"], areas: ["Tarraca"], backupId: 1 });
  run("station.save", { name: "Kuzhina", departments: ["Kuzhinë"], areas: [] });
  const waiter = s.waiters[0].id;
  const order = (tableId, ...products) => {
    for (const productId of products) run("order.add", { tableId, productId, waiterId: waiter });
    const tickets = run("order.send", { tableId }).tickets;
    return Object.fromEntries(tickets.map((k) => [k.department, [k.station, k.posId]]));
  };
  // A till without an open shift takes no orders on its tables.
  assert.throws(() => run("order.add", { tableId: 9, productId: kafe, waiterId: waiter }), /[Tt]urn/);
  run("shift.open", { posId: 1, opening: 1000 });
  run("shift.open", { posId: 2, opening: 500 });
  assert.deepEqual(order(1, kafe, pica), { Bar: [1, 1], Kuzhinë: [3, 1] });
  assert.deepEqual(order(9, kafe, pica), { Bar: [2, 2], Kuzhinë: [3, 2] });
  run("order.pay", { tableId: 1, method: "Cash", received: 800 });
  run("order.pay", { tableId: 9, method: "Kartë" });
  assert.deepEqual([drawer(s, shiftFor(s, 1)).expected, drawer(s, shiftFor(s, 2)).expected], [1800, 500]);
  // The outside bar is off: the inside bar makes its drinks, the bill stays outside.
  run("station.toggle", { id: 2 });
  assert.deepEqual(order(10, kafe), { Bar: [1, 2] });
  run("station.toggle", { id: 2 });
  // The guests move inside: the ticket follows the table, the inside till collects.
  run("order.move", { tableId: 10, toTableId: 2 });
  assert.equal(s.tickets.at(-1).table, 2);
  run("order.pay", { tableId: 2, method: "Cash", received: 100 });
  assert.equal(drawer(s, shiftFor(s, 1)).expected, 1900);
  run("shift.close", { posId: 2, counted: 500 });
  assert.throws(() => run("order.add", { tableId: 9, productId: kafe, waiterId: waiter }));
  run("order.add", { tableId: 1, productId: kafe, waiterId: waiter });
  assert.equal(s.products.find((p) => p.id === kafe).stock, 47, "one stock for both tills: three sold, the open one only reserved");
  // A new zone no till or bar station claims: the first till's, and flagged under Stacionet.
  run("table.save", { area: "Kopshti", shape: "Rreth", seats: 2 });
  const garden = s.tables.find((t) => t.area === "Kopshti");
  assert.equal(posOf(s, garden), 1);
  assert.deepEqual(order(garden.id, kafe, pica), { Bar: [null, 1], Kuzhinë: [3, 1] });
  assert.ok(configIssues(s).some((i) => i.level === "error" && i.group === "Stacionet" && i.text.includes('Bar në zonën "Kopshti"')));
});
