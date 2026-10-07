import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "./migrate.js";
import { buildApp } from "./app.js";
import { pruneTickets } from "./commands.js";
import { execute, readSnapshot } from "./repository.js";
import { createManager, ipPolicy, setWaiterPattern, setWaiterPin } from "./auth.js";
import { configIssues } from "../src/domain.js";

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
  return { call, send, manager, managerLogin, waiterLogin, cookieOf, close, pool, inject: (o) => app.inject(o) };
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
    assert.deepEqual(ok.json(), { role: "manager", waiterId: null, name: "boss", venue: { slug: "bluebar", name: "BlueBar", loginMode: "name_pin", managerLogin: "pin_only", menuEnabled: false, menuOrdering: false } });
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
  let refuse = false;
  const blueBill = {
    token: "test-secret",
    venueSlug: "bluebar",
    fetchImpl: async (url) => {
      calls++;
      if (refuse && url.endsWith("/fiscalize"))
        return new Response(JSON.stringify({ error: { code: "66", message: "Type of invoice doesn't match payment method" } }), { status: 422 });
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
    // Refused by the tax office: recorded as failed, and the person is told why.
    refuse = true;
    const failed = (await t.call("POST", path, { cookie: waiter })).json();
    assert.equal(failed.state.invoices.find((i) => i.id === invoiceId).fiscalStatus, "dështoi");
    assert.match(failed.fiscalError, /kodi 66/);
    refuse = false;
    calls = 0;
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

test("a manager connects the business's own BlueBill token: verified, encrypted, never shown again", async () => {
  const GOOD = "bb_test_goodTokenGoodToken1234";
  const seen = [];
  const blueBill = {
    fetchImpl: async (url, options) => {
      const token = options.headers.Authorization.slice(7);
      seen.push({ url, token });
      if (token !== GOOD) return new Response("{}", { status: 401 });
      if (options.method === "GET") return new Response("[]", { status: 200 });
      if (url.endsWith("/invoices"))
        return new Response(JSON.stringify({ data: { id: "bb-1" } }), { status: 201 });
      return new Response(JSON.stringify({ data: { status: "fiscalized", fiscal: { iic: "IIC", fic: "FIC", verificationUrl: "v" } } }), { status: 200 });
    },
  };
  const t = await setup({ blueBill, secretKey: "test-secret-key-for-bluebar-tests" });
  try {
    const path = "/api/integrations/bluebill";
    const waiter = t.cookieOf(await t.waiterLogin(1, "482913"));
    assert.equal((await t.call("PUT", path, { cookie: waiter, body: { token: GOOD } })).statusCode, 403);
    const manager = t.cookieOf(await t.managerLogin());
    assert.deepEqual((await t.call("GET", path, { cookie: manager })).json(), { enabled: false, source: null, mode: null, canSave: true });
    assert.equal((await t.call("GET", "/api/state", { cookie: waiter })).json().state.fiscal.enabled, false);
    // Not token-shaped, or refused by BlueBill: nothing is stored.
    assert.equal((await t.call("PUT", path, { cookie: manager, body: { token: "hello" } })).statusCode, 400);
    const refused = await t.call("PUT", path, { cookie: manager, body: { token: "bb_test_wrongTokenWrongToken99" } });
    assert.equal(refused.statusCode, 400);
    assert.match(refused.json().error, /nuk e pranoi/);
    assert.equal((await t.pool.query("SELECT count(*)::int AS n FROM bluebar.bluebill_connection")).rows[0].n, 0);

    const saved = await t.call("PUT", path, { cookie: manager, body: { token: GOOD } });
    assert.equal(saved.statusCode, 200);
    assert.equal(saved.json().enabled, true);
    assert.equal(saved.json().mode, "test");
    assert.equal(saved.json().hint, "bb_test_…1234");
    assert.equal(saved.json().connectedBy, "boss");
    // Only ciphertext at rest; the token never comes back to any browser.
    const row = (await t.pool.query("SELECT token_cipher FROM bluebar.bluebill_connection")).rows[0];
    assert.doesNotMatch(row.token_cipher, /goodToken/);
    for (const cookie of [manager, waiter]) {
      const body = (await t.call("GET", "/api/state", { cookie })).body + (await t.call("GET", path, { cookie })).body;
      assert.doesNotMatch(body, /goodToken/);
    }
    assert.deepEqual((await t.call("GET", "/api/state", { cookie: waiter })).json().state.fiscal, { enabled: true, mode: "test" });

    // Sales now fiscalize with this business's token.
    await t.send("shift.open", { opening: 1000 });
    await t.send("product.save", { name: "Espresso", price: 100, category: "Kafe" });
    await t.send("stock.receive", { productId: 1, qty: 10 });
    await t.send("order.add", { tableId: 1, productId: 1, waiterId: 1 });
    const version = (await t.call("GET", "/api/state", { cookie: manager })).json().version;
    const pay = await t.call("POST", "/api/commands", {
      cookie: manager,
      body: { id: randomUUID(), version, type: "order.pay", payload: { tableId: 1, method: "Cash", received: 100 } },
    });
    const invoiceId = pay.json().result.invoiceId;
    const fiscalized = await t.call("POST", `/api/invoices/${invoiceId}/fiscalize`, { cookie: waiter });
    assert.equal(fiscalized.json().state.invoices.find((i) => i.id === invoiceId).fiscalStatus, "fiskalizuar");
    assert.ok(seen.filter((c) => c.url.includes("/invoices/")).every((c) => c.token === GOOD));

    // A different server key can't open it: fiscalization stops instead of misbehaving.
    const otherKey = buildApp({ pool: t.pool, origins: ["http://127.0.0.1:5173"], blueBill, secretKey: "some-other-key" });
    const status = await otherKey.inject({ method: "GET", url: path, headers: { host: "localhost", origin: "http://127.0.0.1:5173", "x-bluebar-client": "1", cookie: manager } });
    assert.equal(status.json().enabled, false);
    assert.ok(status.json().problem);
    await otherKey.close();

    const removed = await t.call("DELETE", path, { cookie: manager, body: {} });
    assert.equal(removed.json().enabled, false);
    assert.equal((await t.call("POST", `/api/invoices/${invoiceId}/fiscalize`, { cookie: manager })).statusCode, 503);
  } finally {
    await t.close();
  }
});

test("without a server encryption key, saving a token is refused", async () => {
  const t = await setup({ secretKey: undefined, blueBill: {} });
  try {
    const manager = t.cookieOf(await t.managerLogin());
    const r = await t.call("PUT", "/api/integrations/bluebill", { cookie: manager, body: { token: "bb_test_goodTokenGoodToken1234" } });
    assert.equal(r.statusCode, 503);
    assert.equal((await t.call("GET", "/api/integrations/bluebill", { cookie: manager })).json().canSave, false);
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

test("order.send gives each department its own ticket; closing the order closes them; old closed tickets are pruned", async () => {
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

    assert.equal((await state()).tickets.length, 4);
    assert.equal((await cmd(waiter, "ticket.done", { id: "x" })).statusCode, 400, "no such ticket");

    // Paying: one full invoice of everything; every ticket is marked paid but stays on
    // its station until the station marks it done.
    const pay = await cmd(manager, "order.pay", { tableId: 1, method: "Kartë" });
    const invoiceId = pay.json().result.invoiceId;
    const invoice = pay.json().state.invoices.find((i) => i.id === invoiceId);
    assert.deepEqual(invoice.lines.map((l) => [l.name, l.qty]), [["Macchiato", 3], ["Tiramisu", 1], ["Picë", 1]]);
    assert.ok((await state()).tickets.every((k) => k.invoice === invoiceId));

    // The next customer at the same table starts again at round 1.
    await add(2);
    const next = (await cmd(waiter, "order.send", { tableId: 1 })).json().result;
    assert.equal(next.round, 1);

    // Cancelling an order closes its open ticket as cancelled (the station prints a slip).
    await cmd(manager, "order.cancel", { tableId: 1, reason: "Klienti iku" });
    const tickets = (await state()).tickets;
    assert.equal(tickets.length, 5);
    assert.ok(tickets.find((k) => k.round === 1 && k.department === "Ëmbëltore" && !k.invoice).cancelledAt);

    // An hour after cancelling, a cancelled ticket is dropped; a paid one nobody marked
    // done stays (12 hours at most); an open ticket never goes.
    const invoices = (await state()).invoices;
    const open = { id: "o", table: 2, invoice: null, cancelledAt: null, doneAt: null, date: new Date(0).toISOString() };
    const paidUndone = tickets.filter((k) => k.invoice);
    assert.deepEqual(pruneTickets([...tickets, open], invoices, Date.now() + 61 * 60_000), [...paidUndone, open]);
    assert.deepEqual(pruneTickets([...tickets, open], invoices, Date.now() + 13 * 60 * 60_000), [open]);
    assert.equal(pruneTickets(tickets, invoices).length, 5, "not yet");
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
    assert.equal("opening" in state.openShifts[0], false);
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
    for (const key of ["products", "invoices", "movements", "openShifts", "shifts"]) assert.deepEqual(after.state[key], before.state[key], key);
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
    assert.equal(state.openShifts[0].openedBy, "boss");
    assert.deepEqual(state.openShifts[0].cashMovements.map((m) => [m.kind, m.amount, m.reason]), [["in", 2000, "Kusur nga banka"], ["out", 1500, "Furnitori i akullit"]]);
    const waiterView = (await t.call("GET", "/api/state", { cookie: ana })).json().state;
    assert.equal(waiterView.openShifts[0].cashMovements, undefined, "waiters don't see the drawer");

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

test("Kasat: each till has its own shift and drawer, waiters stay at their till, stock is shared", async () => {
  const t = await setup();
  try {
    const boss = t.cookieOf(await t.managerLogin());
    const arben = t.cookieOf(await t.waiterLogin(1, "482913"));
    const cmd = async (cookie, type, payload) => {
      const { version } = (await t.call("GET", "/api/state", { cookie: boss })).json();
      return t.call("POST", "/api/commands", { cookie, body: { id: randomUUID(), version, type, payload } });
    };
    const ok = async (...args) => {
      const r = await cmd(...args);
      assert.equal(r.statusCode, 200, r.body);
      return r.json().state;
    };
    // Tables 1-8 are Salla, 9-12 Tarraca (the seed).
    await ok(boss, "pos.save", { id: 1, name: "Bari brenda", areas: ["Salla"] });
    await ok(boss, "pos.save", { name: "Bari jashtë", areas: ["Tarraca"] });
    assert.equal((await cmd(boss, "pos.save", { name: "bari JASHTË", areas: [] })).statusCode, 400, "names are unique");
    await ok(boss, "waiter.pos", { waiterId: 1, posId: 2 });
    await ok(boss, "product.save", { name: "Espresso", price: 100, category: "Kafe" });
    await ok(boss, "stock.receive", { productId: 1, qty: 5 });
    await ok(boss, "shift.open", { posId: 1, opening: 1000 });

    // Outside's shift is closed, so its tables take no orders yet — inside's do.
    assert.equal((await cmd(arben, "order.add", { tableId: 9, productId: 1, waiterId: 1 })).statusCode, 400);
    await ok(boss, "shift.open", { posId: 2, opening: 500 });
    assert.equal((await cmd(boss, "shift.open", { posId: 2, opening: 0 })).statusCode, 400, "one open shift per till");
    // Arben works outside only: inside tables are refused on both order paths, and hidden.
    assert.equal((await cmd(arben, "order.add", { tableId: 1, productId: 1, waiterId: 1 })).statusCode, 403);
    assert.equal((await cmd(arben, "order.assign", { tableId: 1, waiterId: 1 })).statusCode, 400);
    await ok(arben, "order.add", { tableId: 9, productId: 1, waiterId: 1 });
    await ok(arben, "order.pay", { tableId: 9, method: "Cash", received: 100 });
    const view = (await t.call("GET", "/api/state", { cookie: arben })).json().state;
    assert.deepEqual([...new Set(view.tables.map((x) => x.area))], ["Tarraca"]);
    assert.deepEqual(view.openShifts.map((s) => s.posId), [2]);

    // Elira (any till) sells inside; an open order inside doesn't block closing outside.
    await ok(boss, "order.add", { tableId: 1, productId: 1, waiterId: 2 });
    const state = await ok(boss, "shift.close", { posId: 2, counted: 600 });
    assert.deepEqual([state.shifts[0].posId, state.shifts[0].expected, state.shifts[0].sales.total], [2, 600, 100]);
    assert.deepEqual(state.openShifts.map((s) => s.posId), [1]);
    assert.equal(state.products[0].stock, 4, "one stock for every till");
    assert.equal((await cmd(boss, "shift.close", { posId: 1, counted: 1000 })).statusCode, 400, "inside still has an open order");
    // An area with an open order can't move to another till mid-order; a used till can't be deleted.
    assert.equal((await cmd(boss, "pos.save", { id: 2, name: "Bari jashtë", areas: ["Tarraca", "Salla"] })).statusCode, 400);
    assert.equal((await cmd(boss, "pos.delete", { id: 2 })).statusCode, 400);
    const report = (await t.call("GET", `/api/shifts/${state.shifts[0].id}/report`, { cookie: boss })).json();
    assert.equal(report.shift.posName, "Bari jashtë");

    // Two bars, two "Bar" printers: each table's ticket reaches its own till's bar.
    await ok(boss, "printer.save", { name: "Bari brenda", host: "192.168.1.50", departments: ["Bar"], posId: 1 });
    const printers = await ok(boss, "printer.save", { name: "Bari jashtë", host: "192.168.1.51", departments: ["Bar"], posId: 2 });
    assert.deepEqual(printers.printers.map((x) => x.departments), [["Bar"], ["Bar"]], "same department, different tills");
    await ok(boss, "shift.open", { posId: 2, opening: 0 });
    await ok(boss, "product.save", { id: 1, name: "Espresso", price: 100, category: "Kafe", department: "Bar" });
    await ok(boss, "order.add", { tableId: 10, productId: 1, waiterId: 1 });
    await ok(boss, "order.send", { tableId: 10 });
    await ok(boss, "order.send", { tableId: 1 });
    const jobs = (
      await t.pool.query(
        `SELECT k.table_id, p.name FROM bluebar.print_jobs j
         JOIN bluebar.printers p ON p.id = j.printer_id JOIN bluebar.station_tickets k ON k.id = j.ref
         WHERE j.kind = 'ticket' ORDER BY k.table_id`,
      )
    ).rows.map((r) => [r.table_id, r.name]);
    assert.deepEqual(jobs, [[1, "Bari brenda"], [10, "Bari jashtë"]]);
    // Klea-style waiter (outside only) doesn't see the inside bar's tickets.
    const outside = (await t.call("GET", "/api/state", { cookie: arben })).json().state;
    // (Table 9's espresso was never sent: paying sent it, so its ticket is there too.)
    assert.deepEqual(outside.tickets.map((k) => k.table).sort((a, b) => a - b), [9, 10]);
  } finally {
    await t.close();
  }
});

test("Korrektësia: paying never loses station work, voids reach the station, every change is in the history", async () => {
  const t = await setup();
  try {
    const boss = t.cookieOf(await t.managerLogin());
    const arben = t.cookieOf(await t.waiterLogin(1, "482913"));
    const cmd = async (cookie, type, payload) => {
      const { version } = (await t.call("GET", "/api/state", { cookie: boss })).json();
      return t.call("POST", "/api/commands", { cookie, body: { id: randomUUID(), version, type, payload } });
    };
    const ok = async (...args) => {
      const r = await cmd(...args);
      assert.equal(r.statusCode, 200, r.body);
      return r.json();
    };
    await ok(boss, "shift.open", { opening: 0 });
    await ok(boss, "product.save", { name: "Picë", price: 500, category: "Ushqim", department: "Restorant" });
    await ok(boss, "stock.receive", { productId: 1, qty: 10 });
    for (let i = 0; i < 3; i++) await ok(arben, "order.add", { tableId: 1, productId: 1, waiterId: 1 });
    await ok(arben, "order.send", { tableId: 1 });

    // A waiter can't void a sent unit; the manager can, and the kitchen gets a void slip.
    assert.equal((await cmd(arben, "order.remove", { tableId: 1, productId: 1 })).statusCode, 403);
    let state = (await ok(boss, "order.remove", { tableId: 1, productId: 1, reason: "Klienti ndryshoi mendje" })).state;
    const slip = state.tickets.find((k) => k.void);
    assert.deepEqual([slip.department, slip.kind, slip.note, slip.lines.map(({ id, name, qty }) => ({ id, name, qty }))], ["Restorant", "void", "Klienti ndryshoi mendje", [{ id: 1, name: "Picë", qty: 1 }]]);
    assert.equal(state.tables[0].lines[0].qty, 2);

    // One more pizza, never sent — paying sends it rather than losing it.
    await ok(arben, "order.add", { tableId: 1, productId: 1, waiterId: 1 });
    const paid = await ok(arben, "order.pay", { tableId: 1, method: "Kartë" });
    assert.equal(paid.result.sentTickets.length, 1);
    state = (await t.call("GET", "/api/state", { cookie: boss })).json().state;
    const work = state.tickets.filter((k) => !k.void);
    assert.deepEqual(work.map((k) => [k.round, k.lines[0].qty, Boolean(k.invoice), k.doneAt]), [[1, 3, true, null], [2, 1, true, null]],
      "paid tickets stay on the station until done");
    // The station marks them done (a waiter-run station device can too).
    for (const k of state.tickets) await ok(arben, "ticket.done", { id: k.id });
    assert.equal((await cmd(arben, "ticket.done", { id: work[0].id })).statusCode, 400, "already done");
    state = (await t.call("GET", "/api/state", { cookie: boss })).json().state;
    assert.ok(state.tickets.every((k) => k.doneAt));

    // The history: who did what, in order — and the invoice's own copy of it.
    const events = (await t.call("GET", `/api/invoices/${paid.result.invoiceId}/history`, { cookie: boss })).json();
    assert.deepEqual(events.map((e) => e.kind), ["add", "add", "add", "send", "void", "add", "send", "pay"]);
    assert.deepEqual([events[0].actor, events[4].actor], ["Arben K", "boss"]);
    assert.match(events[4].detail, /Anuloi 1 × Picë/);
    assert.equal((await t.call("GET", `/api/invoices/${paid.result.invoiceId}/history`, { cookie: arben })).statusCode, 403);
    // The table's next order starts with a clean history.
    await ok(arben, "order.add", { tableId: 1, productId: 1, waiterId: 1 });
    assert.deepEqual((await t.call("GET", "/api/tables/1/history", { cookie: arben })).json().map((e) => e.kind), ["add"]);
  } finally {
    await t.close();
  }
});

test("Stacionet: two bars by zone, specialised kitchens, backup, inactive station, accepted transfers, no rerouting", async () => {
  const t = await setup();
  try {
    const boss = t.cookieOf(await t.managerLogin());
    const arben = t.cookieOf(await t.waiterLogin(1, "482913"));
    const cmd = async (cookie, type, payload) => {
      const { version } = (await t.call("GET", "/api/state", { cookie: boss })).json();
      return t.call("POST", "/api/commands", { cookie, body: { id: randomUUID(), version, type, payload } });
    };
    const ok = async (...args) => {
      const r = await cmd(...args);
      assert.equal(r.statusCode, 200, r.body);
      return r.json();
    };
    const state = async () => (await t.call("GET", "/api/state", { cookie: boss })).json().state;
    await ok(boss, "shift.open", { opening: 0 });
    await ok(boss, "department.create", { name: "Pica" });
    for (const [name, department] of [["Birrë", "Bar"], ["Pasta", "Restorant"], ["Picë", "Pica"]]) {
      await ok(boss, "product.save", { name, price: 300, category: "Ushqim", department });
      await ok(boss, "stock.receive", { productId: (await state()).products.at(-1).id, qty: 50 });
    }
    // One till, no stations: nothing to configure, nothing flagged.
    assert.deepEqual(configIssues(await state()), []);

    // Tables 1-8 are Salla, 9-12 Tarraca.
    await ok(boss, "station.save", { name: "Bari brenda", departments: ["Bar"], areas: ["Salla"] });
    await ok(boss, "station.save", { name: "Bari jashtë", departments: ["Bar"], areas: ["Tarraca"] });
    await ok(boss, "station.save", { name: "Kuzhina", departments: ["Restorant", "Pica"], areas: [] });
    await ok(boss, "station.save", { name: "Furra", departments: ["Pica"], areas: ["Salla", "Tarraca"], backupId: 3 });
    assert.equal((await cmd(boss, "station.save", { id: 3, name: "Kuzhina", departments: ["Restorant", "Pica"], areas: [], backupId: 4 })).statusCode, 400, "no backup loops");

    const order = async (tableId, ...productIds) => {
      for (const productId of productIds) await ok(arben, "order.add", { tableId, productId, waiterId: 1 });
      return (await ok(arben, "order.send", { tableId })).result.tickets.map((k) => [k.department, k.station]);
    };
    assert.deepEqual(await order(1, 1, 2, 3), [["Bar", 1], ["Restorant", 3], ["Pica", 4]], "inside bar, oven, shared kitchen");
    assert.deepEqual(await order(9, 1), [["Bar", 2]], "outside bar");

    // The oven is down: new pizzas go to its backup; the one it already has stays put.
    await ok(boss, "station.toggle", { id: 4 });
    assert.deepEqual(await order(2, 3), [["Pica", 3]]);
    // Reconfiguring zones doesn't move tickets already sent.
    await ok(boss, "station.save", { id: 2, name: "Bari jashtë", departments: ["Bar"], areas: [] });
    let s = await state();
    assert.deepEqual(s.tickets.filter((k) => k.table === 9).map((k) => k.station), [2]);
    assert.deepEqual(s.tickets.filter((k) => k.table === 1).map((k) => k.station), [1, 4, 3]);
    assert.ok(configIssues(s).some((i) => /"Furra" është joaktiv dhe ka 1 fletë/.test(i.text)));

    // Controlled transfer: the oven's pizza goes to the kitchen only once the kitchen accepts.
    const pizza = s.tickets.find((k) => k.station === 4);
    await ok(boss, "ticket.transfer", { id: pizza.id, stationId: 3 });
    assert.equal((await cmd(arben, "ticket.done", { id: pizza.id })).statusCode, 400, "in transfer");
    s = await state();
    assert.deepEqual([s.tickets.find((k) => k.id === pizza.id).station, s.tickets.find((k) => k.id === pizza.id).transferTo], [4, 3]);
    await ok(arben, "ticket.accept", { id: pizza.id });
    s = await state();
    assert.deepEqual([s.tickets.find((k) => k.id === pizza.id).station, s.tickets.find((k) => k.id === pizza.id).transferTo], [3, null]);
    assert.equal((await cmd(arben, "ticket.accept", { id: pizza.id })).statusCode, 400);
    const history = (await t.call("GET", "/api/tables/1/history", { cookie: boss })).json().filter((e) => e.kind === "transfer");
    assert.deepEqual(history.map((e) => e.actor), ["boss", "Arben K"]);

    // A station with tickets can't be deleted; a printer's removal leaves its station on screen.
    assert.equal((await cmd(boss, "station.delete", { id: 1 })).statusCode, 400, "has tickets");
    assert.equal((await cmd(boss, "station.delete", { id: 3 })).statusCode, 400, "is a backup");
    // No device anywhere: every active station is flagged, with a reason.
    assert.ok(configIssues(s).filter((i) => /nuk ka printer dhe asnjë ekran/.test(i.text)).length === 3);
    await t.call("POST", "/api/stations/seen", { cookie: arben, body: { stations: [1, 2, 3] } });
    assert.ok(!configIssues(await state()).some((i) => /nuk ka printer dhe asnjë ekran/.test(i.text)));
  } finally {
    await t.close();
  }
});

test("Raportet: sales apart from the drawer, filters, cancellations, losses and service time", async () => {
  const t = await setup();
  try {
    const boss = t.cookieOf(await t.managerLogin());
    const cmd = async (type, payload) => {
      const { version } = (await t.call("GET", "/api/state", { cookie: boss })).json();
      const r = await t.call("POST", "/api/commands", { cookie: boss, body: { id: randomUUID(), version, type, payload } });
      assert.equal(r.statusCode, 200, r.body);
      return r.json();
    };
    await cmd("shift.open", { opening: 1000 });
    await cmd("product.save", { name: "Birrë", price: 300, category: "Birra", department: "Bar" });
    await cmd("stock.receive", { productId: 1, qty: 20 });
    // Salla (table 1) pays cash, Tarraca (table 9) by card; cash in/out moves the drawer.
    await cmd("order.add", { tableId: 1, productId: 1, waiterId: 1 });
    await cmd("order.pay", { tableId: 1, method: "Cash", received: 300 });
    for (let i = 0; i < 2; i++) await cmd("order.add", { tableId: 9, productId: 1, waiterId: 2 });
    await cmd("order.pay", { tableId: 9, method: "Kartë" });
    await cmd("shift.cash", { kind: "in", amount: 500, reason: "Kusur" });
    await cmd("shift.cash", { kind: "out", amount: 200, reason: "Akull" });
    // A void after sending, a cancelled order, a station finishing, a loss.
    for (let i = 0; i < 2; i++) await cmd("order.add", { tableId: 2, productId: 1, waiterId: 1 });
    const sent = await cmd("order.send", { tableId: 2 });
    await cmd("order.remove", { tableId: 2, productId: 1, reason: "E porositur gabim" });
    await cmd("ticket.done", { id: sent.result.tickets[0].id });
    await cmd("order.cancel", { tableId: 2, reason: "Klienti iku" });
    await cmd("stock.adjust", { productId: 1, qty: -2, reason: "Thyerje" });

    const day = new Date();
    day.setHours(0, 0, 0, 0);
    const get = (extra = {}) =>
      t.call("GET", `/api/reports?${new URLSearchParams({ from: day.toISOString(), to: new Date(day.getTime() + 86400_000).toISOString(), ...extra })}`, { cookie: boss });
    const all = (await get()).json();
    assert.deepEqual(all.invoices.map((i) => [i.total, i.method, i.area]), [[300, "Cash", "Salla"], [600, "Kartë", "Tarraca"]]);
    const [s] = all.shifts;
    // The drawer: float + cash sales + in − out; card never enters it.
    assert.deepEqual([s.opening, s.cash, s.card, s.cashIn, s.cashOut, s.expected], [1000, 300, 600, 500, 200, 1600]);
    assert.deepEqual(all.corrections.map((c) => [c.kind, c.amount]), [["void", 300], ["cancel", 300]]);
    assert.deepEqual(all.losses.map((m) => [m.qty, m.reason]), [[-2, "Thyerje"]]);
    assert.equal(all.service.orders, 2);
    assert.equal(all.service.prep[0].tickets, 1);
    // Filters: zone, waiter, shift basis.
    assert.deepEqual((await get({ area: "Tarraca" })).json().invoices.map((i) => i.total), [600]);
    assert.deepEqual((await get({ waiter: "1" })).json().invoices.map((i) => i.total), [300]);
    assert.equal((await get({ basis: "shift" })).json().invoices.length, 2);
    // Managers only; a nonsense period is refused.
    const ana = t.cookieOf(await t.waiterLogin(1, "482913"));
    assert.equal((await t.call("GET", `/api/reports?from=${day.toISOString()}&to=${day.toISOString()}`, { cookie: boss })).statusCode, 400);
    assert.equal((await t.call("GET", `/api/reports?from=${day.toISOString()}&to=${new Date().toISOString()}`, { cookie: ana })).statusCode, 403);
  } finally {
    await t.close();
  }
});

test("Llogaritë: partial and mixed payments, splits, discounts, comps, moves, handover, refunds — never charged twice", async () => {
  const t = await setup();
  try {
    const boss = t.cookieOf(await t.managerLogin());
    const arben = t.cookieOf(await t.waiterLogin(1, "482913"));
    const elira = t.cookieOf(await t.waiterLogin(2, "739105"));
    const version = async () => (await t.call("GET", "/api/state", { cookie: boss })).json().version;
    const cmd = async (cookie, type, payload, v) =>
      t.call("POST", "/api/commands", { cookie, body: { id: randomUUID(), version: v ?? (await version()), type, payload } });
    const ok = async (...args) => {
      const r = await cmd(...args);
      assert.equal(r.statusCode, 200, r.body);
      return r.json();
    };
    const state = async () => (await t.call("GET", "/api/state", { cookie: boss })).json().state;
    const tableOf = async (id) => (await state()).tables.find((x) => x.id === id);
    await ok(boss, "shift.open", { opening: 1000 });
    await ok(boss, "product.save", { name: "Pjatë", price: 300, category: "Ushqim", department: "Restorant" });
    await ok(boss, "product.save", { name: "Ujë", price: 100, category: "Pije", department: "Bar" });
    await ok(boss, "stock.receive", { productId: 1, qty: 50 });
    await ok(boss, "stock.receive", { productId: 2, qty: 50 });
    const add = async (cookie, tableId, productId, n, waiterId = 1) => {
      for (let i = 0; i < n; i++) await ok(cookie, "order.add", { tableId, productId, waiterId });
    };

    await add(arben, 1, 1, 3);

    // Part of it in cash: the bill stays open with what's left.
    const first = await ok(arben, "order.pay", { tableId: 1, payments: [{ method: "Cash", amount: 300 }], received: 500 });
    assert.deepEqual([first.result.partial, first.result.remaining], [true, 600]);
    // Items can come off the bill only while it still covers what's been paid (300).
    assert.equal((await cmd(boss, "order.remove", { tableId: 1, productId: 1 })).statusCode, 200);
    assert.equal((await cmd(boss, "order.remove", { tableId: 1, productId: 1 })).statusCode, 200);
    assert.equal((await cmd(boss, "order.remove", { tableId: 1, productId: 1 })).statusCode, 400, "would drop below what's paid");
    await add(arben, 1, 1, 2);
    // Two devices on the same version: the second payment of the same balance is refused.
    const v = await version();
    await ok(arben, "order.pay", { tableId: 1, payments: [{ method: "Cash", amount: 200 }, { method: "Kartë", amount: 400 }], received: 200 }, v);
    assert.equal((await cmd(elira, "order.pay", { tableId: 1, payments: [{ method: "Kartë", amount: 600 }] }, v)).statusCode, 409);
    let s = await state();
    const mixed = s.invoices[0];
    assert.deepEqual(
      [mixed.total, mixed.method, mixed.cash, mixed.card],
      [900, "Përzier", 500, 400],
    );
    assert.deepEqual((await tableOf(1)).lines, []);
    // More than what's left is refused, never "paid twice".
    await add(arben, 2, 2, 2);
    assert.equal((await cmd(arben, "order.pay", { tableId: 2, payments: [{ method: "Kartë", amount: 300 }] })).statusCode, 400);

    // Split by items: one water now on its own invoice, the other stays on the table.
    const split = await ok(arben, "order.pay", { tableId: 2, payments: [{ method: "Kartë", amount: 100 }], units: [{ productId: 2, qty: 1 }] });
    assert.equal(split.result.remaining, 100);
    s = await state();
    assert.deepEqual(s.invoices[0].lines.map((l) => [l.name, l.qty]), [["Ujë", 1]]);
    assert.deepEqual((await tableOf(2)).lines.map((l) => l.qty), [1]);

    // Discounts and comps: the manager's, with a reason.
    await add(arben, 3, 1, 2);
    assert.equal((await cmd(arben, "order.discount", { tableId: 3, kind: "percent", value: 10, reason: "Klient i rregullt" })).statusCode, 403);
    assert.equal((await cmd(boss, "order.discount", { tableId: 3, kind: "percent", value: 10, reason: "" })).statusCode, 400);
    await ok(boss, "order.discount", { tableId: 3, kind: "percent", value: 10, reason: "Klient i rregullt" });
    assert.equal((await cmd(arben, "order.comp", { tableId: 3, productId: 1, delta: 1, reason: "Ditëlindje" })).statusCode, 403);
    await ok(boss, "order.comp", { tableId: 3, productId: 1, delta: 1, reason: "Ditëlindje" });
    // 2 × 300 − 300 comped = 300, − 10% = 270.
    const comped = await ok(arben, "order.pay", { tableId: 3, method: "Cash", received: 270 });
    s = await state();
    const inv = s.invoices.find((i) => i.id === comped.result.invoiceId);
    assert.deepEqual([inv.subtotal, inv.comps, inv.discount, inv.total, inv.discountReason], [600, 300, 30, 270, "Klient i rregullt"]);

    // A fully comped bill closes with no payment and a 0 invoice.
    await add(arben, 4, 2, 1);
    await ok(boss, "order.comp", { tableId: 4, productId: 2, delta: 1, reason: "E gabuar" });
    const free = await ok(arben, "order.pay", { tableId: 4, method: "Cash" });
    assert.equal((await state()).invoices.find((i) => i.id === free.result.invoiceId).total, 0);

    // Moving: to an empty table the order (and its station tickets) follows; onto an
    // occupied table only as an explicit merge; a waiter moves only their own.
    await add(arben, 5, 2, 2);
    await ok(arben, "order.send", { tableId: 5 });
    await ok(arben, "order.move", { tableId: 5, toTableId: 6 });
    s = await state();
    assert.deepEqual([s.tables[4].lines.length, s.tables[5].lines[0].qty], [0, 2]);
    const moved = s.tickets.filter((k) => [5, 6].includes(k.table) && !k.invoice && !k.cancelledAt);
    assert.ok(moved.length && moved.every((k) => k.table === 6), "the station delivers to the new table");
    await add(arben, 7, 1, 1);
    assert.equal((await cmd(arben, "order.move", { tableId: 6, toTableId: 7 })).statusCode, 400, "merging needs a confirmation");
    await ok(arben, "order.move", { tableId: 6, toTableId: 7, merge: true });
    assert.deepEqual((await tableOf(7)).lines.map((l) => [l.name, l.qty]), [["Pjatë", 1], ["Ujë", 2]]);
    assert.equal((await cmd(elira, "order.move", { tableId: 7, toTableId: 8 })).statusCode, 400, "not Elira's table");

    // Handover: the owner gives the table to a colleague; nobody else can.
    assert.equal((await cmd(elira, "order.handover", { tableId: 7, waiterId: 2 })).statusCode, 400);
    await ok(arben, "order.handover", { tableId: 7, waiterId: 2 });
    assert.equal((await tableOf(7)).waiter, 2);

    // Refunds: manager, reason, never more than the invoice took; cash leaves the drawer.
    const before = (await state()).openShifts[0];
    assert.equal((await cmd(arben, "invoice.refund", { invoiceId: mixed.id, amount: 100, method: "Cash", reason: "Pjatë e ftohtë" })).statusCode, 403);
    assert.equal((await cmd(boss, "invoice.refund", { invoiceId: mixed.id, amount: 1000, method: "Cash", reason: "Pjatë e ftohtë" })).statusCode, 400);
    await ok(boss, "invoice.refund", { invoiceId: mixed.id, amount: 100, method: "Cash", reason: "Pjatë e ftohtë" });
    s = await state();
    assert.deepEqual(s.invoices.find((i) => i.id === mixed.id).refunds.map((r) => [r.amount, r.method, r.reason]), [[100, "Cash", "Pjatë e ftohtë"]]);
    // The drawer: 1000 float + cash collected (500 + 270) − 100 refunded; card and card tips never in it.
    const report = (await t.call("GET", `/api/shifts/${before.id}/report`, { cookie: boss })).json();
    assert.deepEqual([report.cash, report.refundsCash, report.shift.expected], [770, 100, 1670]);
  } finally {
    await t.close();
  }
});

test("moving a bill between tills: it's paid at the new till, but a part-paid bill stays where its money is", async () => {
  const t = await setup();
  try {
    const boss = t.cookieOf(await t.managerLogin());
    const cmd = async (type, payload) => {
      const { version } = (await t.call("GET", "/api/state", { cookie: boss })).json();
      return t.call("POST", "/api/commands", { cookie: boss, body: { id: randomUUID(), version, type, payload } });
    };
    const ok = async (...args) => {
      const r = await cmd(...args);
      assert.equal(r.statusCode, 200, r.body);
      return r.json();
    };
    // Tables 1-8 Salla (inside till), 9-12 Tarraca (outside till).
    await ok("pos.save", { id: 1, name: "Brenda", areas: ["Salla"] });
    await ok("pos.save", { name: "Jashtë", areas: ["Tarraca"] });
    await ok("shift.open", { posId: 1, opening: 0 });
    await ok("product.save", { name: "Kafe", price: 100, category: "Kafe" });
    await ok("stock.receive", { productId: 1, qty: 10 });
    for (const tableId of [1, 2]) for (let i = 0; i < 2; i++) await ok("order.add", { tableId, productId: 1, waiterId: 1 });
    assert.match((await cmd("order.move", { tableId: 1, toTableId: 9 })).body, /nuk ka turn të hapur/);
    await ok("shift.open", { posId: 2, opening: 0 });
    await ok("order.pay", { tableId: 2, payments: [{ method: "Cash", amount: 100 }], received: 100 });
    assert.match((await cmd("order.move", { tableId: 2, toTableId: 10 })).body, /pagesa të pjesshme/);
    await ok("order.move", { tableId: 1, toTableId: 9 });
    const paid = await ok("order.pay", { tableId: 9, method: "Kartë" });
    const state = (await t.call("GET", "/api/state", { cookie: boss })).json().state;
    const invoice = state.invoices.find((i) => i.id === paid.result.invoiceId);
    assert.equal(state.openShifts.find((s) => s.id === invoice.shiftId).posId, 2, "collected at the outside till");
  } finally {
    await t.close();
  }
});

test("Porositë: notes, allergies, extras, two lines of one product, courses, hold, corrections, voids, remakes — never twice", async () => {
  const t = await setup();
  try {
    const boss = t.cookieOf(await t.managerLogin());
    const arben = t.cookieOf(await t.waiterLogin(1, "482913"));
    const cmd = async (cookie, type, payload) => {
      const { version } = (await t.call("GET", "/api/state", { cookie: boss })).json();
      return t.call("POST", "/api/commands", { cookie, body: { id: randomUUID(), version, type, payload } });
    };
    const ok = async (...args) => {
      const r = await cmd(...args);
      assert.equal(r.statusCode, 200, r.body);
      return r.json();
    };
    const state = async () => (await t.call("GET", "/api/state", { cookie: boss })).json().state;
    const lines = async () => (await state()).tables[0].lines;
    await ok(boss, "shift.open", { opening: 0 });
    await ok(boss, "product.save", { name: "Cappuccino", price: 200, category: "Kafe", department: "Bar",
      extras: [{ name: "Qumësht soje", price: 50 }, { name: "Pa sheqer", price: 0 }] });
    await ok(boss, "product.save", { name: "Bruskete", price: 300, category: "Ushqim", department: "Restorant" });
    await ok(boss, "product.save", { name: "Biftek", price: 1200, category: "Ushqim", department: "Restorant" });
    for (const id of [1, 2, 3]) await ok(boss, "stock.receive", { productId: id, qty: 20 });
    const add = (payload) => ok(arben, "order.add", { tableId: 1, waiterId: 1, ...payload });

    // Two cappuccinos made two ways: separate lines, priced with their extras.
    await add({ productId: 1 });
    await add({ productId: 1 });
    await add({ productId: 1, extras: ["Qumësht soje"], note: "shumë i nxehtë" });
    assert.equal((await cmd(arben, "order.add", { tableId: 1, waiterId: 1, productId: 1, extras: ["Krem"] })).statusCode, 400, "unknown extra");
    let ls = await lines();
    assert.deepEqual(ls.map((l) => [l.key, l.qty, l.price, l.note]), [["p1", 2, 200, ""], ["p1-2", 1, 250, "shumë i nxehtë"]]);
    // A starter, a main, a nut allergy: the main waits for "Fillo kursin".
    await add({ productId: 2, course: 1 });
    await add({ productId: 3, course: 2, allergy: "arra" });
    await ok(arben, "order.note", { tableId: 1, allergy: "celiak" });
    const first = (await ok(arben, "order.send", { tableId: 1 })).result.tickets;
    const sentNames = first.flatMap((k) => k.lines.map((l) => l.name)).sort();
    assert.deepEqual(sentNames, ["Bruskete", "Cappuccino", "Cappuccino"]);
    assert.ok(first.every((k) => k.allergy === "celiak"), "the order's allergy is on every ticket");
    // Sending again sends nothing twice.
    assert.match((await cmd(arben, "order.send", { tableId: 1 })).body, /në pritje ose në një kurs/);
    const fired = (await ok(arben, "order.fire", { tableId: 1, course: 2 })).result.tickets;
    assert.deepEqual(fired.flatMap((k) => k.lines.map((l) => [l.name, l.course, l.allergy])), [["Biftek", 2, "arra"]]);
    assert.equal((await cmd(arben, "order.fire", { tableId: 1, course: 2 })).statusCode, 400);

    // Hold: added, not sent until released.
    await add({ productId: 2, hold: true });
    assert.match((await cmd(arben, "order.send", { tableId: 1 })).body, /në pritje/);
    const held = (await lines()).find((l) => l.hold);
    await ok(arben, "order.edit", { tableId: 1, lineKey: held.key, hold: false });
    assert.equal((await ok(arben, "order.send", { tableId: 1 })).result.tickets[0].lines[0].name, "Bruskete");

    // Unsent: corrected directly. Sent: a reason, and the station gets a correction.
    await add({ productId: 1 });
    ls = await lines();
    const plain = ls.find((l) => l.key === "p1");
    assert.deepEqual([plain.qty, plain.sent], [3, 2]);
    // One unsent unit taken off onto its own line, without sugar.
    await ok(arben, "order.edit", { tableId: 1, lineKey: "p1", one: true, extras: ["Pa sheqer"] });
    ls = await lines();
    assert.deepEqual(ls.filter((l) => l.id === 1).map((l) => [l.qty, l.sent, l.extras.map((x) => x.name)]), [[2, 2, []], [1, 1, ["Qumësht soje"]], [1, 0, ["Pa sheqer"]]]);
    assert.equal((await cmd(arben, "order.edit", { tableId: 1, lineKey: "p1", note: "me kanellë" })).statusCode, 400, "sent: needs a reason");
    const before = (await state()).tickets.length;
    await ok(arben, "order.edit", { tableId: 1, lineKey: "p1", note: "me kanellë", reason: "Klienti e kërkoi pas porosisë" });
    let s = await state();
    const correction = s.tickets.at(-1);
    assert.deepEqual([s.tickets.length, correction.kind, correction.lines[0].note, correction.lines[0].qty], [before + 1, "correction", "me kanellë", 2]);

    // A sent steak that was already cooked: void with a reason, stock records the loss.
    const stockBefore = s.products.find((p) => p.id === 3).stock;
    const steak = (await lines()).find((l) => l.id === 3);
    await ok(boss, "order.remove", { tableId: 1, lineKey: steak.key, reason: "Klienti iku pa e ngrënë", prepared: true });
    s = await state();
    assert.equal(s.products.find((p) => p.id === 3).stock, stockBefore - 1);
    assert.deepEqual([s.movements.at(-1).kind, s.movements.at(-1).qty], ["loss", -1]);
    // A bruschetta dropped on the way: remade, the first one is a loss, the bill unchanged.
    const due = (await lines()).reduce((sum, l) => sum + l.qty * l.price, 0);
    const bruschetta = (await lines()).find((l) => l.id === 2 && l.sent);
    await ok(arben, "order.remake", { tableId: 1, lineKey: bruschetta.key, reason: "Ra në tokë" });
    s = await state();
    assert.equal(s.tickets.at(-1).kind, "remake");
    assert.equal((await lines()).reduce((sum, l) => sum + l.qty * l.price, 0), due);
    assert.equal((await cmd(arben, "order.remake", { tableId: 1, lineKey: bruschetta.key })).statusCode, 400, "needs a reason");

    // Who, when and why: all in the order's history.
    const history = (await t.call("GET", "/api/tables/1/history", { cookie: boss })).json();
    const of = (kind) => history.filter((e) => e.kind === kind);
    assert.match(of("edit").at(-1).detail, /Klienti e kërkoi pas porosisë/);
    assert.match(of("void")[0].detail, /përgatitur: humbje: Klienti iku pa e ngrënë/);
    assert.deepEqual([of("remake")[0].actor, of("fire")[0].detail], ["Arben K", "Filloi kursin: Kryesore"]);

    // The fast path (plain add) keeps to the right line: a plain main course joins the
    // plain main-course line, not the starter's.
    await t.call("POST", "/api/commands", { cookie: arben, body: { id: randomUUID(), version: (await t.call("GET", "/api/state", { cookie: boss })).json().version, type: "order.add", payload: { tableId: 2, productId: 2, waiterId: 1, course: 2 } } });
    await t.call("POST", "/api/commands", { cookie: arben, body: { id: randomUUID(), version: (await t.call("GET", "/api/state", { cookie: boss })).json().version, type: "order.add", payload: { tableId: 2, productId: 2, waiterId: 1, course: 2 } } });
    await t.call("POST", "/api/commands", { cookie: arben, body: { id: randomUUID(), version: (await t.call("GET", "/api/state", { cookie: boss })).json().version, type: "order.add", payload: { tableId: 2, productId: 2, waiterId: 1, course: 1 } } });
    assert.deepEqual((await state()).tables[1].lines.map((l) => [l.key, l.course, l.qty]), [["p2", 2, 2], ["p2-2", 1, 1]]);
  } finally {
    await t.close();
  }
});

test("manager login: code only by default; with \"Emri + kodi\" the name is required and must match", async () => {
  const t = await setup();
  try {
    const path = "/api/venue/manager-login";
    const waiter = t.cookieOf(await t.waiterLogin(1, "482913"));
    assert.equal((await t.call("PUT", path, { cookie: waiter, body: { managerLogin: "name_pin" } })).statusCode, 403);
    const manager = t.cookieOf(await t.managerLogin());
    assert.equal((await t.call("PUT", path, { cookie: manager, body: { managerLogin: "fingerprint" } })).statusCode, 400);
    assert.equal((await t.call("PUT", path, { cookie: manager, body: { managerLogin: "name_pin" } })).statusCode, 200);
    assert.equal((await t.call("GET", "/api/venue")).json().managerLogin, "name_pin");

    assert.equal((await t.managerLogin()).statusCode, 400, "the code alone is no longer enough");
    assert.equal((await t.managerLogin({ username: "someone" })).statusCode, 401);
    assert.equal((await t.managerLogin({ username: " Boss " })).statusCode, 200, "name is trimmed and case-insensitive");

    await t.call("PUT", path, { cookie: manager, body: { managerLogin: "pin_only" } });
    assert.equal((await t.managerLogin()).statusCode, 200, "back to code only");
  } finally {
    await t.close();
  }
});

test("registration: a filled honeypot field (bots) is refused", async () => {
  const t = await setup();
  try {
    const bot = await t.call("POST", "/api/venues/register", { body: { slug: "bot-bar", name: "Bot Bar", pin: "482915", website: "http://spam.example" } });
    assert.equal(bot.statusCode, 400);
    assert.equal((await t.pool.query("SELECT count(*)::int AS n FROM bluebar_catalog.venues WHERE slug = 'bot-bar'")).rows[0].n, 0);
  } finally {
    await t.close();
  }
});

test("a manager changes their own name and PIN: current PIN required, other devices signed out", async () => {
  const t = await setup();
  try {
    const path = "/api/accounts/me";
    const waiter = t.cookieOf(await t.waiterLogin(1, "482913"));
    assert.equal((await t.call("PUT", path, { cookie: waiter, body: { currentPin: "482913", username: "ana" } })).statusCode, 403);
    const here = t.cookieOf(await t.managerLogin());
    const phone = t.cookieOf(await t.managerLogin());

    // Wrong current PIN: refused with 400 (not 401, which would sign this device out).
    const wrong = await t.call("PUT", path, { cookie: here, body: { currentPin: "000000", username: "drita" } });
    assert.equal(wrong.statusCode, 400);
    assert.match(wrong.json().error, /PIN-i aktual/);
    // Bad name or too simple a PIN.
    assert.equal((await t.call("PUT", path, { cookie: here, body: { currentPin: t.manager.pin, username: "a b" } })).statusCode, 400);
    assert.equal((await t.call("PUT", path, { cookie: here, body: { currentPin: t.manager.pin, newPin: "123456" } })).statusCode, 400);

    // Name only: both devices stay signed in, and the new name shows.
    const renamed = await t.call("PUT", path, { cookie: here, body: { currentPin: t.manager.pin, username: "Drita" } });
    assert.equal(renamed.statusCode, 200);
    assert.equal(renamed.json().name, "drita");
    assert.equal((await t.call("GET", "/api/auth/session", { cookie: phone })).statusCode, 200);

    // New PIN: this device stays, the other is signed out; the old PIN stops working.
    const changed = await t.call("PUT", path, { cookie: here, body: { currentPin: t.manager.pin, newPin: "591738" } });
    assert.equal(changed.statusCode, 200);
    assert.equal((await t.call("GET", "/api/auth/session", { cookie: here })).statusCode, 200);
    assert.equal((await t.call("GET", "/api/auth/session", { cookie: phone })).statusCode, 401);
    assert.equal((await t.managerLogin()).statusCode, 401);
    assert.equal((await t.managerLogin({ pin: "591738" })).statusCode, 200);

    // A name another manager already has is refused.
    await t.pool.query("INSERT INTO bluebar.accounts(role, username, secret_hash) VALUES('manager', 'beni', 'x')");
    assert.equal((await t.call("PUT", path, { cookie: here, body: { currentPin: "591738", username: "beni" } })).statusCode, 409);
  } finally {
    await t.close();
  }
});

test("a client-written X-Forwarded-For can't fake the venue network", async () => {
  // Behind one trusted proxy (Vercel), only the address that proxy saw counts.
  const t = await setup({ trustProxy: (_address, hop) => hop === 0, allowedIps: ["203.0.113.50"] });
  try {
    // The proxy (10.0.0.1) reports the real client 198.51.100.7 after a spoofed entry.
    const spoofed = await t.inject({ method: "GET", url: "/api/auth/waiters", remoteAddress: "10.0.0.1",
      headers: { host: "localhost", "x-bluebar-client": "1", "x-forwarded-for": "203.0.113.50, 198.51.100.7" } });
    assert.equal(spoofed.json().allowed, false, "the spoofed venue IP is ignored");
    const real = await t.inject({ method: "GET", url: "/api/auth/waiters", remoteAddress: "10.0.0.1",
      headers: { host: "localhost", "x-bluebar-client": "1", "x-forwarded-for": "203.0.113.50" } });
    assert.equal(real.json().allowed, true, "the address the proxy saw is used");
  } finally {
    await t.close();
  }
});

test("online menu: off until enabled, public read-only, only visible products and guest fields", async () => {
  const t = await setup();
  try {
    await t.send("product.save", { name: "Espresso", category: "Kafe", price: 100, nameEn: "Espresso", description: "Kafe e fortë", descriptionEn: "Strong coffee" });
    await t.send("product.save", { name: "Sekret", category: "Kafe", price: 900, menuVisible: false });
    await t.send("category.translate", { name: "Kafe", nameEn: "Coffee" });
    // A guest's phone sends no app header and no cookie.
    const guest = (url) => t.inject({ method: "GET", url, headers: { host: "localhost" } });
    assert.equal((await guest("/api/menu/bluebar")).statusCode, 404, "off by default");
    const cookie = t.cookieOf(await t.managerLogin());
    assert.equal((await t.call("PUT", "/api/venue/menu", { body: { enabled: true } })).statusCode, 401);
    assert.equal((await t.call("PUT", "/api/venue/menu", { cookie, body: { enabled: true } })).statusCode, 200);
    const menu = await guest("/api/menu/bluebar");
    assert.equal(menu.statusCode, 200);
    assert.match(menu.headers["cache-control"], /public/);
    const body = menu.json();
    assert.deepEqual(body.categories, [{ name: "Kafe", nameEn: "Coffee" }]);
    assert.deepEqual(body.products.map((p) => p.name), ["Espresso"], "a hidden product never reaches guests");
    assert.deepEqual(Object.keys(body.products[0]).sort(),
      ["available", "category", "description", "descriptionEn", "extras", "id", "name", "nameEn", "photo", "price"]);
    // Photos: only a real WebP/JPEG, only by a manager, versioned on the menu.
    const id = body.products[0].id;
    const jpeg = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString("base64");
    const fake = "data:image/jpeg;base64," + Buffer.from("<svg onload=alert(1)>").toString("base64");
    assert.equal((await t.call("PUT", `/api/products/${id}/photo`, { body: { dataUrl: jpeg } })).statusCode, 401);
    assert.equal((await t.call("PUT", `/api/products/${id}/photo`, { cookie, body: { dataUrl: fake } })).statusCode, 400);
    assert.equal((await t.call("PUT", `/api/products/999/photo`, { cookie, body: { dataUrl: jpeg } })).statusCode, 404);
    assert.equal((await t.call("PUT", `/api/products/${id}/photo`, { cookie, body: { dataUrl: jpeg } })).statusCode, 200);
    // A real photo (~250 KB) fits; anything past the photo limit does not.
    const photoOf = (bytes) => "data:image/jpeg;base64," + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(bytes)]).toString("base64");
    assert.equal((await t.call("PUT", `/api/products/${id}/photo`, { cookie, body: { dataUrl: photoOf(250000) } })).statusCode, 200);
    assert.ok([400, 413].includes((await t.call("PUT", `/api/products/${id}/photo`, { cookie, body: { dataUrl: photoOf(420000) } })).statusCode));
    assert.equal((await t.call("PUT", `/api/products/${id}/photo`, { cookie, body: { dataUrl: jpeg } })).statusCode, 200);
    const version = (await guest("/api/menu/bluebar")).json().products[0].photo;
    assert.ok(version);
    const photo = await guest(`/api/menu/bluebar/photo/${id}?v=${version}`);
    assert.equal(photo.statusCode, 200);
    assert.equal(photo.headers["content-type"], "image/jpeg");
    assert.deepEqual([...photo.rawPayload], [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    // Editing the product keeps its photo; deleting the photo clears the version.
    await t.send("product.save", { id, name: "Espresso", category: "Kafe", price: 120 });
    assert.equal((await guest("/api/menu/bluebar")).json().products[0].photo, version);
    assert.equal((await t.call("DELETE", `/api/products/${id}/photo`, { cookie })).statusCode, 200);
    assert.equal((await guest("/api/menu/bluebar")).json().products[0].photo, null);
    assert.equal((await guest(`/api/menu/bluebar/photo/${id}`)).statusCode, 404);
    assert.equal((await guest("/api/menu/nuk-ekziston")).statusCode, 404);
    // The menu's identity: a curated brand colour, a welcome line, a logo (PNG allowed).
    assert.deepEqual((await guest("/api/menu/bluebar")).json().brand, { tagline: "", accent: "blue", logo: null });
    assert.equal((await t.call("PUT", "/api/venue/menu-brand", { cookie, body: { tagline: "Kafe që nga 2012", accent: "hotpink" } })).statusCode, 400);
    assert.equal((await t.call("PUT", "/api/venue/menu-brand", { cookie, body: { tagline: " Kafe që nga 2012 ", accent: "teal" } })).statusCode, 200);
    const png = "data:image/png;base64," + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]).toString("base64");
    assert.equal((await t.call("PUT", "/api/venue/menu-logo", { body: { dataUrl: png } })).statusCode, 401);
    assert.equal((await t.call("PUT", "/api/venue/menu-logo", { cookie, body: { dataUrl: fake } })).statusCode, 400);
    assert.equal((await t.call("PUT", "/api/venue/menu-logo", { cookie, body: { dataUrl: png } })).statusCode, 200);
    const brand = (await guest("/api/menu/bluebar")).json().brand;
    assert.equal(brand.tagline, "Kafe që nga 2012");
    assert.equal(brand.accent, "teal");
    const logo = await guest(`/api/menu/bluebar/logo?v=${brand.logo}`);
    assert.equal(logo.headers["content-type"], "image/png");
    assert.equal((await t.call("DELETE", "/api/venue/menu-logo", { cookie })).statusCode, 200);
    assert.equal((await guest("/api/menu/bluebar")).json().brand.logo, null);
  } finally {
    await t.close();
  }
});

test("guests order from the menu: only with the table's QR key, at the server's prices, straight to the stations, with a notice for the waiter", async () => {
  const t = await setup();
  try {
    await t.send("shift.open", { opening: 1000 });
    await t.send("product.save", { name: "Espresso", price: 100, category: "Kafe", extras: [{ name: "Dopio", price: 50 }] });
    await t.send("product.save", { name: "Sekret", price: 900, category: "Kafe", menuVisible: false });
    await t.send("product.save", { name: "Tiramisu", price: 300, category: "Kafe" });
    await t.send("stock.receive", { productId: 1, qty: 50 });
    await t.send("stock.receive", { productId: 2, qty: 10 });
    await t.send("stock.receive", { productId: 3, qty: 1 });
    const cookie = t.cookieOf(await t.managerLogin());
    await t.call("PUT", "/api/venue/menu", { cookie, body: { enabled: true } });
    const keys = (await t.call("GET", "/api/venue/menu/tables", { cookie })).json().tables;
    const key = keys.find((k) => k.id === 1).key;
    assert.notEqual(key, keys.find((k) => k.id === 2).key, "each table has its own key");
    const order = (body) => t.call("POST", "/api/menu/bluebar/orders", { body });
    const state = async () => (await t.call("GET", "/api/state", { cookie })).json().state;
    // The server itself changes the data when a guest orders: send each command on the current version.
    const cmd = async (type, payload) => {
      const version = (await t.call("GET", "/api/state", { cookie })).json().version;
      const r = await t.call("POST", "/api/commands", { cookie, body: { id: randomUUID(), version, type, payload } });
      if (r.statusCode !== 200) throw new Error(r.json().error);
      return r.json();
    };
    const espresso = { productId: 1, qty: 2, extras: ["Dopio"] };
    // Ordering is off until the manager turns it on.
    assert.equal((await order({ table: 1, key, items: [espresso] })).statusCode, 409);
    assert.equal((await t.call("PUT", "/api/venue/menu", { cookie, body: { ordering: true } })).json().menuOrdering, true);
    assert.equal((await t.inject({ method: "GET", url: `/api/menu/bluebar/table/1?k=${key}`, headers: { host: "localhost" } })).json().open, true);
    // No key, another table's key, a hidden product, a cross-site post: refused.
    assert.equal((await order({ table: 1, key: "x".repeat(16), items: [espresso] })).statusCode, 403);
    assert.equal((await order({ table: 2, key, items: [espresso] })).statusCode, 403);
    assert.equal((await order({ table: 1, key, items: [{ productId: 2, qty: 1 }] })).statusCode, 409);
    assert.equal((await t.inject({ method: "POST", url: "/api/menu/bluebar/orders", payload: { table: 1, key, items: [espresso] }, headers: { host: "localhost" } })).statusCode, 403);
    // Placed: straight onto the table and to the stations, at the product's own price
    // (a price the guest sends is dropped), and a notice waits for the waiter.
    const placed = await order({ table: 1, key, items: [{ ...espresso, price: 1 }], note: "Shpejt ju lutem" });
    assert.equal(placed.statusCode, 201);
    const { id, token, status: placedStatus } = placed.json();
    assert.equal(placedStatus, "accepted");
    const status = () => t.inject({ method: "GET", url: `/api/menu/bluebar/orders/${id}?token=${token}`, headers: { host: "localhost" } });
    assert.equal((await status()).json().status, "accepted");
    assert.equal((await t.inject({ method: "GET", url: `/api/menu/bluebar/orders/${id}?token=wrong`, headers: { host: "localhost" } })).statusCode, 404);
    let s = await state();
    const line = s.tables.find((x) => x.id === 1).lines[0];
    assert.equal(line.qty, 2);
    assert.equal(line.price, 150, "the price is the product's own, extras included");
    assert.equal(line.sent, 2, "sent to the stations");
    assert.ok(s.tables.find((x) => x.id === 1).waiter, "the order has a waiter");
    assert.deepEqual(s.guestAlerts.map((g) => g.id), [id]);
    assert.equal(s.guestOrders.length, 0);
    await cmd("guest.seen", { id });
    assert.equal((await state()).guestAlerts.length, 0);
    await assert.rejects(cmd("guest.seen", { id }));
    // When it can't go through (here: the last tiramisu is already on a table), it waits
    // for staff instead of being lost; they accept or reject it by hand.
    await cmd("order.add", { tableId: 2, productId: 3, waiterId: 1 });
    const stuck = (await order({ table: 1, key, items: [{ productId: 3, qty: 1 }] })).json();
    assert.equal(stuck.status, "pending");
    assert.deepEqual((await state()).guestOrders.map((g) => g.id), [stuck.id]);
    await cmd("guest.reject", { id: stuck.id, reason: "Tiramisu mbaroi" });
    const rejected = (await t.inject({ method: "GET", url: `/api/menu/bluebar/orders/${stuck.id}?token=${stuck.token}`, headers: { host: "localhost" } })).json();
    assert.deepEqual(rejected, { status: "rejected", reason: "Tiramisu mbaroi" });
    // A table gets at most six orders in half an hour.
    for (let n = 0; n < 4; n++) assert.equal((await order({ table: 1, key, items: [{ productId: 1, qty: 1 }] })).statusCode, 201);
    assert.equal((await order({ table: 1, key, items: [{ productId: 1, qty: 1 }] })).statusCode, 429);
  } finally {
    await t.close();
  }
});
