import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate, migrateTenant } from "./migrate.js";
import { buildApp } from "./app.js";
import { createManager, issueSession, sessionCookie } from "./auth.js";
import { tenantPool } from "./tenants.js";
import { resolvePeriod } from "./gpt.js";

test("named periods resolve to Tirana calendar days with a comparable previous period", () => {
  // 2026-11-24 23:30 UTC is already Wednesday the 25th in Tirana.
  const now = new Date("2026-11-24T23:30:00Z");
  const r = (q) => { const x = resolvePeriod(q, now); return [x.from, x.to, x.previous.from, x.previous.to]; };
  assert.deepEqual(r({}), ["2026-11-25", "2026-11-25", "2026-11-24", "2026-11-24"]);
  assert.deepEqual(r({ period: "yesterday" }), ["2026-11-24", "2026-11-24", "2026-11-23", "2026-11-23"]);
  assert.deepEqual(r({ period: "this_week" }), ["2026-11-23", "2026-11-25", "2026-11-16", "2026-11-18"]);
  assert.deepEqual(r({ period: "last_week" }), ["2026-11-16", "2026-11-22", "2026-11-09", "2026-11-15"]);
  assert.deepEqual(r({ period: "this_month" }), ["2026-11-01", "2026-11-25", "2026-10-01", "2026-10-25"]);
  assert.deepEqual(r({ period: "last_month" }), ["2026-10-01", "2026-10-31", "2026-09-01", "2026-09-30"]);
  assert.deepEqual(r({ period: "this_year" }), ["2026-01-01", "2026-11-25", "2025-01-01", "2025-11-25"]);
  assert.deepEqual(r({ period: "last_7_days" }), ["2026-11-19", "2026-11-25", "2026-11-12", "2026-11-18"]);
  assert.deepEqual(r({ from: "2026-11-10", to: "2026-11-12" }), ["2026-11-10", "2026-11-12", "2026-11-07", "2026-11-09"]);
  // 31 March → previous month clamps to 28 February.
  assert.deepEqual(resolvePeriod({ period: "this_month" }, new Date("2027-03-31T10:00:00Z")).previous, { from: "2027-02-01", to: "2027-02-28" });
  assert.throws(() => resolvePeriod({ from: "2026-11-12", to: "2026-11-10" }, now));
  assert.throws(() => resolvePeriod({ from: "2025-01-01", to: "2026-11-10" }, now));
});

test("GPT API: manager-issued key, tenant-bound, read-only, Tirana days", async (t) => {
  const db = new PGlite();
  const query = (sql, params) => params ? db.query(sql, params) : db.exec(sql).then((r) => r.at(-1) || { rows: [] });
  const pool = { query, connect: async () => ({ query, release() {} }) };
  t.after(() => db.close());
  await migrate(pool);
  const otherSchema = "bluebar_" + randomUUID().replaceAll("-", "");
  await migrateTenant(pool, otherSchema);
  await pool.query("INSERT INTO bluebar_catalog.venues(slug, name, schema_name) VALUES ('other-bar','Other Bar',$1)", [otherSchema]);
  const other = tenantPool(pool, otherSchema);

  await createManager(pool, "manager");
  const { rows: [account] } = await pool.query("SELECT id FROM bluebar.accounts WHERE role='manager'");
  const cookie = sessionCookie(false, await issueSession(pool, account.id), 3600, "bluebar").split(";")[0];

  await pool.query(`
    INSERT INTO bluebar.products(id,name,category,price,stock,min_stock) VALUES
      (1,'Water','Pije',100,5,8), (2,'Coffee','Kafe',100,10,4), (3,'Wine','Pije',1500,0,2);
    INSERT INTO bluebar.waiters(id,name) VALUES(1,'Arben'),(2,'Elira');
    INSERT INTO bluebar.shifts(id,pos_id,opened,opening) VALUES(1,1,'2026-11-22 12:00+00',0);
    INSERT INTO bluebar.invoices(id,table_id,waiter_id,shift_id,total,method,created_at,cash_amount) VALUES
      (1,1,1,1,400,'Cash','2026-11-22 22:59:59+00',400),   -- 22 Nov, 23:59 Tirana
      (2,1,1,1,300,'Cash','2026-11-22 23:00:00+00',300),   -- 23 Nov, 00:00 Tirana
      (3,1,2,1,1600,'Cash','2026-11-23 18:30:00+00',1600); -- 23 Nov, 19:30 Tirana
    INSERT INTO bluebar.invoice_lines(invoice_id,product_id,name,price,qty,comp,line_key) VALUES
      (2,2,'Coffee',100,3,0,'c'), (3,1,'Water',100,1,0,'w'), (3,3,'Wine',1500,1,0,'v');
  `);
  await other.query(`
    INSERT INTO bluebar.waiters(id,name) VALUES(1,'Other');
    INSERT INTO bluebar.shifts(id,pos_id,opened,opening) VALUES(1,1,'2026-11-23 00:00+00',0);
    INSERT INTO bluebar.invoices(id,table_id,waiter_id,shift_id,total,method,created_at,cash_amount)
      VALUES(1,1,1,1,9999,'Cash','2026-11-23 12:00+00',9999);
  `);

  const app = buildApp({ pool, origins: ["http://127.0.0.1:5173"] });
  t.after(() => app.close());
  const ui = (method, url) => app.inject({ method, url, headers: { host: "localhost", origin: "http://127.0.0.1:5173", "x-bluebar-client": "1", cookie } });
  const gpt = (url, key, method = "GET") => app.inject({ method, url, headers: { host: "localhost", ...(key && { authorization: `Bearer ${key}` }) } });

  // No key yet; anonymous calls are refused, the spec is public.
  assert.equal((await ui("GET", "/api/integrations/gpt")).json().active, false);
  assert.equal((await gpt("/api/gpt/sales")).statusCode, 401);
  assert.equal((await gpt("/api/gpt/sales", "bbgpt_" + "x".repeat(43))).statusCode, 401);
  const spec = (await gpt("/api/gpt/openapi.json")).json();
  assert.equal(spec.servers[0].url, "https://localhost");

  // Only a signed-in manager can issue a key.
  assert.equal((await app.inject({ method: "POST", url: "/api/integrations/gpt", headers: { host: "localhost", "x-bluebar-client": "1" } })).statusCode, 401);
  const { key } = (await ui("POST", "/api/integrations/gpt")).json();
  assert.match(key, /^bbgpt_[\w-]{43}$/);
  const stored = (await pool.query("SELECT key_hash FROM bluebar_catalog.gpt_keys")).rows[0].key_hash;
  assert.notEqual(stored, key);

  // Every path in the spec answers with the key.
  for (const path of Object.keys(spec.paths)) assert.equal((await gpt(path, key)).statusCode, 200, path);

  // Day boundaries are Tirana's: 22 Nov has only invoice 1, 23 Nov has 2 and 3 (and not the other business's 9999).
  const d22 = (await gpt("/api/gpt/sales?from=2026-11-22&to=2026-11-22", key)).json();
  assert.equal(d22.salesLek, 400);
  const d23 = (await gpt("/api/gpt/sales?from=2026-11-23&compare=true&rankBy=revenue&top=2", key)).json();
  assert.equal(d23.business, "BlueBar");
  assert.deepEqual([d23.salesLek, d23.invoiceCount, d23.averageInvoiceLek], [1900, 2, 950]);
  assert.deepEqual(d23.topProducts.map((p) => p.name), ["Wine", "Coffee"]);
  assert.deepEqual([d23.previous.from, d23.previous.salesLek], ["2026-11-22", 400]);
  const byQty = (await gpt("/api/gpt/sales?from=2026-11-23", key)).json();
  assert.equal(byQty.topProducts[0].name, "Coffee");

  const hours = (await gpt("/api/gpt/sales/breakdown?from=2026-11-23&by=hour", key)).json().rows;
  assert.deepEqual(hours, [{ bucket: 0, invoiceCount: 1, salesLek: 300 }, { bucket: 19, invoiceCount: 1, salesLek: 1600 }]);
  const months = (await gpt("/api/gpt/sales/breakdown?from=2026-11-01&to=2026-11-30&by=month", key)).json().rows;
  assert.deepEqual(months, [{ bucket: "2026-11", invoiceCount: 3, salesLek: 2300 }]);

  const low = (await gpt("/api/gpt/inventory?status=low", key)).json().items.map((i) => i.name);
  assert.deepEqual(low, ["Water", "Wine"]);
  assert.deepEqual((await gpt("/api/gpt/inventory?status=out", key)).json().items.map((i) => i.name), ["Wine"]);
  assert.deepEqual((await gpt("/api/gpt/inventory?q=coff", key)).json().items.map((i) => i.onHand), [10]);

  const staff = (await gpt("/api/gpt/staff?from=2026-11-23", key)).json().staff;
  assert.deepEqual(staff.map((s) => [s.waiter, s.salesLek]), [["Elira", 1600], ["Arben", 300]]);

  // Validation, read-only, and the browser headers aren't a way around the key.
  assert.equal((await gpt("/api/gpt/sales?from=2026-11-24&to=2026-11-01", key)).statusCode, 400);
  assert.equal((await gpt("/api/gpt/sales?period=forever", key)).statusCode, 400);
  assert.equal((await gpt("/api/gpt/sales/breakdown?by=minute", key)).statusCode, 400);
  assert.equal((await gpt("/api/gpt/sales", key, "POST")).statusCode, 405);
  assert.equal((await ui("GET", "/api/gpt/sales")).statusCode, 401);

  // A new key replaces the old one; deleting revokes it.
  const second = (await ui("POST", "/api/integrations/gpt")).json().key;
  assert.equal((await gpt("/api/gpt/sales", key)).statusCode, 401);
  assert.equal((await gpt("/api/gpt/sales", second)).statusCode, 200);
  assert.ok((await ui("GET", "/api/integrations/gpt")).json().lastUsedAt);
  await ui("DELETE", "/api/integrations/gpt");
  assert.equal((await gpt("/api/gpt/sales", second)).statusCode, 401);
});
