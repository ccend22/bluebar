import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "./migrate.js";
import { buildApp } from "./app.js";
import { execute, readSnapshot } from "./repository.js";
import { createManager, setWaiterPin } from "./auth.js";

test("Arka: each waiter hands over what they took since their last handover", async () => {
  const db = new PGlite();
  const query = (sql, params) => (params ? db.query(sql, params) : db.exec(sql).then((r) => r.at(-1) || { rows: [] }));
  const pool = { query, connect: async () => ({ query, release() {} }) };
  await migrate(pool);
  let data = await readSnapshot(pool);
  const send = async (type, payload) => (data = await execute(pool, { id: randomUUID(), version: data.version, type, payload }));
  await send("waiter.create", { name: "Ana" });
  await send("waiter.create", { name: "Beni" });
  await setWaiterPin(pool, 1, "482913");
  await send("product.save", { name: "Kafe", category: "Kafe", price: 100, department: "Bar", trackStock: false });
  const kafe = data.state.products.find((p) => p.name === "Kafe").id;
  const manager = await createManager(pool, "boss");
  const app = buildApp({ pool, origins: ["http://127.0.0.1:5173"], allowedIps: ["127.0.0.1"] });
  const call = (url, { body, cookie, method = "POST" } = {}) => app.inject({ method, url, payload: body,
    headers: { host: "localhost", origin: "http://127.0.0.1:5173", "x-bluebar-client": "1", ...(cookie && { cookie }) }, remoteAddress: "127.0.0.1" });
  const cookieOf = (r) => String(r.headers["set-cookie"]).split(";")[0];
  const boss = cookieOf(await call("/api/auth/manager-login", { body: { pin: manager.pin } }));
  const cmd = async (cookie, type, payload) => {
    const { version } = (await call("/api/state", { cookie, method: "GET" })).json();
    return call("/api/commands", { cookie, body: { id: randomUUID(), version, type, payload } });
  };
  const ok = async (type, payload) => { const r = await cmd(boss, type, payload); assert.equal(r.statusCode, 200, `${type}: ${r.body}`); return r.json(); };
  // Ana: 300 cash (with a 20 tip) and 200 by card; Beni: 100 cash.
  for (let i = 0; i < 3; i++) await ok("order.add", { tableId: 1, productId: kafe, waiterId: 1 });
  await ok("order.pay", { tableId: 1, payments: [{ method: "Cash", amount: 300, tip: 20 }], received: 500 });
  for (let i = 0; i < 2; i++) await ok("order.add", { tableId: 2, productId: kafe, waiterId: 1 });
  await ok("order.pay", { tableId: 2, method: "Kartë" });
  await ok("order.add", { tableId: 3, productId: kafe, waiterId: 2 });
  await ok("order.pay", { tableId: 3, method: "Cash", received: 100 });
  // A cash refund of 50 on Ana's cash bill leaves the drawer.
  const inv = (await call("/api/state", { cookie: boss, method: "GET" })).json().state.invoices.find((i) => i.total === 300);
  await ok("invoice.refund", { invoiceId: inv.id, amount: 50, method: "Cash", reason: "Kafe e ftohtë" });

  // Counted short without a reason: refused; with one: Ana's handover records 270 expected (300 + 20 − 50).
  assert.equal((await cmd(boss, "waiter.handover", { waiterId: 1, counted: 260 })).statusCode, 400);
  const done = await ok("waiter.handover", { waiterId: 1, counted: 260, note: "Mungojnë 10 Lek" });
  const state = (await call("/api/state", { cookie: boss, method: "GET" })).json().state;
  const h = state.handovers.find((x) => x.id === done.result.handoverId);
  assert.deepEqual([h.expected, h.counted, h.card, h.tips, h.invoices, h.waiterId], [270, 260, 200, 20, 2, 1]);
  // Nothing new since: nothing to hand over. Beni's money is still his to hand over.
  assert.equal((await cmd(boss, "waiter.handover", { waiterId: 1, counted: 0 })).statusCode, 400);
  assert.equal((await cmd(boss, "waiter.handover", { waiterId: 2, counted: 100 })).statusCode, 200);
  // A waiter can't close anyone's money, their own included.
  const ana = cookieOf(await call("/api/auth/waiter-login", { body: { waiterId: 1, pin: "482913" } }));
  assert.equal((await cmd(ana, "waiter.handover", { waiterId: 1, counted: 0 })).statusCode, 403);
  // Kept across a fresh read.
  assert.equal((await readSnapshot(pool)).state.handovers.length, 2);
  await app.close();
});
