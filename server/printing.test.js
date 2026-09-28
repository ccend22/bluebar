import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "./migrate.js";
import { buildApp } from "./app.js";
import { execute, readSnapshot } from "./repository.js";
import { createManager, setWaiterPin } from "./auth.js";
import { encode, runOnce, textBytes } from "../public/bluebar-print.mjs";

// A network receipt printer: accepts raw ESC/POS on TCP and keeps what it received.
async function fakePrinter() {
  const jobs = [];
  const server = net.createServer((socket) => {
    const chunks = [];
    socket.on("data", (c) => chunks.push(c));
    socket.on("end", () => jobs.push(Buffer.concat(chunks)));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { port: server.address().port, jobs, close: () => new Promise((r) => server.close(r)) };
}
const has = (buffer, text) => buffer.includes(Buffer.from(textBytes(text)));

test("encode wraps to the paper width and keeps Albanian letters in code page 850", () => {
  const bytes = encode([{ type: "pair", left: "2 x Picë Margarita e madhe", right: "1,100 Lek" }], 32);
  assert.ok(bytes.includes(Buffer.from([0x1b, 0x74, 0x02])), "selects CP850");
  assert.ok(bytes.includes(Buffer.from([0x89])), "ë is 0x89 in CP850");
  const lines = bytes.toString("latin1").split("\n").filter((l) => l.includes("Lek") || l.includes("Pic"));
  assert.ok(lines.every((l) => l.replace(/^[\x00-\x1f\x1b@t\x02]+/, "").length <= 32));
  assert.deepEqual(textBytes("Ëmbëltore", true), [...Buffer.from("Embeltore")]);
});

test("print agent: each department's ticket reaches its own network printer; the full invoice reaches the cashier", async () => {
  const db = new PGlite();
  const query = (sql, params) => (params ? db.query(sql, params) : db.exec(sql).then((r) => r.at(-1) || { rows: [] }));
  const pool = { query, connect: async () => ({ query, release() {} }) };
  await migrate(pool);
  let data = await readSnapshot(pool);
  const seed = async (type, payload) => (data = await execute(pool, { id: randomUUID(), version: data.version, type, payload }));
  await seed("waiter.create", { name: "Ana" });
  await setWaiterPin(pool, 1, "482913");
  const manager = await createManager(pool, "boss");
  await seed("shift.open", { opening: 0 });
  for (const [name, department, category] of [["Ujë", "Bar", "Pije"], ["Picë", "Restorant", "Ushqim"], ["Tiramisu", "Ëmbëltore", "Ushqim"]]) {
    await seed("product.save", { name, price: 200, category, department });
    await seed("stock.receive", { productId: data.state.products.at(-1).id, qty: 20 });
  }

  const [bar, kitchen, cashier] = [await fakePrinter(), await fakePrinter(), await fakePrinter()];
  const app = buildApp({ pool, origins: [] });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const url = `http://127.0.0.1:${app.server.address().port}`;
  const call = (method, path, { cookie, body, key } = {}) =>
    fetch(url + path, {
      method,
      headers: {
        "x-bluebar-client": "1",
        ...(cookie && { cookie }),
        ...(key && { authorization: `Bearer ${key}` }),
        ...(body && { "content-type": "application/json" }),
      },
      body: body && JSON.stringify(body),
    });
  const login = async (path, body) => (await call("POST", path, { body })).headers.get("set-cookie").split(";")[0];
  const boss = await login("/api/auth/manager-login", { pin: manager.pin });
  const ana = await login("/api/auth/waiter-login", { waiterId: 1, pin: "482913" });
  const cmd = async (cookie, type, payload) => {
    const { version } = await (await call("GET", "/api/state", { cookie: boss })).json();
    const r = await call("POST", "/api/commands", { cookie, body: { id: randomUUID(), version, type, payload } });
    assert.equal(r.status, 200, await r.clone().text());
    return r.json();
  };
  try {
    await cmd(boss, "printer.save", { name: "Bari", host: "127.0.0.1", port: bar.port, departments: ["Bar"] });
    await cmd(boss, "printer.save", { name: "Kuzhina", host: "127.0.0.1", port: kitchen.port, width: 32, departments: ["Restorant", "Ëmbëltore"] });
    await cmd(boss, "printer.save", { name: "Arka", host: "127.0.0.1", port: cashier.port, departments: [], receipts: true });
    assert.equal((await call("POST", "/api/print/key", { cookie: ana })).status, 403, "only a manager creates the agent key");
    const { key } = await (await call("POST", "/api/print/key", { cookie: boss })).json();
    assert.equal((await call("GET", "/api/print/jobs")).status, 401);
    assert.equal((await call("GET", "/api/print/jobs", { key: "x".repeat(32) })).status, 401);
    const agent = { url, venue: "bluebar", key };

    // Water + pizza + tiramisu: one "Dërgo", three tickets, two printers.
    for (const productId of [1, 2, 3]) await cmd(ana, "order.add", { tableId: 1, productId, waiterId: 1 });
    await cmd(ana, "order.send", { tableId: 1 });
    assert.equal(await runOnce(agent), 3);
    assert.equal(bar.jobs.length, 1);
    assert.ok(has(bar.jobs[0], "BAR") && has(bar.jobs[0], "1 x Ujë") && !has(bar.jobs[0], "Picë"));
    assert.equal(kitchen.jobs.length, 2);
    assert.ok(kitchen.jobs.some((j) => has(j, "RESTORANT") && has(j, "1 x Picë")));
    assert.ok(kitchen.jobs.some((j) => has(j, "ËMBËLTORE") && has(j, "1 x Tiramisu")));
    assert.equal(cashier.jobs.length, 0);
    assert.equal(await runOnce(agent), 0, "printed jobs never print twice");

    // "Konfirmo dhe fiskalizo": the cashier's copy waits for the NIVF, then prints with it.
    await cmd(ana, "order.pay", { tableId: 1, method: "Kartë", fiscalize: true });
    assert.equal(await runOnce(agent), 0);
    await pool.query("UPDATE bluebar.invoices SET fiscal_status='fiskalizuar', fiscal_iic='IIC-9', fiscal_fic='FIC-9' WHERE id=1");
    assert.equal(await runOnce(agent), 1);
    assert.ok(has(cashier.jobs[0], "FATURË E FISKALIZUAR") && has(cashier.jobs[0], "NIVF: IIC-9"));
    assert.ok(has(cashier.jobs[0], "TOTALI") && has(cashier.jobs[0], "600 Lek"));

    // A printer that's off loses nothing: the ticket prints once it's back.
    await cmd(boss, "printer.save", { id: 1, name: "Bari", host: "127.0.0.1", port: 1, departments: ["Bar"] });
    await cmd(ana, "order.add", { tableId: 2, productId: 1, waiterId: 1 });
    await cmd(ana, "order.send", { tableId: 2 });
    assert.equal(await runOnce(agent), 0);
    const status = await (await call("GET", "/api/print/status", { cookie: boss })).json();
    assert.equal(status.pending, 1);
    assert.ok(status.lastSeen, "the agent's polling shows as online");
    await cmd(boss, "printer.save", { id: 1, name: "Bari", host: "127.0.0.1", port: bar.port, departments: ["Bar"] });
    assert.equal(await runOnce(agent), 1);
    assert.equal(bar.jobs.length, 2);

    // Reprint and test print go through the network printer too.
    assert.deepEqual(await (await call("POST", "/api/print/reprint", { cookie: ana, body: { kind: "invoice", id: "1" } })).json(), { queued: true });
    assert.equal((await call("POST", "/api/print/test", { cookie: boss, body: { printerId: 2 } })).status, 200);
    assert.equal(await runOnce(agent), 2);
    assert.ok(has(kitchen.jobs.at(-1), "PROVË PRINTIMI"));
    assert.equal(cashier.jobs.length, 2);
  } finally {
    await app.close();
    await Promise.all([bar, kitchen, cashier].map((p) => p.close()));
    await db.close();
  }
});
