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
