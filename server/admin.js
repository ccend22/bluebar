import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { AppError } from "./commands.js";
import { tenantPool, registerVenue, validSlug, spendBudget } from "./tenants.js";
import { hashSecret, verifySecret, validPin, issueSession, sessionCookie, readCookie } from "./auth.js";

// BlueBar's superadmin (/admin): BlueSquare's own view over every business. Sign-in is an
// email and password from bluebar_catalog.admin_accounts (made with `npm run auth:admin`);
// the session is a signed cookie of that email and its session_version (8 hours), checked
// against the account on every request. Every change is written to bluebar_catalog.admin_log.

const HOURS = 8;
const TZ = "Europe/Tirane";
const cookieName = (secure) => (secure ? "__Host-bluebar_admin" : "bluebar_admin");
const sign = (key, body) => createHmac("sha256", key).update(`admin:${body}`).digest("base64url");
const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const ymd = /^\d{4}-\d{2}-\d{2}$/;
const validEmail = (e) => typeof e === "string" && e.length <= 120 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const validPassword = (p) => typeof p === "string" && p.length >= 8 && p.length <= 200;
const LOCK_AFTER = 5;

// Creates the superadmin, or gives an existing one a new password (and signs them out
// everywhere). Without a password, a strong one is made up and returned to show once.
export async function setAdminPassword(pool, email, password = randomBytes(15).toString("base64url")) {
  const who = String(email || "").trim().toLowerCase();
  if (!validEmail(who)) throw new AppError("Email i pavlefshëm.");
  if (!validPassword(password)) throw new AppError("Fjalëkalimi duhet të ketë të paktën 8 shenja.");
  await pool.query(`INSERT INTO bluebar_catalog.admin_accounts(email, password_hash) VALUES($1, $2)
    ON CONFLICT (email) DO UPDATE SET password_hash = $2, session_version = bluebar_catalog.admin_accounts.session_version + 1,
      failed_attempts = 0, locked_until = NULL`, [who, await hashSecret(password)]);
  return { email: who, password };
}
let decoy;

// The subscription as the superadmin reads it. Free (no price) never falls behind.
export function subscriptionStatus(sub, today) {
  if (!sub || !sub.monthly_price) return "falas";
  if (!sub.paid_until) return "pa_paguar";
  const until = String(sub.paid_until).slice(0, 10);
  if (until < today) return "vonuar";
  const soon = new Date(`${today}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + 7);
  return until <= soon.toISOString().slice(0, 10) ? "skadon" : "paguar";
}
// A payment covers whole months from the day after the last paid one, or from the day it
// was paid when the subscription had already lapsed.
export function coverage(paidUntil, paidOn, months) {
  const day = (s) => new Date(`${s}T00:00:00Z`);
  const last = paidUntil ? String(paidUntil).slice(0, 10) : null;
  const from = last && last >= addDays(paidOn, -1) ? addDays(last, 1) : paidOn;
  const to = day(from);
  to.setUTCMonth(to.getUTCMonth() + months);
  to.setUTCDate(to.getUTCDate() - 1);
  return { from, to: to.toISOString().slice(0, 10) };
}
function addDays(s, n) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// One business's money and activity from one Tirana day to another, both included: a day's
// sales are the ones rung up that day in Albania.
const ACTIVITY = `
  WITH p AS (SELECT (($1::date)::timestamp AT TIME ZONE '${TZ}') AS a, (($2::date + 1)::timestamp AT TIME ZONE '${TZ}') AS b),
  i AS (SELECT total, cash_amount, card_amount FROM bluebar.invoices, p WHERE created_at >= p.a AND created_at < p.b)
  SELECT
    (SELECT COALESCE(sum(total), 0) FROM i) AS sales,
    (SELECT COALESCE(sum(cash_amount), 0) FROM i) AS cash,
    (SELECT COALESCE(sum(card_amount), 0) FROM i) AS card,
    (SELECT count(*) FROM i) AS invoices,
    (SELECT COALESCE(sum(amount), 0) FROM bluebar.refunds, p WHERE created_at >= p.a AND created_at < p.b) AS refunds,
    (SELECT max(last_seen) FROM bluebar.sessions) AS last_seen,
    (SELECT max(created_at) FROM bluebar.invoices) AS last_invoice,
    (SELECT count(*) FROM bluebar.accounts WHERE active AND role = 'manager') AS managers,
    (SELECT count(*) FROM bluebar.waiters WHERE active AND NOT deleted) AS waiters,
    (SELECT count(*) FROM bluebar.products) AS products`;
const num = (v) => Number(v || 0);
// A business's people: its managers, and every waiter still on the team (with or without a
// PIN yet), each with when they were last signed in.
const USERS = `
  SELECT 'manager' AS role, a.id, a.username AS name, a.active,
    (SELECT max(last_seen) FROM bluebar.sessions s WHERE s.account_id = a.id) AS last_seen
  FROM bluebar.accounts a WHERE a.role = 'manager'
  UNION ALL
  SELECT 'waiter', w.id, w.name, w.active AND COALESCE(a.active, true),
    (SELECT max(last_seen) FROM bluebar.sessions s WHERE s.account_id = a.id)
  FROM bluebar.waiters w LEFT JOIN bluebar.accounts a ON a.waiter_id = w.id WHERE NOT w.deleted
  ORDER BY 1, 2`;
const person = (u) => ({ id: u.id, role: u.role, name: u.name, active: u.active, lastSeen: u.last_seen });

export function registerAdmin(app, { pool, secretKey, secureCookies = false }) {
  const name = cookieName(secureCookies);
  const ready = () => {
    if (!pool) throw new AppError("Mungon DATABASE_URL.", 503);
    if (!secretKey) throw new AppError("Superadmin nuk është konfiguruar në server.", 503);
  };
  const cookie = (value, maxAge) => `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookies ? "; Secure" : ""}`;
  const issue = (email, version) => {
    const body = `${Buffer.from(email).toString("base64url")}.${version}.${Math.floor(Date.now() / 1000) + HOURS * 3600}`;
    return `${body}.${sign(secretKey, body)}`;
  };
  // The cookie must be ours, unexpired, and name an account that still exists with the same
  // password generation (a deleted account or a changed password ends it).
  const admin = async (request) => {
    ready();
    const [b64, version, exp, mac] = (readCookie(request, name) || "").split(".");
    const email = b64 && version && exp && mac && same(mac, sign(secretKey, `${b64}.${version}.${exp}`)) && Number(exp) > Date.now() / 1000
      ? Buffer.from(b64, "base64url").toString() : null;
    const account = email && (await pool.query("SELECT session_version FROM bluebar_catalog.admin_accounts WHERE email=$1", [email])).rows[0];
    if (!account || String(account.session_version) !== version) throw new AppError("Hyni si superadmin.", 401);
    request.admin = email;
  };
  const log = (request, action, venue = null, detail = {}) =>
    pool.query("INSERT INTO bluebar_catalog.admin_log(admin_email, action, venue_slug, detail) VALUES($1,$2,$3,$4)",
      [request.admin, action, venue, JSON.stringify(detail)]);
  const today = async () => (await pool.query(`SELECT (now() AT TIME ZONE '${TZ}')::date::text AS d`)).rows[0].d;
  const venueRow = async (slug) => {
    if (!validSlug(slug)) throw new AppError("Biznesi nuk u gjet.", 404);
    const v = (await pool.query("SELECT * FROM bluebar_catalog.venues WHERE slug=$1", [slug])).rows[0];
    if (!v) throw new AppError("Biznesi nuk u gjet.", 404);
    return v;
  };
  const activity = async (venue, from, to) => {
    const row = (await tenantPool(pool, venue.schema_name).query(ACTIVITY, [from, to])).rows[0];
    return {
      sales: num(row.sales), cash: num(row.cash), card: num(row.card), invoices: num(row.invoices), refunds: num(row.refunds),
      lastSeen: row.last_seen, lastInvoice: row.last_invoice, managers: num(row.managers), waiters: num(row.waiters), products: num(row.products),
    };
  };
  const monthStart = (d) => `${d.slice(0, 8)}01`;
  const summary = async (from, to) => {
    const d = await today();
    const venues = (await pool.query(`SELECT v.*, s.plan, s.monthly_price, s.paid_until::text AS paid_until, s.note AS sub_note
      FROM bluebar_catalog.venues v LEFT JOIN bluebar_catalog.subscriptions s ON s.venue_slug = v.slug ORDER BY v.created_at`)).rows;
    const rows = await Promise.all(venues.map(async (v) => ({
      slug: v.slug, name: v.name, createdAt: v.created_at, luxhotel: Boolean(v.luxhotel_uid),
      suspended: Boolean(v.suspended_at), suspendedAt: v.suspended_at, suspendedReason: v.suspended_reason,
      subscription: { plan: v.plan || null, monthlyPrice: num(v.monthly_price), paidUntil: v.paid_until || null, note: v.sub_note || "", status: subscriptionStatus(v, d) },
      ...(await activity(v, from || monthStart(d), to || d).catch(() => ({ error: true }))),
    })));
    return { today: d, from: from || monthStart(d), to: to || d, venues: rows };
  };
  const period = (q) => {
    const { from, to } = q || {};
    if ((from && !ymd.test(from)) || (to && !ymd.test(to)) || (from && to && from > to)) throw new AppError("Periudhë e pavlefshme.");
    return [from, to];
  };

  // ── Sign-in ──
  // Email and password. The same answer for an unknown email and a wrong password; after
  // five wrong ones in a row the account waits 15 minutes; an IP gets 30 tries an hour.
  app.post("/api/admin/login", {
    schema: { body: { type: "object", additionalProperties: false, required: ["email", "password"],
      properties: { email: { type: "string", maxLength: 120 }, password: { type: "string", maxLength: 200 } } } },
  }, async (request, reply) => {
    ready();
    if ((await spendBudget(pool, `admin:${request.ip}`)) > 30) throw new AppError("Shumë përpjekje. Provoni pas pak.", 429);
    const who = request.body.email.trim().toLowerCase();
    const account = (await pool.query("SELECT * FROM bluebar_catalog.admin_accounts WHERE email=$1", [who])).rows[0];
    if (account?.locked_until && new Date(account.locked_until) > new Date())
      throw new AppError("Shumë fjalëkalime të gabuara. Provoni pas 15 minutash.", 429);
    const ok = await verifySecret(request.body.password, account?.password_hash ?? (decoy ??= await hashSecret("decoy-admin")));
    if (!account || !ok) {
      if (account) await pool.query(`UPDATE bluebar_catalog.admin_accounts SET
        locked_until = CASE WHEN failed_attempts + 1 >= ${LOCK_AFTER} THEN now() + interval '15 minutes' ELSE NULL END,
        failed_attempts = CASE WHEN failed_attempts + 1 >= ${LOCK_AFTER} THEN 0 ELSE failed_attempts + 1 END WHERE email=$1`, [who]);
      throw new AppError("Email-i ose fjalëkalimi është i gabuar.", 401);
    }
    await pool.query("UPDATE bluebar_catalog.admin_accounts SET failed_attempts=0, locked_until=NULL, last_login_at=now() WHERE email=$1", [who]);
    reply.header("Set-Cookie", cookie(issue(who, account.session_version), HOURS * 3600));
    request.admin = who;
    await log(request, "hyrje");
    return { email: who };
  });
  app.post("/api/admin/logout", async (request, reply) => {
    reply.header("Set-Cookie", cookie("", 0));
    return { ok: true };
  });
  app.get("/api/admin/me", { preValidation: admin }, async (request) => ({ email: request.admin }));
  // A new password: the current one first; every other device is signed out, this one stays.
  app.put("/api/admin/password", {
    preValidation: admin,
    schema: { body: { type: "object", additionalProperties: false, required: ["current", "next"],
      properties: { current: { type: "string", maxLength: 200 }, next: { type: "string", maxLength: 200 } } } },
  }, async (request, reply) => {
    const account = (await pool.query("SELECT password_hash FROM bluebar_catalog.admin_accounts WHERE email=$1", [request.admin])).rows[0];
    if (!(await verifySecret(request.body.current, account.password_hash))) throw new AppError("Fjalëkalimi aktual është i gabuar.", 403);
    if (!validPassword(request.body.next)) throw new AppError("Fjalëkalimi i ri duhet të ketë të paktën 8 shenja.");
    await setAdminPassword(pool, request.admin, request.body.next);
    const { session_version } = (await pool.query("SELECT session_version FROM bluebar_catalog.admin_accounts WHERE email=$1", [request.admin])).rows[0];
    reply.header("Set-Cookie", cookie(issue(request.admin, session_version), HOURS * 3600));
    await log(request, "fjalekalimi");
    return { ok: true };
  });

  // ── Overview, businesses, reports ──
  app.get("/api/admin/overview", { preValidation: admin }, async () => {
    const s = await summary();
    const live = s.venues.filter((v) => !v.error);
    const subs = s.venues.map((v) => v.subscription);
    const count = (st) => subs.filter((x) => x.status === st).length;
    const day = (await pool.query("SELECT (now() - interval '30 days')::date::text AS d")).rows[0].d;
    const payments = (await pool.query(`SELECT COALESCE(sum(amount),0) AS total, count(*) AS n FROM bluebar_catalog.subscription_payments
      WHERE paid_on >= date_trunc('month', (now() AT TIME ZONE '${TZ}'))::date`)).rows[0];
    return {
      today: s.today, month: s.from,
      venues: { total: s.venues.length, suspended: s.venues.filter((v) => v.suspended).length, new30: s.venues.filter((v) => String(v.createdAt?.toISOString?.() ?? v.createdAt).slice(0, 10) >= day).length,
        active7: live.filter((v) => v.lastSeen && Date.now() - new Date(v.lastSeen) < 7 * 864e5).length },
      subscriptions: { paid: count("paguar"), soon: count("skadon"), late: count("vonuar"), unpaid: count("pa_paguar"), free: count("falas"),
        mrr: s.venues.filter((v) => !v.suspended && v.subscription.status !== "falas").reduce((n, v) => n + v.subscription.monthlyPrice, 0),
        collectedThisMonth: num(payments.total), paymentsThisMonth: num(payments.n) },
      sales: { month: live.reduce((n, v) => n + v.sales, 0), invoices: live.reduce((n, v) => n + v.invoices, 0),
        cash: live.reduce((n, v) => n + v.cash, 0), card: live.reduce((n, v) => n + v.card, 0), refunds: live.reduce((n, v) => n + v.refunds, 0) },
      attention: s.venues.filter((v) => ["vonuar", "pa_paguar", "skadon"].includes(v.subscription.status) || v.suspended)
        .map((v) => ({ slug: v.slug, name: v.name, status: v.subscription.status, paidUntil: v.subscription.paidUntil, suspended: v.suspended })),
    };
  });
  app.get("/api/admin/venues", { preValidation: admin }, async (request) => summary(...period(request.query)));
  app.get("/api/admin/venues/:slug", { preValidation: admin }, async (request) => {
    const v = await venueRow(request.params.slug);
    const d = await today();
    const db = tenantPool(pool, v.schema_name);
    const sub = (await pool.query("SELECT plan, monthly_price, paid_until::text AS paid_until, note FROM bluebar_catalog.subscriptions WHERE venue_slug=$1", [v.slug])).rows[0];
    const users = (await db.query(USERS)).rows.map(person);
    const daily = (await db.query(`SELECT (created_at AT TIME ZONE '${TZ}')::date::text AS day, sum(total) AS sales, count(*) AS invoices
      FROM bluebar.invoices WHERE created_at >= now() - interval '30 days' GROUP BY 1 ORDER BY 1`)).rows.map((r) => ({ day: r.day, sales: num(r.sales), invoices: num(r.invoices) }));
    const payments = (await pool.query(`SELECT id, amount, paid_on::text AS paid_on, months, covers_from::text AS covers_from, covers_to::text AS covers_to, method, note, recorded_by, created_at
      FROM bluebar_catalog.subscription_payments WHERE venue_slug=$1 ORDER BY created_at DESC`, [v.slug])).rows
      .map((p) => ({ id: p.id, amount: p.amount, paidOn: p.paid_on, months: p.months, from: p.covers_from, to: p.covers_to, method: p.method, note: p.note, by: p.recorded_by, at: p.created_at }));
    const logRows = (await pool.query("SELECT at, admin_email, action, detail FROM bluebar_catalog.admin_log WHERE venue_slug=$1 ORDER BY at DESC LIMIT 50", [v.slug])).rows;
    return {
      slug: v.slug, name: v.name, createdAt: v.created_at, luxhotel: Boolean(v.luxhotel_uid), loginMode: v.login_mode, menuEnabled: v.menu_enabled,
      suspended: Boolean(v.suspended_at), suspendedAt: v.suspended_at, suspendedReason: v.suspended_reason,
      subscription: { plan: sub?.plan || null, monthlyPrice: num(sub?.monthly_price), paidUntil: sub?.paid_until || null, note: sub?.note || "", status: subscriptionStatus(sub, d) },
      month: await activity(v, monthStart(d), d), users, daily, payments, log: logRows,
    };
  });
  app.get("/api/admin/users", { preValidation: admin }, async () => {
    const venues = (await pool.query("SELECT slug, name, schema_name, suspended_at FROM bluebar_catalog.venues ORDER BY name")).rows;
    const lists = await Promise.all(venues.map(async (v) => (await tenantPool(pool, v.schema_name).query(USERS).catch(() => ({ rows: [] }))).rows
      .map((u) => ({ venue: v.slug, venueName: v.name, suspended: Boolean(v.suspended_at), ...person(u) }))));
    return { users: lists.flat() };
  });
  app.get("/api/admin/payments", { preValidation: admin }, async () => ({
    payments: (await pool.query(`SELECT p.id, p.venue_slug, v.name, p.amount, p.paid_on::text AS paid_on, p.months, p.covers_from::text AS covers_from,
        p.covers_to::text AS covers_to, p.method, p.note, p.recorded_by, p.created_at
      FROM bluebar_catalog.subscription_payments p LEFT JOIN bluebar_catalog.venues v ON v.slug = p.venue_slug ORDER BY p.created_at DESC LIMIT 500`)).rows
      .map((p) => ({ id: p.id, venue: p.venue_slug, venueName: p.name, amount: p.amount, paidOn: p.paid_on, months: p.months, from: p.covers_from, to: p.covers_to, method: p.method, note: p.note, by: p.recorded_by, at: p.created_at })),
  }));
  // Platform-wide sales by day for a period, each business's share alongside.
  app.get("/api/admin/reports", { preValidation: admin }, async (request) => {
    const [from0, to0] = period(request.query);
    const d = await today();
    const from = from0 || monthStart(d), to = to0 || d;
    const venues = (await pool.query("SELECT slug, name, schema_name FROM bluebar_catalog.venues")).rows;
    const byDay = new Map();
    const perVenue = await Promise.all(venues.map(async (v) => {
      const db = tenantPool(pool, v.schema_name);
      const rows = (await db.query(`SELECT (created_at AT TIME ZONE '${TZ}')::date::text AS day, sum(total) AS sales, sum(cash_amount) AS cash,
          sum(card_amount) AS card, count(*) AS invoices
        FROM bluebar.invoices WHERE created_at >= (($1::date)::timestamp AT TIME ZONE '${TZ}') AND created_at < (($2::date + 1)::timestamp AT TIME ZONE '${TZ}')
        GROUP BY 1`, [from, to]).catch(() => ({ rows: [] }))).rows;
      for (const r of rows) {
        const day = byDay.get(r.day) || { day: r.day, sales: 0, cash: 0, card: 0, invoices: 0 };
        for (const k of ["sales", "cash", "card", "invoices"]) day[k] += num(r[k]);
        byDay.set(r.day, day);
      }
      return { slug: v.slug, name: v.name, sales: rows.reduce((n, r) => n + num(r.sales), 0), invoices: rows.reduce((n, r) => n + num(r.invoices), 0) };
    }));
    const subs = (await pool.query(`SELECT COALESCE(sum(amount),0) AS total, count(*) AS n FROM bluebar_catalog.subscription_payments WHERE paid_on BETWEEN $1 AND $2`, [from, to])).rows[0];
    return { from, to, days: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
      venues: perVenue.sort((a, b) => b.sales - a.sales), subscriptionsCollected: num(subs.total), subscriptionPayments: num(subs.n) };
  });
  app.get("/api/admin/log", { preValidation: admin }, async () => ({
    log: (await pool.query("SELECT at, admin_email, action, venue_slug, detail FROM bluebar_catalog.admin_log ORDER BY at DESC LIMIT 300")).rows
      .map((r) => ({ at: r.at, admin: r.admin_email, action: r.action, venue: r.venue_slug, detail: r.detail })),
  }));

  // ── Changes ──
  const body = (properties, required = []) => ({ body: { type: "object", additionalProperties: false, required, properties } });
  app.put("/api/admin/venues/:slug/subscription", {
    preValidation: admin,
    schema: body({ plan: { type: "string", minLength: 1, maxLength: 40 }, monthlyPrice: { type: "integer", minimum: 0, maximum: 10000000 },
      paidUntil: { anyOf: [{ type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" }, { type: "null" }] }, note: { type: "string", maxLength: 300 } }, ["plan", "monthlyPrice"]),
  }, async (request) => {
    const v = await venueRow(request.params.slug);
    const { plan, monthlyPrice, paidUntil, note = "" } = request.body;
    if (!plan.trim()) throw new AppError("Vendosni planin.");
    await pool.query(`INSERT INTO bluebar_catalog.subscriptions(venue_slug, plan, monthly_price, paid_until, note) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT (venue_slug) DO UPDATE SET plan=$2, monthly_price=$3, paid_until=${paidUntil === undefined ? "bluebar_catalog.subscriptions.paid_until" : "$4"}, note=$5, updated_at=now()`,
      [v.slug, plan.trim(), monthlyPrice, paidUntil ?? null, note.trim()]);
    await log(request, "abonimi", v.slug, { plan: plan.trim(), monthlyPrice, ...(paidUntil !== undefined && { paidUntil }) });
    return { ok: true };
  });
  app.post("/api/admin/venues/:slug/payments", {
    preValidation: admin,
    schema: body({ amount: { type: "integer", minimum: 1, maximum: 100000000 }, paidOn: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      months: { type: "integer", minimum: 1, maximum: 24 }, method: { type: "string", enum: ["Cash", "Bankë"] }, note: { type: "string", maxLength: 200 } },
      ["amount", "paidOn", "months", "method"]),
  }, async (request) => {
    const v = await venueRow(request.params.slug);
    const { amount, paidOn, months, method, note = "" } = request.body;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO bluebar_catalog.subscriptions(venue_slug) VALUES($1) ON CONFLICT DO NOTHING", [v.slug]);
      const sub = (await client.query("SELECT paid_until::text AS paid_until FROM bluebar_catalog.subscriptions WHERE venue_slug=$1 FOR UPDATE", [v.slug])).rows[0];
      const { from, to } = coverage(sub.paid_until, paidOn, months);
      const id = randomUUID();
      await client.query(`INSERT INTO bluebar_catalog.subscription_payments(id, venue_slug, amount, paid_on, months, covers_from, covers_to, method, note, recorded_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id, v.slug, amount, paidOn, months, from, to, method, note.trim(), request.admin]);
      await client.query("UPDATE bluebar_catalog.subscriptions SET paid_until=$2, updated_at=now() WHERE venue_slug=$1", [v.slug, to]);
      await client.query("COMMIT");
      await log(request, "pagesa", v.slug, { amount, months, method, from, to });
      return { id, from, to };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally { client.release(); }
  });
  // Only the latest payment can be taken back (a typing mistake): the months it added go too.
  app.delete("/api/admin/venues/:slug/payments/:id", { preValidation: admin }, async (request) => {
    const v = await venueRow(request.params.slug);
    const last = (await pool.query(`SELECT id, amount, covers_from::text AS covers_from FROM bluebar_catalog.subscription_payments
      WHERE venue_slug=$1 ORDER BY created_at DESC LIMIT 1`, [v.slug])).rows[0];
    if (!last || last.id !== request.params.id) throw new AppError("Mund të fshihet vetëm pagesa e fundit.", 409);
    await pool.query("DELETE FROM bluebar_catalog.subscription_payments WHERE id=$1", [last.id]);
    await pool.query("UPDATE bluebar_catalog.subscriptions SET paid_until=$2, updated_at=now() WHERE venue_slug=$1", [v.slug, addDays(last.covers_from, -1)]);
    await log(request, "pagesa_fshire", v.slug, { amount: last.amount });
    return { ok: true };
  });
  app.post("/api/admin/venues/:slug/suspend", {
    preValidation: admin, schema: body({ suspended: { type: "boolean" }, reason: { type: "string", maxLength: 200 } }, ["suspended"]),
  }, async (request) => {
    const v = await venueRow(request.params.slug);
    const { suspended, reason = "" } = request.body;
    await pool.query("UPDATE bluebar_catalog.venues SET suspended_at=$2, suspended_reason=$3 WHERE slug=$1",
      [v.slug, suspended ? new Date() : null, suspended ? reason.trim() || null : null]);
    // Off means off now: everyone signed in to it is signed out.
    if (suspended) await tenantPool(pool, v.schema_name).query("DELETE FROM bluebar.sessions");
    await log(request, suspended ? "pezullim" : "aktivizim", v.slug, suspended ? { reason: reason.trim() } : {});
    return { ok: true };
  });
  app.post("/api/admin/venues/:slug/manager-pin", {
    preValidation: admin, schema: body({ pin: { type: "string", pattern: "^[0-9]{6}$" } }, ["pin"]),
  }, async (request) => {
    const v = await venueRow(request.params.slug);
    if (!validPin(request.body.pin)) throw new AppError("PIN-i duhet të ketë 6 shifra.");
    const db = tenantPool(pool, v.schema_name);
    const manager = (await db.query("SELECT id FROM bluebar.accounts WHERE role='manager' AND active ORDER BY id LIMIT 1")).rows[0];
    if (!manager) throw new AppError("Biznesi nuk ka menaxher aktiv.", 409);
    await db.query("UPDATE bluebar.accounts SET secret_hash=$2, failed_attempts=0, locked_until=NULL WHERE id=$1", [manager.id, await hashSecret(request.body.pin)]);
    await db.query("DELETE FROM bluebar.sessions WHERE account_id=$1", [manager.id]);
    await log(request, "pin_menaxheri", v.slug);
    return { ok: true };
  });
  // Support: this browser becomes the business's manager for an hour, written to the log.
  app.post("/api/admin/venues/:slug/impersonate", { preValidation: admin }, async (request, reply) => {
    const v = await venueRow(request.params.slug);
    if (v.suspended_at) throw new AppError("Biznesi është pezulluar. Aktivizojeni para se të hyni.", 409);
    const db = tenantPool(pool, v.schema_name);
    const manager = (await db.query("SELECT id FROM bluebar.accounts WHERE role='manager' AND active ORDER BY id LIMIT 1")).rows[0];
    if (!manager) throw new AppError("Biznesi nuk ka menaxher aktiv.", 409);
    const token = await issueSession(db, manager.id);
    await db.query("UPDATE bluebar.sessions SET expires_at = now() + interval '1 hour' WHERE token_hash=$1", [createHash("sha256").update(token).digest("hex")]);
    reply.header("Set-Cookie", sessionCookie(secureCookies, token, 3600, v.slug));
    await log(request, "hyrje_si_menaxher", v.slug);
    return { slug: v.slug };
  });
  app.post("/api/admin/venues", {
    preValidation: admin,
    schema: body({ slug: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{2,39}$" }, name: { type: "string", minLength: 2, maxLength: 80 }, pin: { type: "string", pattern: "^[0-9]{6}$" } }, ["slug", "name", "pin"]),
  }, async (request) => {
    const { venue } = await registerVenue(pool, request.body, `admin:${request.admin}`, 50).catch((error) => {
      if (error.code === "23505") throw new AppError("Ky kod biznesi është i zënë.", 409);
      throw error;
    });
    await log(request, "biznes_i_ri", venue.slug, { name: venue.name });
    return { slug: venue.slug };
  });
  // Deleting is final: its schema (every order, invoice and setting) goes. The legacy
  // business can't be deleted, and the slug must be typed back as confirmation.
  app.delete("/api/admin/venues/:slug", {
    preValidation: admin, schema: body({ confirm: { type: "string", maxLength: 40 } }, ["confirm"]),
  }, async (request) => {
    const v = await venueRow(request.params.slug);
    if (v.schema_name === "bluebar") throw new AppError("Biznesi kryesor nuk mund të fshihet.", 409);
    if (request.body.confirm !== v.slug) throw new AppError("Shkruani kodin e biznesit për ta konfirmuar.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(70483201)");
      await client.query("DELETE FROM bluebar_catalog.venues WHERE slug=$1", [v.slug]);
      if (!/^bluebar_[a-f0-9]{32}$/.test(v.schema_name)) throw new AppError("Skemë e pavlefshme.", 500);
      await client.query(`DROP SCHEMA ${v.schema_name} CASCADE`);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally { client.release(); }
    await log(request, "biznes_i_fshire", v.slug, { name: v.name });
    return { ok: true };
  });
}
