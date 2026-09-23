import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "./migrate.js";
import { buildApp } from "./app.js";
import { execute, readSnapshot } from "./repository.js";
import { createManager, ipPolicy, setWaiterPin } from "./auth.js";

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
    assert.deepEqual(ok.json(), { role: "manager", waiterId: null, name: "boss", venue: { slug: "bluebar", name: "BlueBar" } });
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
