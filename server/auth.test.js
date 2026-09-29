import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "./migrate.js";
import { buildApp } from "./app.js";
import { execute, readSnapshot } from "./repository.js";
import { createManager, ipPolicy, setWaiterPattern, setWaiterPin } from "./auth.js";

const OUTSIDE = "203.0.113.9";
async function setup(options = {}) {
  const db = new PGlite();
  const query = (sql, params) =>
    params ? db.query(sql, params) : db.exec(sql).then((r) => r.at(-1) || { rows: [] });
  const pool = { query, connect: async () => ({ query, release() {} }) };
  await migrate(pool);
  let data = await readSnapshot(pool);
  const send = async (type, payload) =>
    (data = await execute(pool, { id: randomUUID(), version: data.version, type, payload }));
  await send("waiter.create", { name: "Arben K" });
  await send("waiter.create", { name: "Elira M" });
  await setWaiterPin(pool, 1, "482913");
  await setWaiterPin(pool, 2, "739105");
  const manager = await createManager(pool, "boss");
  const app = buildApp({ pool, origins: ["http://127.0.0.1:5173"], ...options });
  const call = (method, url, { body, cookie, ip, host = "localhost" } = {}) =>
    app.inject({
      method,
      url,
      payload: body,
      remoteAddress: ip,
      headers: {
        host,
        origin: "http://127.0.0.1:5173",
        "x-bluebar-client": "1",
        ...(cookie && { cookie }),
      },
    });
  const managerLogin = (over = {}) =>
    call("POST", "/api/auth/manager-login", {
      body: { pin: manager.pin, ...over },
    });
  const waiterLogin = (waiterId, pin, ip) =>
    call("POST", "/api/auth/waiter-login", { body: { waiterId, pin }, ip });
  const cookieOf = (r) => r.headers["set-cookie"].split(";")[0];
  const close = async () => {
    await app.close();
    await db.close();
  };
  return { call, send, manager, managerLogin, waiterLogin, cookieOf, close, pool };
}

test("manager signs in with a PIN; sessions are HttpOnly and revocable", async () => {
  const t = await setup();
  try {
    assert.equal((await t.managerLogin({ pin: "000000" })).statusCode, 401);
    assert.equal((await t.managerLogin({ pin: "111119" })).statusCode, 401);
    const withStrayUsername = await t.call("POST", "/api/auth/manager-login", {
      body: { username: "boss", pin: t.manager.pin },
    });
    assert.equal(
      withStrayUsername.statusCode,
      200,
      "an unrecognised field is dropped, not rejected — PIN alone still identifies the account",
    );
    const ok = await t.managerLogin();
    assert.equal(ok.statusCode, 200);
    assert.deepEqual(ok.json(), { role: "manager", waiterId: null, name: "boss", venue: { slug: "bluebar", name: "BlueBar", loginMode: "name_pin" } });
    const setCookie = ok.headers["set-cookie"];
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    assert.doesNotMatch(setCookie, /Secure/, "dev cookies stay usable over http://localhost");
    const cookie = t.cookieOf(ok);
    const state = await t.call("GET", "/api/state", { cookie });
    assert.equal(state.statusCode, 200);
    assert.equal(state.json().state.waiters[0].hasPin, true);
    assert.equal((await t.call("GET", "/api/state")).statusCode, 401);
    await t.call("POST", "/api/auth/logout", { cookie, body: {} });
    assert.equal((await t.call("GET", "/api/state", { cookie })).statusCode, 401);
  } finally {
    await t.close();
  }
});

test("BlueBill connection check is manager-only and bound to its configured business", async () => {
  let calls = 0;
  const blueBill = {
    token: "test-secret",
    venueSlug: "bluebar",
    fetchImpl: async () => {
      calls++;
      return new Response("[]", { status: 200 });
    },
  };
  const t = await setup({ blueBill });
  try {
    const path = "/api/integrations/bluebill/connection";
    assert.equal((await t.call("GET", path)).statusCode, 401);
    const waiter = t.cookieOf(await t.waiterLogin(1, "482913"));
    assert.equal((await t.call("GET", path, { cookie: waiter })).statusCode, 403);
    const manager = t.cookieOf(await t.managerLogin());
    assert.deepEqual((await t.call("GET", path, { cookie: manager })).json(), {
      configured: true, connected: true, providerStatus: 200,
    });
    assert.equal(calls, 1);
    blueBill.venueSlug = "another-business";
    assert.deepEqual((await t.call("GET", path, { cookie: manager })).json(), {
      configured: false, connected: false,
    });
    assert.equal(calls, 1);
  } finally {
    await t.close();
  }
});

test("invoice fiscalization: not manager-only, best-effort, persisted, and idempotent on retry", async () => {
  let calls = 0;
  const blueBill = {
    token: "test-secret",
    venueSlug: "bluebar",
    fetchImpl: async (url) => {
      calls++;
      if (url.endsWith("/invoices"))
        return new Response(JSON.stringify({ data: { id: "bb-1", status: "draft" }, meta: {} }), { status: 201 });
      return new Response(
        JSON.stringify({
          data: { id: "bb-1", status: "fiscalized", fiscal: { iic: "IIC-1", fic: "FIC-1", eic: null, verificationUrl: "https://tatime.gov.al/verify", error: null } },
          meta: { alreadyFiscalized: false },
        }),
        { status: 200 },
      );
    },
  };
  const t = await setup({ blueBill });
  try {
    await t.send("shift.open", { opening: 1000 });
    await t.send("product.save", { name: "Espresso", price: 100, category: "Kafe" });
    await t.send("stock.receive", { productId: 1, qty: 10 });
    await t.send("order.add", { tableId: 1, productId: 1, waiterId: 1 });
    const manager = t.cookieOf(await t.managerLogin());
    const pay = await t.call("POST", "/api/commands", {
      cookie: manager,
      body: { id: randomUUID(), version: (await t.call("GET", "/api/state", { cookie: manager })).json().version, type: "order.pay", payload: { tableId: 1, method: "Cash", received: 100 } },
    });
    const invoiceId = pay.json().result.invoiceId;
    // order.pay itself never calls BlueBill.
    assert.equal(calls, 0);
    const path = `/api/invoices/${invoiceId}/fiscalize`;
    assert.equal((await t.call("POST", path)).statusCode, 401);
    // A waiter (not just a manager) can fiscalize — matches order.pay's own permission.
    const waiter = t.cookieOf(await t.waiterLogin(1, "482913"));
    const fiscalized = await t.call("POST", path, { cookie: waiter });
    assert.equal(fiscalized.statusCode, 200);
    const invoice = fiscalized.json().state.invoices.find((i) => i.id === invoiceId);
    assert.equal(invoice.fiscalStatus, "fiskalizuar");
    assert.equal(invoice.fiscalIic, "IIC-1");
    assert.equal(invoice.fiscalFic, "FIC-1");
    assert.equal(invoice.fiscalVerificationUrl, "https://tatime.gov.al/verify");
    assert.equal(calls, 2, "one create call, one fiscalize call");
    // Persisted, not just returned in the response.
    const after = (await t.call("GET", "/api/state", { cookie: manager })).json();
    assert.equal(after.state.invoices.find((i) => i.id === invoiceId).fiscalIic, "IIC-1");
    // Already fiscalized: a retry is a silent no-op, no second BlueBill call.
    await t.call("POST", path, { cookie: manager });
    assert.equal(calls, 2);
    // Missing invoice.
    assert.equal((await t.call("POST", "/api/invoices/9999/fiscalize", { cookie: manager })).statusCode, 404);
    // Not configured for this venue: refused up front, no BlueBill call.
    blueBill.venueSlug = "another-business";
    const unconfigured = await t.call("POST", path, { cookie: manager });
    assert.equal(unconfigured.statusCode, 503);
    assert.equal(calls, 2);
  } finally {
    await t.close();
  }
});

test("fiscalize can report a different payment method to BlueBill than the invoice's own record", async () => {
  const payloads = [];
  const blueBill = {
    token: "test-secret",
    venueSlug: "bluebar",
    fetchImpl: async (url, options) => {
      if (url.endsWith("/invoices")) {
        payloads.push({ idempotencyKey: options.headers["Idempotency-Key"], body: JSON.parse(options.body) });
        return new Response(JSON.stringify({ data: { id: "bb-1", status: "draft" }, meta: {} }), { status: 201 });
      }
      return new Response(
        JSON.stringify({
          data: { id: "bb-1", status: "fiscalized", fiscal: { iic: "IIC-1", fic: "FIC-1", eic: null, verificationUrl: "url", error: null } },
          meta: {},
        }),
        { status: 200 },
      );
    },
  };
  const t = await setup({ blueBill });
  try {
    await t.send("shift.open", { opening: 1000 });
    await t.send("product.save", { name: "Espresso", price: 100, category: "Kafe" });
    await t.send("stock.receive", { productId: 1, qty: 10 });
    await t.send("order.add", { tableId: 1, productId: 1, waiterId: 1 });
    const manager = t.cookieOf(await t.managerLogin());
    const pay = await t.call("POST", "/api/commands", {
      cookie: manager,
      body: { id: randomUUID(), version: (await t.call("GET", "/api/state", { cookie: manager })).json().version, type: "order.pay", payload: { tableId: 1, method: "Cash", received: 100 } },
    });
    const invoiceId = pay.json().result.invoiceId;
    const fiscalized = await t.call("POST", `/api/invoices/${invoiceId}/fiscalize`, { cookie: manager, body: { method: "Kartë" } });
    assert.equal(fiscalized.statusCode, 200);
    assert.equal(payloads[0].body.paymentMethod, "Card", "invoice was paid Cash, but the override reports Card to BlueBill");
    assert.match(payloads[0].idempotencyKey, /-Kartë$/);
  } finally {
    await t.close();
  }
});

test("manager can switch waiter login mode; pin_only lets a waiter sign in by PIN alone", async () => {
  const t = await setup();
  try {
    const manager = t.cookieOf(await t.managerLogin());
    assert.equal((await t.call("PUT", "/api/venue/login-mode", { body: { loginMode: "pin_only" } })).statusCode, 401);
    const waiterCookie = t.cookieOf(await t.waiterLogin(1, "482913"));
    assert.equal((await t.call("PUT", "/api/venue/login-mode", { cookie: waiterCookie, body: { loginMode: "pin_only" } })).statusCode, 403);
    const saved = await t.call("PUT", "/api/venue/login-mode", { cookie: manager, body: { loginMode: "pin_only" } });
    assert.equal(saved.statusCode, 200);
    assert.deepEqual(saved.json(), { loginMode: "pin_only" });
    assert.equal((await t.call("GET", "/api/auth/session", { cookie: manager })).json().venue.loginMode, "pin_only");
    // A waiter can now sign in with just their PIN, no waiterId.
    assert.equal((await t.call("POST", "/api/auth/waiter-login", { body: { pin: "482913" } })).statusCode, 200);
    assert.equal((await t.call("POST", "/api/auth/waiter-login", { body: { pin: "000000" } })).statusCode, 401);
    assert.equal((await t.call("PUT", "/api/venue/login-mode", { cookie: manager, body: { loginMode: "carrier-pigeon" } })).statusCode, 400);
  } finally {
    await t.close();
  }
});

test("manager sets waiter patterns before enabling pattern login", async () => {
  const t = await setup();
  try {
    const manager = t.cookieOf(await t.managerLogin());
    const waiter = t.cookieOf(await t.waiterLogin(1, "482913"));
    const path = "/api/accounts/waiters/1/pattern";
    const pattern = [1, 2, 5, 8];
    assert.equal((await t.call("PUT", path, { body: { pattern } })).statusCode, 401);
    assert.equal((await t.call("PUT", path, { cookie: waiter, body: { pattern } })).statusCode, 403);
    assert.equal((await t.call("PUT", path, { cookie: manager, body: { pattern: [1, 2, 2, 3] } })).statusCode, 400);
    assert.equal((await t.call("PUT", path, { cookie: manager, body: { pattern } })).statusCode, 200);
    const stored = (await t.pool.query("SELECT pattern_hash FROM bluebar.accounts WHERE waiter_id = 1")).rows[0];
    assert.ok(stored.pattern_hash.startsWith("s1$"));
    assert.ok(!stored.pattern_hash.includes(pattern.join("-")));
    const state = (await t.call("GET", "/api/state", { cookie: manager })).json();
    assert.equal(state.state.waiters[0].hasPattern, true);
    assert.equal(state.state.waiters[1].hasPattern, false);
    assert.equal((await t.call("PUT", "/api/venue/login-mode", { cookie: manager, body: { loginMode: "pattern" } })).statusCode, 400);
    assert.equal((await t.call("PUT", "/api/accounts/waiters/2/pattern", { cookie: manager, body: { pattern: [3, 2, 5, 8] } })).statusCode, 200);
    assert.equal((await t.call("PUT", "/api/venue/login-mode", { cookie: manager, body: { loginMode: "pattern" } })).statusCode, 200);
    assert.equal((await t.call("POST", "/api/auth/waiter-login", { body: { waiterId: 1, pin: "482913" } })).statusCode, 403);
    assert.equal((await t.call("POST", "/api/auth/waiter-pattern", { body: { waiterId: 1, pattern: [1, 2, 5, 9] } })).statusCode, 401);
    assert.equal((await t.call("POST", "/api/auth/waiter-pattern", { body: { waiterId: 1, pattern }, ip: OUTSIDE })).statusCode, 403);
    const signedIn = await t.call("POST", "/api/auth/waiter-pattern", { body: { waiterId: 1, pattern } });
    assert.equal(signedIn.statusCode, 200);
    assert.equal(signedIn.json().waiterId, 1);
    assert.equal((await t.call("GET", "/api/auth/waiters")).json().waiters.every((w) => w.hasPattern), true);
    await t.pool.query("UPDATE bluebar.accounts SET secret_hash = NULL WHERE waiter_id = 1");
    assert.equal((await t.call("PUT", "/api/venue/login-mode", { cookie: manager, body: { loginMode: "name_pin" } })).statusCode, 400);
    assert.equal((await t.call("PUT", "/api/accounts/waiters/1/pin", { cookie: manager, body: { pin: "482913" } })).statusCode, 200);
    assert.equal((await t.call("PUT", "/api/venue/login-mode", { cookie: manager, body: { loginMode: "name_pin" } })).statusCode, 200);
    assert.equal((await t.call("POST", "/api/auth/waiter-pattern", { body: { waiterId: 1, pattern } })).statusCode, 403);
  } finally {
    await t.close();
  }
});

test("legacy fingerprint preview returns to working PIN login during migration", async () => {
  const t = await setup();
  try {
    await t.pool.query("ALTER TABLE bluebar_catalog.venues DROP CONSTRAINT venues_login_mode_check");
    await t.pool.query("ALTER TABLE bluebar_catalog.venues ADD CONSTRAINT venues_login_mode_check CHECK (login_mode IN ('name_pin', 'pin_only', 'fingerprint'))");
    await t.pool.query("UPDATE bluebar_catalog.venues SET login_mode = 'fingerprint' WHERE slug = 'bluebar'");
    await migrate(t.pool);
    assert.equal((await t.pool.query("SELECT login_mode FROM bluebar_catalog.venues WHERE slug = 'bluebar'")).rows[0].login_mode, "name_pin");
    assert.equal((await t.waiterLogin(1, "482913")).statusCode, 200);
  } finally {
    await t.close();
  }
});

test("order.send gives each department its own ticket; stations mark them done; tickets outlive payment", async () => {
  const t = await setup();
  try {
    await t.send("shift.open", { opening: 1000 });
    await t.send("product.save", { name: "Macchiato", price: 120, category: "Kafe", department: "Bar" });
    await t.send("product.save", { name: "Tiramisu", price: 300, category: "Ushqim", department: "Ëmbëltore" });
    await t.send("product.save", { name: "Picë", price: 600, category: "Ushqim", department: "Restorant" });
    for (const id of [1, 2, 3]) await t.send("stock.receive", { productId: id, qty: 10 });
    const waiter = t.cookieOf(await t.waiterLogin(1, "482913"));
    const manager = t.cookieOf(await t.managerLogin());
    const cmd = async (cookie, type, payload) => {
      const version = (await t.call("GET", "/api/state", { cookie: manager })).json().version;
      return t.call("POST", "/api/commands", { cookie, body: { id: randomUUID(), version, type, payload } });
    };
    const add = (productId) => cmd(waiter, "order.add", { tableId: 1, productId, waiterId: 1 });
    const state = async () => (await t.call("GET", "/api/state", { cookie: manager })).json().state;

    // One order with three stations' items -> three separate tickets, one per station.
    await add(1); await add(1); await add(2); await add(3);
    const first = await cmd(waiter, "order.send", { tableId: 1 });
    assert.equal(first.statusCode, 200, first.body);
    assert.deepEqual(
      first.json().result.tickets.map((k) => [k.round, k.department, k.lines.map((l) => [l.name, l.qty])]),
      [[1, "Bar", [["Macchiato", 2]]], [1, "Ëmbëltore", [["Tiramisu", 1]]], [1, "Restorant", [["Picë", 1]]]],
    );
    assert.deepEqual((await state()).tables[0].lines.map((l) => [l.qty, l.sent]), [[2, 2], [1, 1], [1, 1]]);
    assert.equal((await cmd(waiter, "order.send", { tableId: 1 })).statusCode, 400, "nothing new to send");

    // Already sent: a waiter can't quietly take it off the bill; an unsent unit they can.
    assert.equal((await cmd(waiter, "order.remove", { tableId: 1, productId: 1 })).statusCode, 403);
    await add(1);
    assert.equal((await cmd(waiter, "order.remove", { tableId: 1, productId: 1 })).statusCode, 200);

    // Round 2 carries only the new unit, only to its own station.
    await add(1);
    const second = (await cmd(waiter, "order.send", { tableId: 1 })).json().result;
    assert.deepEqual(second.tickets.map((k) => [k.round, k.department, k.lines[0].qty]), [[2, "Bar", 1]]);

    // The bar finishes both of its tickets (a waiter account on the bar's device).
    const tickets = (await state()).tickets;
    assert.equal(tickets.length, 4);
    for (const k of tickets.filter((k) => k.department === "Bar"))
      assert.equal((await cmd(waiter, "ticket.done", { id: k.id })).statusCode, 200);

    // The customer pays before the pizza is made: one full invoice of everything,
    // finished bar tickets are gone, but the kitchen and pastry still see theirs.
    const pay = await cmd(manager, "order.pay", { tableId: 1, method: "Kartë" });
    const invoiceId = pay.json().result.invoiceId;
    const invoice = pay.json().state.invoices.find((i) => i.id === invoiceId);
    assert.deepEqual(invoice.lines.map((l) => [l.name, l.qty]), [["Macchiato", 3], ["Tiramisu", 1], ["Picë", 1]]);
    const after = (await state()).tickets;
    assert.deepEqual(after.map((k) => [k.department, k.invoice]), [["Ëmbëltore", invoiceId], ["Restorant", invoiceId]]);

    // The next customer at the same table starts again at round 1.
    await add(2);
    const next = (await cmd(waiter, "order.send", { tableId: 1 })).json().result;
    assert.equal(next.round, 1);

    // Finishing a paid ticket removes it from the station.
    for (const k of after) await cmd(waiter, "ticket.done", { id: k.id });
    assert.deepEqual((await state()).tickets.map((k) => [k.department, k.round, k.invoice]), [["Ëmbëltore", 1, null]]);

    // Cancelling an order leaves the unfinished ticket on the station, marked cancelled.
    await cmd(manager, "order.cancel", { tableId: 1, reason: "Klienti iku" });
    const cancelled = (await state()).tickets;
    assert.equal(cancelled.length, 1);
    assert.ok(cancelled[0].cancelledAt);
  } finally {
    await t.close();
  }
});

test("waiters are pinned to the venue IP, limited to order commands and see trimmed data", async () => {
  const t = await setup();
  try {
    const mgr = t.cookieOf(await t.managerLogin());
    await t.send("shift.open", { opening: 5000 });
    assert.equal((await t.waiterLogin(1, "482913", OUTSIDE)).statusCode, 403);
    const list = await t.call("GET", "/api/auth/waiters", { ip: OUTSIDE });
    assert.deepEqual(list.json(), { allowed: false, waiters: [] });
    const login = await t.waiterLogin(1, "482913");
    assert.equal(login.statusCode, 200);
    assert.equal(login.json().role, "waiter");
    const cookie = t.cookieOf(login);
    assert.equal((await t.call("GET", "/api/state", { cookie, ip: OUTSIDE })).statusCode, 403);
    const { state } = (await t.call("GET", "/api/state", { cookie })).json();
    assert.equal("opening" in state.shift, false);
    assert.deepEqual([state.shifts, state.movements], [[], []]);
    assert.equal("hasPin" in state.waiters[0], false);
    const command = (type, payload) =>
      t.call("POST", "/api/commands", { cookie, body: { id: randomUUID(), version: 0, type, payload } });
    assert.equal((await command("product.save", { name: "X", price: 1, category: "Kafe" })).statusCode, 403);
    assert.equal((await command("table.save", { area: "Salla" })).statusCode, 403);
    assert.equal((await command("table.toggle", { id: 1 })).statusCode, 403);
    assert.equal((await command("order.add", { tableId: 1, productId: 1, waiterId: 2 })).statusCode, 403);
    assert.notEqual((await command("order.add", { tableId: 1, productId: 1, waiterId: 1 })).statusCode, 403);
    const pinRoute = { cookie, body: { pin: "135790" } };
    assert.equal((await t.call("PUT", "/api/accounts/waiters/2/pin", pinRoute)).statusCode, 403);
    assert.equal((await t.call("PUT", "/api/accounts/waiters/2/pin", { ...pinRoute, cookie: mgr })).statusCode, 200);
    assert.equal(
      (await t.call("PUT", "/api/accounts/waiters/2/pin", { cookie: mgr, body: { pin: "111111" } })).statusCode,
      400,
    );
  } finally {
    await t.close();
  }
});

test("frequent order changes return only the affected table and remain idempotent", async () => {
  const t = await setup();
  try {
    await t.send("shift.open", { opening: 1000 });
    await t.send("product.save", { name: "Espresso", price: 100, category: "Kafe" });
    await t.send("product.save", { name: "Uji", price: 50, category: "Kafe" });
    await t.send("stock.receive", { productId: 1, qty: 10 });
    await t.send("stock.receive", { productId: 2, qty: 10 });
    const cookie = t.cookieOf(await t.managerLogin());
    const stateResponse = await t.call("GET", "/api/state", { cookie });
    const before = stateResponse.json();
    const command = {
      id: randomUUID(),
      version: before.version,
      type: "order.add",
      payload: { tableId: 1, productId: 1, waiterId: 1 },
    };
    const response = await t.call("POST", "/api/commands", { cookie, body: command });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal("state" in body, false);
    assert.equal(body.patch.table.id, 1);
    assert.equal(body.patch.table.lines[0].qty, 1);
    assert.ok(response.body.length < stateResponse.body.length / 2);
    assert.ok(body.patch.table.occupiedSince, "the hot order-add path stamps occupiedSince too");

    const replay = await t.call("POST", "/api/commands", { cookie, body: command });
    assert.equal(replay.statusCode, 200);
    assert.equal(replay.json().replayed, true);
    assert.equal(replay.json().patch.table.lines[0].qty, 1);
    const saved = (await t.call("GET", "/api/state", { cookie })).json();
    assert.equal(saved.state.tables.find((table) => table.id === 1).lines[0].qty, 1);

    // A second product on the same table must not reset the original occupiedSince.
    const firstStamp = body.patch.table.occupiedSince;
    const add2 = await t.call("POST", "/api/commands", {
      cookie,
      body: { id: randomUUID(), version: replay.json().version, type: "order.add", payload: { tableId: 1, productId: 2, waiterId: 1 } },
    });
    assert.equal(add2.json().patch.table.occupiedSince, firstStamp);

    // Removing one of two products leaves the table occupied.
    const removeOne = await t.call("POST", "/api/commands", {
      cookie,
      body: { id: randomUUID(), version: add2.json().version, type: "order.remove", payload: { tableId: 1, productId: 2 } },
    });
    assert.equal(removeOne.json().patch.table.lines.length, 1);
    assert.equal(removeOne.json().patch.table.occupiedSince, firstStamp);

    // Removing the last product clears occupiedSince (avoiding the CTE-visibility
    // trap: a data-modifying CTE can't see another CTE's writes in the same statement).
    const removeLast = await t.call("POST", "/api/commands", {
      cookie,
      body: { id: randomUUID(), version: removeOne.json().version, type: "order.remove", payload: { tableId: 1, productId: 1 } },
    });
    assert.equal(removeLast.json().patch.table.lines.length, 0);
    assert.equal(removeLast.json().patch.table.occupiedSince, null);
  } finally {
    await t.close();
  }
});

test("five wrong PINs lock the account until a manager resets it", async () => {
  const t = await setup();
  try {
    for (let i = 0; i < 5; i++) assert.equal((await t.waiterLogin(2, "111112")).statusCode, 401);
    assert.equal((await t.waiterLogin(2, "739105")).statusCode, 401, "correct PIN is refused while locked");
    const mgr = t.cookieOf(await t.managerLogin());
    await t.call("PUT", "/api/accounts/waiters/2/pin", { cookie: mgr, body: { pin: "246810" } });
    assert.equal((await t.waiterLogin(2, "246810")).statusCode, 200);
  } finally {
    await t.close();
  }
});

test("five wrong manager PINs lock the account until it is reset", async () => {
  const t = await setup();
  try {
    for (let i = 0; i < 5; i++) assert.equal((await t.managerLogin({ pin: "000000" })).statusCode, 401);
    assert.equal((await t.managerLogin()).statusCode, 401, "correct PIN is refused while locked");
  } finally {
    await t.close();
  }
});

test("manager login identifies the account by PIN alone; a wrong guess locks every manager", async () => {
  const t = await setup();
  try {
    const second = await createManager(t.pool, "assistant");
    const loginAs = (pin) => t.call("POST", "/api/auth/manager-login", { body: { pin } });
    const first = await loginAs(t.manager.pin);
    assert.equal(first.statusCode, 200);
    assert.equal(first.json().name, "boss");
    const other = await loginAs(second.pin);
    assert.equal(other.statusCode, 200);
    assert.equal(other.json().name, "assistant");
    // A wrong guess can't be aimed at one account without a username, so it is charged
    // against every eligible manager row.
    for (let i = 0; i < 5; i++) assert.equal((await loginAs("000000")).statusCode, 401);
    assert.equal((await loginAs(t.manager.pin)).statusCode, 401, "boss is locked too");
    assert.equal((await loginAs(second.pin)).statusCode, 401, "assistant is locked too");
  } finally {
    await t.close();
  }
});

test("deactivating a waiter ends their session immediately", async () => {
  const t = await setup();
  try {
    const cookie = t.cookieOf(await t.waiterLogin(2, "739105"));
    assert.equal((await t.call("GET", "/api/auth/session", { cookie })).statusCode, 200);
    const mgr = t.cookieOf(await t.managerLogin());
    const state = (await t.call("GET", "/api/state", { cookie: mgr })).json();
    const off = await t.call("POST", "/api/commands", {
      cookie: mgr,
      body: { id: randomUUID(), version: state.version, type: "waiter.toggle", payload: { waiterId: 2 } },
    });
    assert.equal(off.statusCode, 200);
    assert.equal((await t.call("GET", "/api/auth/session", { cookie })).statusCode, 401);
    assert.equal((await t.waiterLogin(2, "739105")).statusCode, 401);
  } finally {
    await t.close();
  }
});

test("production cookies use the __Host- prefix and Secure", async () => {
  const t = await setup({ secureCookies: true });
  try {
    const cookie = (await t.managerLogin()).headers["set-cookie"];
    assert.match(cookie, /^__Host-session=/);
    assert.match(cookie, /; Secure/);
    assert.match(cookie, /Path=\//);
  } finally {
    await t.close();
  }
});

test("a custom allowedHosts list replaces the localhost-only default", async () => {
  const t = await setup({ allowedHosts: ["bluebar.example.com"] });
  try {
    const deployed = await t.call("GET", "/api/health", { host: "bluebar.example.com" });
    assert.equal(deployed.statusCode, 200);
    const oldDefault = await t.call("GET", "/api/health", { host: "localhost" });
    assert.equal(oldDefault.statusCode, 403);
  } finally {
    await t.close();
  }
});

test("IP policy handles CIDR, IPv4-mapped IPv6 and defaults to loopback", () => {
  const venue = ipPolicy(["203.0.113.0/24"]);
  assert.ok(venue("203.0.113.7") && venue("::ffff:203.0.113.7"));
  assert.ok(!venue("203.0.114.1") && !venue("127.0.0.1") && !venue("not-an-ip"));
  const dev = ipPolicy([]);
  assert.ok(dev("127.0.0.1") && dev("::1") && !dev(OUTSIDE));
  assert.throws(() => ipPolicy(["nope"]));
});


test("only managers cancel open orders, with an audit record and safe retries", async () => {
  const t = await setup();
  try {
    await t.send("shift.open", { opening: 1000 });
    await t.send("product.save", { name: "Espresso", price: 100, category: "Kafe" });
    await t.send("stock.receive", { productId: 1, qty: 10 });
    await t.send("order.add", { tableId: 1, productId: 1, waiterId: 1 });
    const cookie = t.cookieOf(await t.managerLogin());
    const before = (await t.call("GET", "/api/state", { cookie })).json();
    const waiterCookie = t.cookieOf(await t.waiterLogin(1, "482913"));
    const command = { id: randomUUID(), version: before.version, type: "order.cancel", payload: { tableId: 1, reason: "Porosi prove" } };
    assert.equal((await t.call("POST", "/api/commands", { cookie: waiterCookie, body: command })).statusCode, 403);
    assert.equal((await t.call("POST", "/api/commands", { cookie, body: { ...command, payload: { tableId: 1, reason: "" } } })).statusCode, 400);
    const response = await t.call("POST", "/api/commands", { cookie, body: command });
    assert.equal(response.statusCode, 200);
    const after = response.json();
    assert.deepEqual(after.state.tables.find(t => t.id === 1).lines, []);
    assert.equal(after.state.tables.find(t => t.id === 1).waiter, null);
    for (const key of ["products", "invoices", "movements", "shift", "shifts"]) assert.deepEqual(after.state[key], before.state[key], key);
    assert.equal(after.result.cancelled.by, "boss");
    assert.deepEqual(after.result.cancelled.lines, before.state.tables.find(t => t.id === 1).lines);
    const replay = (await t.call("POST", "/api/commands", { cookie, body: command })).json();
    assert.equal(replay.replayed, true);
    assert.equal(replay.version, after.version);
    const audit = await t.pool.query("SELECT result FROM bluebar.commands WHERE id=$1", [command.id]);
    assert.deepEqual(audit.rows[0].result, after.result);
    assert.equal((await t.call("POST", "/api/commands", { cookie, body: { ...command, id: randomUUID(), version: after.version } })).statusCode, 400);
  } finally {
    await t.close();
  }
});

test("a waiter can only pay off their own table, until they claim it via order.assign", async () => {
  const t = await setup();
  try {
    await t.send("shift.open", { opening: 1000 });
    await t.send("product.save", { name: "Espresso", price: 100, category: "Kafe" });
    await t.send("stock.receive", { productId: 1, qty: 10 });
    // Both tables start out belonging to waiter 1 (Arben K.).
    await t.send("order.add", { tableId: 1, productId: 1, waiterId: 1 });
    await t.send("order.add", { tableId: 2, productId: 1, waiterId: 1 });
    const managerCookie = t.cookieOf(await t.managerLogin());
    const currentVersion = async () => (await t.call("GET", "/api/state", { cookie: managerCookie })).json().version;
    const otherWaiter = t.cookieOf(await t.waiterLogin(2, "739105"));
    const ownerWaiter = t.cookieOf(await t.waiterLogin(1, "482913"));
    const pay = (tableId, v) => ({
      id: randomUUID(), version: v, type: "order.pay",
      payload: { tableId, method: "Kartë" },
    });
    const blocked = await t.call("POST", "/api/commands", { cookie: otherWaiter, body: pay(1, await currentVersion()) });
    assert.equal(blocked.statusCode, 400);
    assert.match(blocked.json().error, /caktuar tek një kamarier tjetër/);
    // The assigned waiter can still pay it off directly.
    const paidByOwner = await t.call("POST", "/api/commands", { cookie: ownerWaiter, body: pay(1, await currentVersion()) });
    assert.equal(paidByOwner.statusCode, 200);
    // Table 2: waiter 2 claims it via order.assign, then can pay it.
    const claim = await t.call("POST", "/api/commands", {
      cookie: otherWaiter,
      body: { id: randomUUID(), version: await currentVersion(), type: "order.assign", payload: { tableId: 2, waiterId: 2 } },
    });
    assert.equal(claim.statusCode, 200);
    const paidAfterClaim = await t.call("POST", "/api/commands", {
      cookie: otherWaiter,
      body: pay(2, await currentVersion()),
    });
    assert.equal(paidAfterClaim.statusCode, 200);
  } finally {
    await t.close();
  }
});

test("polling with the last revision gets a tiny 'unchanged' reply until something is saved", async () => {
  const t = await setup();
  try {
    const cookie = t.cookieOf(await t.managerLogin());
    const poll = async (since) => (await t.call("GET", `/api/state?since=${since}`, { cookie })).json();
    const { revision } = (await t.call("GET", "/api/state", { cookie })).json();
    assert.deepEqual(await poll(revision), { unchanged: true, revision });
    // A command, a PIN change and a pattern change each count as a change.
    await t.send("category.create", { name: "Kokteje" });
    const afterCommand = await poll(revision);
    assert.ok(afterCommand.state && afterCommand.revision > revision);
    await setWaiterPin(t.pool, 1, "739105");
    const afterPin = await poll(afterCommand.revision);
    assert.ok(afterPin.state && afterPin.revision > afterCommand.revision);
    await setWaiterPattern(t.pool, 1, [1, 5, 9, 6]);
    const afterPattern = await poll(afterPin.revision);
    assert.equal(afterPattern.state.waiters[0].hasPattern, true);
    assert.deepEqual(await poll(afterPattern.revision), { unchanged: true, revision: afterPattern.revision });
  } finally {
    await t.close();
  }
});

test("Turnet: cash in/out feeds the expected drawer, counts must add up, waiters can't touch the drawer", async () => {
  const t = await setup();
  try {
    const boss = t.cookieOf(await t.managerLogin());
    const ana = t.cookieOf(await t.waiterLogin(1, "482913"));
    const cmd = async (cookie, type, payload) => {
      const { version } = (await t.call("GET", "/api/state", { cookie: boss })).json();
      return t.call("POST", "/api/commands", { cookie, body: { id: randomUUID(), version, type, payload } });
    };
    await cmd(boss, "shift.open", { opening: 5000 });
    await cmd(boss, "product.save", { name: "Espresso", price: 150, category: "Kafe" });
    await cmd(boss, "stock.receive", { productId: 1, qty: 10 });
    for (let i = 0; i < 2; i++) await cmd(ana, "order.add", { tableId: 1, productId: 1, waiterId: 1 });
    await cmd(ana, "order.pay", { tableId: 1, method: "Cash", received: 300 });

    assert.equal((await cmd(ana, "shift.cash", { kind: "out", amount: 100, reason: "Akull" })).statusCode, 403, "waiters can't move drawer cash");
    assert.equal((await cmd(boss, "shift.cash", { kind: "out", amount: 999999, reason: "Kasaforta" })).statusCode, 400, "can't take out more than is there");
    assert.equal((await cmd(boss, "shift.cash", { kind: "in", amount: 2000, reason: "Kusur nga banka" })).statusCode, 200);
    assert.equal((await cmd(boss, "shift.cash", { kind: "out", amount: 1500, reason: "Furnitori i akullit" })).statusCode, 200);

    const state = (await t.call("GET", "/api/state", { cookie: boss })).json().state;
    assert.equal(state.shift.openedBy, "boss");
    assert.deepEqual(state.shift.cashMovements.map((m) => [m.kind, m.amount, m.reason]), [["in", 2000, "Kusur nga banka"], ["out", 1500, "Furnitori i akullit"]]);
    const waiterView = (await t.call("GET", "/api/state", { cookie: ana })).json().state;
    assert.equal(waiterView.shift.cashMovements, undefined, "waiters don't see the drawer");

    // expected = 5000 + 300 cash + 2000 in - 1500 out = 5800
    assert.equal((await cmd(boss, "shift.close", { counted: 5800, denominations: { 5000: 1, 500: 1 } })).statusCode, 400, "notes must add up to the total");
    const closed = await cmd(boss, "shift.close", { counted: 5750, denominations: { 5000: 1, 500: 1, 200: 1, 50: 1 }, note: "50 Lek kusur i gabuar" });
    assert.equal(closed.statusCode, 200, closed.body);
    const shift = closed.json().state.shifts[0];
    assert.deepEqual([shift.expected, shift.counted, shift.difference, shift.closedBy, shift.note], [5800, 5750, -50, "boss", "50 Lek kusur i gabuar"]);
    assert.deepEqual(shift.sales, { count: 1, total: 300, cash: 300, card: 0 });

    const report = (await t.call("GET", `/api/shifts/${shift.id}/report`, { cookie: boss })).json();
    assert.deepEqual([report.cash, report.cashIn, report.cashOut, report.invoiceCount], [300, 2000, 1500, 1]);
    assert.deepEqual(report.byWaiter.map((w) => [w.name, w.total]), [["Arben K", 300]]);
    assert.deepEqual(report.shift.countedDetail, { 5000: 1, 500: 1, 200: 1, 50: 1 });
    assert.equal((await t.call("GET", `/api/shifts/${shift.id}/report`, { cookie: ana })).statusCode, 403);
    // History reloads with the same numbers the close produced.
    const history = (await t.call("GET", "/api/state", { cookie: boss })).json().state.shifts[0];
    assert.deepEqual(history.sales, shift.sales);
  } finally {
    await t.close();
  }
});
