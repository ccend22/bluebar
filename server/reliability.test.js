// What service depends on when things go wrong: several devices at once, a request cut
// off mid-payment, a server restart, a printer that's gone, history that must not move.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "./migrate.js";
import { execute, executeOrderPatch, readSnapshot } from "./repository.js";
import { agentStatus, finishJob, pendingJobs } from "./printing.js";

async function venue() {
  const db = new PGlite();
  const query = (sql, params) => (params ? db.query(sql, params) : db.exec(sql).then((r) => r.at(-1) || { rows: [] }));
  const pool = { query, connect: async () => ({ query, release() {} }) };
  await migrate(pool);
  const run = async (type, payload, id = randomUUID()) =>
    execute(pool, { id, version: (await readSnapshot(pool)).version, type, payload });
  await run("waiter.create", { name: "Ana" });
  await run("shift.open", { opening: 1000 });
  await run("product.save", { name: "Espresso", price: 100, category: "Kafe", department: "Bar" });
  await run("stock.receive", { productId: 1, qty: 10 });
  return { db, pool, run };
}

test("a payment retried after a dropped connection is applied once", async () => {
  const { db, pool, run } = await venue();
  try {
    await run("order.add", { tableId: 1, productId: 1, waiterId: 1 });
    const command = { id: randomUUID(), version: (await readSnapshot(pool)).version, type: "order.pay", payload: { tableId: 1, method: "Cash", received: 100 } };
    const first = await execute(pool, command);
    // The device never saw the answer and sends the very same command again.
    const again = await execute(pool, command);
    assert.equal(again.replayed, true);
    assert.equal(again.result.invoiceId, first.result.invoiceId);
    const state = (await readSnapshot(pool)).state;
    assert.equal(state.invoices.length, 1);
    assert.equal(state.products[0].stock, 9, "stock taken once");
    // The same id reused for a different payment is refused, not applied.
    await assert.rejects(execute(pool, { ...command, payload: { ...command.payload, method: "Kartë" } }), /identifikues/);
  } finally {
    await db.close();
  }
});

test("two devices changing the same venue: a stale write is refused, never silently merged", async () => {
  const { db, pool, run } = await venue();
  try {
    const seen = (await readSnapshot(pool)).version;
    // Device A adds an espresso; device B, still on the old version, tries to pay.
    await executeOrderPatch(pool, { id: randomUUID(), version: seen, type: "order.add", payload: { tableId: 1, productId: 1, waiterId: 1 } });
    await assert.rejects(
      execute(pool, { id: randomUUID(), version: seen, type: "order.cancel", payload: { tableId: 1, reason: "Gabim" } }),
      (e) => e.statusCode === 409,
    );
    // Two devices that both read the same version: the first write wins, the second is
    // refused until it refreshes. (PGlite has a single connection, so true parallelism
    // is Postgres's job: the version row is locked FOR UPDATE inside each transaction.)
    const now = (await readSnapshot(pool)).version;
    const add = () => executeOrderPatch(pool, { id: randomUUID(), version: now, type: "order.add", payload: { tableId: 2, productId: 1, waiterId: 1 } });
    await add();
    await assert.rejects(add(), (e) => e.statusCode === 409);
    assert.equal((await readSnapshot(pool)).state.tables[1].lines[0].qty, 1);
    await run("order.add", { tableId: 2, productId: 1, waiterId: 1 });
    assert.equal((await readSnapshot(pool)).state.tables[1].lines[0].qty, 2, "after refreshing, the second device goes through");
  } finally {
    await db.close();
  }
});

test("after a server restart, open orders, tickets and queued prints are all still there", async () => {
  const { db, pool, run } = await venue();
  try {
    await run("printer.save", { name: "Bari", host: "192.168.1.50", departments: ["Bar"] });
    await run("order.add", { tableId: 3, productId: 1, waiterId: 1 });
    await run("order.send", { tableId: 3 });
    // A new process reads the same database: nothing lives only in memory.
    const restarted = (await readSnapshot(pool)).state;
    assert.equal(restarted.tables[2].lines[0].qty, 1);
    assert.equal(restarted.tickets.length, 1);
    assert.equal((await pendingJobs(pool, "BlueBar")).length, 1);
  } finally {
    await db.close();
  }
});

test("a printer that fails keeps its job queued, is reported, and the sale is unaffected", async () => {
  const { db, pool, run } = await venue();
  try {
    await run("printer.save", { name: "Arka", host: "192.168.1.60", receipts: true, departments: [] });
    await run("order.add", { tableId: 1, productId: 1, waiterId: 1 });
    const paid = await run("order.pay", { tableId: 1, method: "Kartë" });
    const [job] = await pendingJobs(pool, "BlueBar");
    await finishJob(pool, job.id, false, "ECONNREFUSED");
    // Still pending (retried by the agent), flagged in the status, the invoice untouched.
    assert.equal((await pendingJobs(pool, "BlueBar")).length, 1);
    assert.deepEqual((await agentStatus(pool)).failing, [1]);
    assert.equal((await readSnapshot(pool)).state.invoices[0].id, paid.result.invoiceId);
    await finishJob(pool, job.id, true);
    assert.equal((await pendingJobs(pool, "BlueBar")).length, 0);
  } finally {
    await db.close();
  }
});

test("financial history doesn't move: price changes, cancellations and table edits leave invoices and stock alone", async () => {
  const { db, pool, run } = await venue();
  try {
    await run("order.add", { tableId: 1, productId: 1, waiterId: 1 });
    await run("order.pay", { tableId: 1, method: "Cash", received: 100 });
    await run("product.save", { id: 1, name: "Espresso", price: 150, category: "Kafe", department: "Bar" });
    let state = (await readSnapshot(pool)).state;
    assert.equal(state.invoices[0].lines[0].price, 100, "the invoice keeps the price it was sold at");
    await assert.rejects(run("table.delete", { id: 1 }), /histori faturash/);
    // A prepared order cancelled before payment: stock is only taken at payment, and a
    // cancellation never puts anything back by itself (a loss is recorded by hand).
    await run("order.add", { tableId: 2, productId: 1, waiterId: 1 });
    await run("order.send", { tableId: 2 });
    await run("order.cancel", { tableId: 2, reason: "Klienti iku" });
    state = (await readSnapshot(pool)).state;
    assert.equal(state.products[0].stock, 9);
    await run("stock.adjust", { productId: 1, qty: -1, reason: "Humbje", note: "kafe e bërë, e pa paguar" });
    state = (await readSnapshot(pool)).state;
    assert.equal(state.products[0].stock, 8);
    assert.deepEqual(state.movements.at(-1), { ...state.movements.at(-1), kind: "loss", qty: -1, reason: "Humbje: kafe e bërë, e pa paguar" });
    await assert.rejects(run("stock.adjust", { productId: 1, qty: -100, reason: "Humbje" }), /vetëm 8/);
    await assert.rejects(run("stock.adjust", { productId: 1, qty: -1, reason: "Pa arsye" }), /arsyen/);
  } finally {
    await db.close();
  }
});

test("a product taken off the menu for now can't be ordered; its stock and history stay", async () => {
  const { db, pool, run } = await venue();
  try {
    await run("product.stockRules", { productId: 1, available: false, minStock: 3 });
    await assert.rejects(run("order.add", { tableId: 1, productId: 1, waiterId: 1 }), /nuk është në dispozicion/);
    await assert.rejects(
      executeOrderPatch(pool, { id: randomUUID(), version: (await readSnapshot(pool)).version, type: "order.add", payload: { tableId: 1, productId: 1, waiterId: 1 } }),
      /nuk është në dispozicion/,
    );
    const product = (await readSnapshot(pool)).state.products[0];
    assert.deepEqual([product.available, product.minStock, product.stock], [false, 3, 10]);
    await run("product.stockRules", { productId: 1, available: true });
    await run("order.add", { tableId: 1, productId: 1, waiterId: 1 });
  } finally {
    await db.close();
  }
});
