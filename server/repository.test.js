import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { createManager, issueSession } from "./auth.js";
import { verifyEmptyDatabase } from "./verify.js";
import { buildApp } from "./app.js";
import { applyCommand } from "./commands.js";
import { initialState } from "../src/domain.js";
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
