import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { migrate } from "./migrate.js";
import { readSnapshot, execute } from "./repository.js";
// Destructive test fixture: call only against a disposable, empty database/branch.
export async function verifyEmptyDatabase(pool) {
  await migrate(pool);
  await migrate(pool);
  let data = await readSnapshot(pool);
  assert.equal(data.state.invoices.length, 0);
  assert.equal(data.state.products.length, 0);
  assert.equal(data.state.waiters.length, 0);
  assert.equal(data.state.tables.length, 12);
  assert.deepEqual(data.state.openShifts, []);
  const send = async (type, payload) => {
    const cmd = { id: randomUUID(), version: data.version, type, payload };
    data = await execute(pool, cmd);
    return cmd;
  };
  await send("waiter.create", { name: "Test Waiter" });
  await send("product.save", {
    name: "Test Espresso",
    price: 100,
    category: "Kafe",
    stock: 999,
  });
  assert.equal(data.state.products[0].stock, 0);
  await send("stock.receive", { productId: 1, qty: 2 });
  await send("shift.open", { opening: 5000 });
  await send("order.add", { tableId: 1, productId: 1, waiterId: 1, price: 1 });
  await send("order.add", { tableId: 2, productId: 1, waiterId: 1 });
  assert.equal(data.state.tables[0].lines[0].price, 100);
  assert.ok(data.state.tables[0].occupiedSince, "table stamps occupiedSince once it has an order");
  assert.equal(data.state.tables[3].occupiedSince, null, "an empty table has no occupiedSince");
  const rejected = async (type, payload, pattern) =>
    assert.rejects(
      () =>
        execute(pool, {
          id: randomUUID(),
          version: data.version,
          type,
          payload,
        }),
      pattern,
    );
  // Table management: create, edit, reject invalid input, and persist across a fresh read.
  await send("table.save", { area: "Ballkon", shape: "Rreth" });
  assert.equal(data.state.tables.length, 13);
  const created = data.state.tables.find((t) => t.id === 13);
  assert.equal(created.area, "Ballkon");
  assert.equal(created.shape, "Rreth");
  assert.equal(created.active, true);
  await rejected(
    "table.save",
    { area: "Ballkon", shape: "Hexagon" },
    /[Ff]orma/,
  );
  await send("table.save", { id: 13, area: "Ballkon i sipërm", shape: "Bar" });
  assert.equal(
    (await readSnapshot(pool)).state.tables.find((t) => t.id === 13).shape,
    "Bar",
  );
  await rejected(
    "table.toggle",
    { id: 2 },
    /çaktivizoni/,
  );
  await send("table.toggle", { id: 13 });
  assert.equal(data.state.tables.find((t) => t.id === 13).active, false);
  // Deleting: refused with an open order, allowed once a table has neither an open
  // order nor any invoice history.
  await rejected("table.delete", { id: 2 }, /porosi të hapura/);
  await send("table.save", { area: "Përkohshme" });
  const scratch = data.state.tables.find((t) => t.area === "Përkohshme").id;
  await send("table.delete", { id: scratch });
  assert.equal(data.state.tables.some((t) => t.id === scratch), false);
  assert.equal(
    (await readSnapshot(pool)).state.tables.some((t) => t.id === scratch),
    false,
  );
  await rejected("table.delete", { id: 999 }, /ekziston/);
  // Floor plan: bulk position/size/rotation save, and the fields survive a fresh read.
  await send("table.layout", {
    tables: [
      { id: 1, posX: 30, posY: 40, width: 20, height: 15, rotation: 90 },
      { id: 2, posX: 70, posY: 60, width: 10, height: 10, rotation: 0 },
    ],
  });
  const laidOut = data.state.tables.find((t) => t.id === 1);
  assert.equal(laidOut.posX, 30);
  assert.equal(laidOut.rotation, 90);
  assert.equal(
    (await readSnapshot(pool)).state.tables.find((t) => t.id === 1).width,
    20,
  );
  await rejected("table.layout", { tables: [{ id: 1, posX: 200, posY: 40, width: 20, height: 15 }] }, /Pozicioni/);
  await rejected("table.layout", { tables: [{ id: 999, posX: 1, posY: 1, width: 10, height: 10 }] }, /ekziston/);
  await rejected(
    "order.add",
    { tableId: 13, productId: 1, waiterId: 1 },
    /joaktive/i,
  );
  await rejected(
    "order.add",
    { tableId: 3, productId: 1, waiterId: 1 },
    /stok/,
  );
  await rejected("shift.close", { counted: 5000 }, /porositë/);
  await rejected("waiter.toggle", { waiterId: 1 }, /Profili/);
  await rejected(
    "order.pay",
    { tableId: 1, method: "Cash", received: 50 },
    /mbulon/,
  );
  await send("product.save", {
    id: 1,
    name: "Test Espresso",
    price: 150,
    category: "Kafe",
  });
  const stale = data.version - 1;
  await assert.rejects(
    () =>
      execute(pool, {
        id: randomUUID(),
        version: stale,
        type: "stock.receive",
        payload: { productId: 1, qty: 1 },
      }),
    (e) => e.statusCode === 409,
  );
  const cmd = await send("order.pay", {
    tableId: 1,
    method: "Cash",
    received: 100,
    total: 1,
  });
  assert.equal(data.state.invoices[0].total, 100);
  assert.equal(data.state.tables[0].occupiedSince, null, "paying clears occupiedSince");
  await rejected("table.delete", { id: 1 }, /histori faturash/);
  const replay = await execute(pool, cmd);
  assert.equal(replay.replayed, true);
  assert.equal(replay.state.invoices.length, 1);
  assert.equal(replay.state.products[0].stock, 1);
  await assert.rejects(
    () =>
      execute(pool, {
        ...cmd,
        payload: { tableId: 2, method: "Cash", received: 100 },
      }),
    (e) => e.statusCode === 409,
  );
  await send("order.pay", { tableId: 2, method: "Kartë" });
  await send("shift.close", { counted: 5090 });
  assert.equal(data.state.shifts[0].expected, 5100);
  assert.equal(data.state.shifts[0].difference, -10);
  const after = await readSnapshot(pool);
  assert.equal(after.state.invoices.length, 2);
  assert.equal(after.state.invoices[0].lines[0].price, 100);
  assert.equal(after.state.products[0].stock, 0);
  assert.equal(after.state.movements.length, 3);
  await rejected(
    "order.pay",
    { tableId: 1, method: "Cash", received: 100 },
    /mbyllur/,
  );
  return {
    migrations: "idempotent",
    payments: "atomic and deduplicated",
    prices: "server authoritative",
    stock: "reservations protected",
    shifts: "reconciled",
    conflicts: "rejected",
    tables: "manager-editable, soft-removed",
    version: after.version,
  };
}
