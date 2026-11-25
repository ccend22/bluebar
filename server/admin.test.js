import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "./migrate.js";
import { buildApp } from "./app.js";
import { execute, readSnapshot } from "./repository.js";
import { createManager } from "./auth.js";
import { coverage, setAdminPassword, subscriptionStatus } from "./admin.js";

const BOSS = { email: "Boss@BlueSquare.al", password: "a-long-test-password" };

async function setup(options = {}) {
  const db = new PGlite();
  const query = (sql, params) => (params ? db.query(sql, params) : db.exec(sql).then((r) => r.at(-1) || { rows: [] }));
  const pool = { query, connect: async () => ({ query, release() {} }) };
  await migrate(pool);
  const manager = await createManager(pool, "boss");
  await setAdminPassword(pool, BOSS.email, BOSS.password);
  const app = buildApp({ pool, origins: ["http://127.0.0.1:5173"], secretKey: "test-secret-key-for-admin-cookies", ...options });
  const call = (method, url, { body, cookie, venue } = {}) => app.inject({
    method, url, payload: body,
    headers: { host: "localhost", origin: "http://127.0.0.1:5173", "x-bluebar-client": "1", ...(venue && { "x-bluebar-venue": venue }), ...(cookie && { cookie }) },
  });
  const cookieOf = (res) => String(res.headers["set-cookie"]).split(";")[0];
  return { pool, app, call, cookieOf, manager, close: () => app.close() };
}

test("superadmin: subscription status and the months a payment covers", () => {
  assert.equal(subscriptionStatus(null, "2026-11-25"), "falas");
  assert.equal(subscriptionStatus({ monthly_price: 0 }, "2026-11-25"), "falas");
  assert.equal(subscriptionStatus({ monthly_price: 3000 }, "2026-11-25"), "pa_paguar");
  assert.equal(subscriptionStatus({ monthly_price: 3000, paid_until: "2026-11-24" }, "2026-11-25"), "vonuar");
  assert.equal(subscriptionStatus({ monthly_price: 3000, paid_until: "2026-11-30" }, "2026-11-25"), "skadon");
  assert.equal(subscriptionStatus({ monthly_price: 3000, paid_until: "2026-12-31" }, "2026-11-25"), "paguar");
  // Nothing paid yet: from the day it is paid.
  assert.deepEqual(coverage(null, "2026-11-25", 1), { from: "2026-11-25", to: "2026-12-24" });
  // Still paid: the new months follow on without a gap.
  assert.deepEqual(coverage("2026-12-24", "2026-12-20", 3), { from: "2026-12-25", to: "2027-03-24" });
  // Lapsed: the gap isn't charged, it starts again from the payment.
  assert.deepEqual(coverage("2026-10-31", "2026-11-25", 1), { from: "2026-11-25", to: "2026-12-24" });
});

test("superadmin: email and password, lockout, a cookie that can't be forged, and password changes", async () => {
  const t = await setup();
  try {
    const login = (body) => t.call("POST", "/api/admin/login", { body });
    assert.equal((await t.call("GET", "/api/admin/me")).statusCode, 401);
    // Unknown email and wrong password get the same answer.
    const unknown = await login({ email: "someone@else.al", password: BOSS.password });
    const wrong = await login({ email: BOSS.email, password: "not-the-password" });
    assert.deepEqual([unknown.statusCode, wrong.statusCode, unknown.json().error], [401, 401, wrong.json().error]);
    const res = await login({ email: " boss@bluesquare.al ", password: BOSS.password });
    assert.equal(res.statusCode, 200, res.body);
    const cookie = t.cookieOf(res);
    assert.equal((await t.call("GET", "/api/admin/me", { cookie })).json().email, "boss@bluesquare.al");
    // A forged email in the same cookie fails the signature.
    const [, version, exp, mac] = cookie.split("=")[1].split(".");
    const forged = `bluebar_admin=${Buffer.from("someone@else.al").toString("base64url")}.${version}.${exp}.${mac}`;
    assert.equal((await t.call("GET", "/api/admin/me", { cookie: forged })).statusCode, 401);
    // A manager's own session is no superadmin.
    const manager = t.cookieOf(await t.call("POST", "/api/auth/manager-login", { body: { pin: t.manager.pin } }));
    assert.equal((await t.call("GET", "/api/admin/venues", { cookie: manager })).statusCode, 401);
    // A new password: the current one is needed, this browser stays in, another one is out.
    const other = t.cookieOf(await login(BOSS));
    assert.equal((await t.call("PUT", "/api/admin/password", { cookie, body: { current: "wrong", next: "another-long-password" } })).statusCode, 403);
    assert.equal((await t.call("PUT", "/api/admin/password", { cookie, body: { current: BOSS.password, next: "short" } })).statusCode, 400);
    const changed = await t.call("PUT", "/api/admin/password", { cookie, body: { current: BOSS.password, next: "another-long-password" } });
    assert.equal(changed.statusCode, 200, changed.body);
    assert.equal((await t.call("GET", "/api/admin/me", { cookie: t.cookieOf(changed) })).statusCode, 200);
    assert.equal((await t.call("GET", "/api/admin/me", { cookie: other })).statusCode, 401, "signed out elsewhere");
    assert.equal((await login(BOSS)).statusCode, 401, "the old password is gone");
    // Five wrong passwords: the account waits, even for the right one.
    for (let i = 0; i < 5; i++) await login({ email: BOSS.email, password: "nope-nope-nope" });
    assert.equal((await login({ email: BOSS.email, password: "another-long-password" })).statusCode, 429);
    await t.pool.query("UPDATE bluebar_catalog.admin_accounts SET locked_until = now() - interval '1 second'");
    const back = await login({ email: BOSS.email, password: "another-long-password" });
    assert.equal(back.statusCode, 200);
    // The account removed: its cookie stops working at once.
    await t.pool.query("DELETE FROM bluebar_catalog.admin_accounts");
    assert.equal((await t.call("GET", "/api/admin/me", { cookie: t.cookieOf(back) })).statusCode, 401);
    // No secret key on the server: closed.
    const closed = await setup({ secretKey: "" });
    assert.equal((await closed.call("POST", "/api/admin/login", { body: BOSS })).statusCode, 503);
    await closed.close();
    await assert.rejects(setAdminPassword(t.pool, "not-an-email"), /Email/);
    await assert.rejects(setAdminPassword(t.pool, "a@b.al", "short"), /8/);
  } finally {
    await t.close();
  }
});

test("superadmin: businesses, subscriptions and payments, suspend, manager PIN, support sign-in, create and delete", async () => {
  const t = await setup();
  try {
    const cookie = t.cookieOf(await t.call("POST", "/api/admin/login", { body: BOSS }));
    const admin = (method, url, body) => t.call(method, url, { cookie, body });
    // A new business, created for a client.
    let res = await admin("POST", "/api/admin/venues", { slug: "bar-kalaja", name: "Bar Kalaja", pin: "246810" });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal((await admin("POST", "/api/admin/venues", { slug: "bar-kalaja", name: "Tjetër", pin: "246810" })).statusCode, 409);
    // Its manager signs in and sells something, so the overview has money to show.
    const kalaja = t.cookieOf(await t.call("POST", "/api/auth/manager-login", { venue: "bar-kalaja", body: { pin: "246810" } }));
    const cmd = async (type, payload) => {
      const { version } = (await t.call("GET", "/api/state", { venue: "bar-kalaja", cookie: kalaja })).json();
      return t.call("POST", "/api/commands", { venue: "bar-kalaja", cookie: kalaja, body: { id: randomUUID(), version, type, payload } });
    };
    res = await cmd("table.save", { area: "Salla", shape: "Katror", seats: 4 });
    assert.equal(res.statusCode, 200, res.body);
    res = await cmd("department.create", { name: "Bar" });
    assert.equal(res.statusCode, 200, `department.create: ${res.body}`);
    res = await cmd("category.create", { name: "Kafe" });
    assert.equal(res.statusCode, 200, `category.create: ${res.body}`);
    res = await cmd("product.save", { name: "Espresso", category: "Kafe", price: 100, department: "Bar" });
    assert.equal(res.statusCode, 200, `product.save: ${res.body}`);
    res = await cmd("stock.receive", { productId: (await t.call("GET", "/api/state", { venue: "bar-kalaja", cookie: kalaja })).json().state.products[0].id, qty: 10 });
    assert.equal(res.statusCode, 200, `stock.receive: ${res.body}`);
    res = await cmd("waiter.create", { name: "Ana" });
    assert.equal(res.statusCode, 200, `waiter.create: ${res.body}`);
    res = await cmd("shift.open", { opening: 1000 });
    assert.equal(res.statusCode, 200, `shift.open: ${res.body}`);
    const state = (await t.call("GET", "/api/state", { venue: "bar-kalaja", cookie: kalaja })).json().state;
    res = await cmd("order.add", { tableId: state.tables[0].id, productId: state.products[0].id, waiterId: state.waiters[0].id });
    assert.equal(res.statusCode, 200, `order.add: ${res.body}`);
    res = await cmd("order.pay", { tableId: state.tables[0].id, method: "Cash", received: 100 });
    assert.equal(res.statusCode, 200, `order.pay: ${res.body}`);

    let list = (await admin("GET", "/api/admin/venues")).json();
    const row = list.venues.find((v) => v.slug === "bar-kalaja");
    assert.deepEqual([row.sales, row.cash, row.invoices, row.subscription.status], [100, 100, 1, "falas"]);
    assert.ok(list.venues.some((v) => v.slug === "bluebar"));

    // A plan of 3,000 Lek a month: unpaid until a payment comes in.
    assert.equal((await admin("PUT", "/api/admin/venues/bar-kalaja/subscription", { plan: "Standard", monthlyPrice: 3000 })).statusCode, 200);
    assert.equal((await admin("GET", "/api/admin/venues/bar-kalaja")).json().subscription.status, "pa_paguar");
    res = await admin("POST", "/api/admin/venues/bar-kalaja/payments", { amount: 3000, paidOn: "2026-11-25", months: 1, method: "Bankë" });
    assert.deepEqual(res.json().from, "2026-11-25");
    res = await admin("POST", "/api/admin/venues/bar-kalaja/payments", { amount: 9000, paidOn: "2026-11-26", months: 3, method: "Cash", note: "Tre muaj" });
    assert.deepEqual([res.json().from, res.json().to], ["2026-12-25", "2027-03-24"]);
    let detail = (await admin("GET", "/api/admin/venues/bar-kalaja")).json();
    assert.equal(detail.subscription.paidUntil, "2027-03-24");
    assert.equal(detail.payments.length, 2);
    // Only the latest payment can be taken back, and its months go with it.
    assert.equal((await admin("DELETE", `/api/admin/venues/bar-kalaja/payments/${detail.payments[1].id}`)).statusCode, 409);
    assert.equal((await admin("DELETE", `/api/admin/venues/bar-kalaja/payments/${detail.payments[0].id}`)).statusCode, 200);
    assert.equal((await admin("GET", "/api/admin/venues/bar-kalaja")).json().subscription.paidUntil, "2026-12-24");
    assert.equal((await admin("GET", "/api/admin/payments")).json().payments.length, 1);
    const overview = (await admin("GET", "/api/admin/overview")).json();
    assert.equal(overview.venues.total, 2);
    assert.equal(overview.subscriptions.mrr, 3000);

    // Suspended: its manager is signed out and the business answers nothing until it's back.
    assert.equal((await admin("POST", "/api/admin/venues/bar-kalaja/suspend", { suspended: true, reason: "Pa paguar" })).statusCode, 200);
    assert.equal((await t.call("GET", "/api/state", { venue: "bar-kalaja", cookie: kalaja })).statusCode, 403);
    assert.equal((await t.call("POST", "/api/auth/manager-login", { venue: "bar-kalaja", body: { pin: "246810" } })).statusCode, 403);
    assert.equal((await t.call("GET", "/api/menu/bar-kalaja")).statusCode, 403);
    assert.equal((await admin("POST", "/api/admin/venues/bar-kalaja/impersonate")).statusCode, 409, "no support sign-in while off");
    assert.equal((await t.call("GET", "/api/state", { cookie: t.cookieOf(await t.call("POST", "/api/auth/manager-login", { body: { pin: t.manager.pin } })) })).statusCode, 200, "other businesses carry on");
    assert.equal((await admin("POST", "/api/admin/venues/bar-kalaja/suspend", { suspended: false })).statusCode, 200);

    // A forgotten manager PIN: a new one, the old one stops.
    assert.equal((await admin("POST", "/api/admin/venues/bar-kalaja/manager-pin", { pin: "135790" })).statusCode, 200);
    assert.equal((await t.call("POST", "/api/auth/manager-login", { venue: "bar-kalaja", body: { pin: "246810" } })).statusCode, 401);
    assert.equal((await t.call("POST", "/api/auth/manager-login", { venue: "bar-kalaja", body: { pin: "135790" } })).statusCode, 200);

    // Support: this browser becomes its manager.
    res = await admin("POST", "/api/admin/venues/bar-kalaja/impersonate");
    assert.equal(res.statusCode, 200);
    assert.equal((await t.call("GET", "/api/state", { venue: "bar-kalaja", cookie: t.cookieOf(res) })).statusCode, 200);

    // Users across every business.
    const users = (await admin("GET", "/api/admin/users")).json().users;
    assert.ok(users.some((u) => u.venue === "bar-kalaja" && u.role === "manager"));
    assert.ok(users.some((u) => u.venue === "bar-kalaja" && u.name === "Ana"));
    assert.equal((await admin("GET", "/api/admin/reports?from=2026-11-30&to=2026-11-01")).statusCode, 400);
    assert.equal((await admin("GET", "/api/admin/reports")).statusCode, 200);

    // Deleting needs the code typed back; the main business never goes.
    assert.equal((await admin("DELETE", "/api/admin/venues/bluebar", { confirm: "bluebar" })).statusCode, 409);
    assert.equal((await admin("DELETE", "/api/admin/venues/bar-kalaja", { confirm: "kalaja" })).statusCode, 400);
    assert.equal((await admin("DELETE", "/api/admin/venues/bar-kalaja", { confirm: "bar-kalaja" })).statusCode, 200);
    assert.equal((await t.call("GET", "/api/venue", { venue: "bar-kalaja" })).statusCode, 404);
    list = (await admin("GET", "/api/admin/venues")).json();
    assert.equal(list.venues.length, 1);
    // Everything above is in the log, with who did it.
    const log = (await admin("GET", "/api/admin/log")).json().log;
    for (const action of ["hyrje", "biznes_i_ri", "abonimi", "pagesa", "pagesa_fshire", "pezullim", "aktivizim", "pin_menaxheri", "hyrje_si_menaxher", "biznes_i_fshire"])
      assert.ok(log.some((l) => l.action === action && l.admin === "boss@bluesquare.al"), action);
  } finally {
    await t.close();
  }
});
