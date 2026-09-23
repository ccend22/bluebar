import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { migrate } from "./migrate.js";
import { buildApp } from "./app.js";
import { resolveVenue, tenantPool } from "./tenants.js";
import { readSnapshot } from "./repository.js";

// The same suite can run against an isolated Neon branch. Never uses production.
export async function verifyTenants(pool) {
  const legacyBefore = await readSnapshot(pool);
  const suffix = randomUUID().slice(0, 8);
  const a = `aurora-${suffix}`, b = `riviera-${suffix}`;
  const app = buildApp({ pool });
  const call = (method, url, slug, cookie, payload, ip = "127.0.0.1") => app.inject({
    method, url, payload, remoteAddress: ip,
    headers: { host: "localhost", "x-bluebar-client": "1", "x-bluebar-venue": slug, ...(cookie ? { cookie } : {}) },
  });
  const cookies = {};
  const version = {};
  async function command(slug, type, payload, id = randomUUID()) {
    const state = await call("GET", "/api/state", slug, cookies[slug]);
    assert.equal(state.statusCode, 200, state.body);
    version[slug] = state.json().version;
    const response = await call("POST", "/api/commands", slug, cookies[slug], { id, version: version[slug], type, payload });
    assert.equal(response.statusCode, 200, response.body);
    return response.json();
  }
  try {
    for (const slug of [a, b]) {
      const created = await call("POST", "/api/venues/register", slug, null, { slug, name: slug, pin: "482913" });
      assert.equal(created.statusCode, 201, created.body);
      cookies[slug] = created.headers["set-cookie"].split(";")[0];
      assert.equal(created.json().venue.slug, slug);
      const state = (await call("GET", "/api/state", slug, cookies[slug])).json().state;
      assert.equal(state.shift, null);
      for (const values of Object.values(state).filter(Array.isArray)) assert.equal(values.length, 0);
      assert.equal((await call("GET", "/api/auth/waiters", slug)).json().allowed, false);
    }
    // Slug spoofing and even moving A's token into B's cookie name cannot authorize B.
    assert.equal((await call("GET", "/api/state", b, cookies[a])).statusCode, 401);
    const stolen = cookies[a].replace(`_${a}=`, `_${b}=`);
    assert.equal((await call("GET", "/api/state", b, stolen)).statusCode, 401);
    assert.equal((await call("POST", "/api/commands", b, stolen, { id: randomUUID(), version: 0, type: "shift.open", payload: { opening: 100 } })).statusCode, 401);
    assert.equal((await call("PUT", "/api/venue/network", b, cookies[a], { allowedIps: ["127.0.0.1"] })).statusCode, 401);
    assert.equal((await call("GET", "/api/state", "unknown-business", cookies[a])).statusCode, 404);
    assert.equal((await call("GET", "/api/state", "x';DROP SCHEMA bluebar;--", cookies[a])).statusCode, 400);

    // Same names, IDs, command UUIDs and shift numbers must be independent.
    const sharedCommand = randomUUID();
    for (const slug of [a, b]) {
      await command(slug, "category.create", { name: "Kafe" }, sharedCommand);
      await command(slug, "product.save", { name: "Espresso", category: "Kafe", price: slug === a ? 100 : 200 });
      await command(slug, "stock.receive", { productId: 1, qty: 10 });
      await command(slug, "table.save", { area: "Salla", shape: "Rreth" });
      await command(slug, "waiter.create", { name: "Arben" });
      await command(slug, "shift.open", { opening: 0 });
    }
    await command(a, "table.save", { area: "Tarraca", shape: "Bar" });
    const bad = await call("POST", "/api/commands", b, cookies[b], { id: randomUUID(), version: (await call("GET", "/api/state", b, cookies[b])).json().version, type: "order.add", payload: { tableId: 2, productId: 1, waiterId: 1 } });
    assert.equal(bad.statusCode, 400, "A-only table must not exist in B");
    await command(a, "order.add", { tableId: 1, productId: 1, waiterId: 1 });
    const stateB = (await call("GET", "/api/state", b, cookies[b])).json().state;
    assert.equal(stateB.tables[0].lines.length, 0);
    await command(a, "order.pay", { tableId: 1, method: "Cash", received: 100 });
    await command(a, "shift.close", { counted: 100 });
    const paidA = (await call("GET", "/api/state", a, cookies[a])).json().state;
    assert.equal(paidA.invoices.length, 1);
    assert.equal(paidA.products[0].stock, 9);
    assert.equal(paidA.shift, null);
    const untouchedB = (await call("GET", "/api/state", b, cookies[b])).json().state;
    assert.equal(untouchedB.invoices.length, 0);
    assert.equal(untouchedB.products[0].stock, 10);
    assert.equal(untouchedB.shift.id, 1);

    // IP policy is tenant-specific and applies to already-issued waiter sessions.
    assert.equal((await call("PUT", "/api/accounts/waiters/1/pin", a, cookies[a], { pin: "739105" })).statusCode, 200);
    assert.equal((await call("PUT", "/api/venue/network", a, cookies[a], { allowedIps: ["203.0.113.0/24"] })).statusCode, 200);
    assert.equal((await call("PUT", "/api/venue/network", a, cookies[a], { allowedIps: ["203.0.113.1/33"] })).statusCode, 400);
    const waiter = await call("POST", "/api/auth/waiter-login", a, null, { waiterId: 1, pin: "739105" }, "203.0.113.8");
    assert.equal(waiter.statusCode, 200, waiter.body);
    const waiterCookie = waiter.headers["set-cookie"].split(";")[0];
    assert.equal((await call("GET", "/api/state", a, waiterCookie, undefined, "203.0.113.8")).statusCode, 200);
    assert.equal((await call("PUT", "/api/venue/network", a, waiterCookie, { allowedIps: [] }, "203.0.113.8")).statusCode, 403);
    assert.equal((await call("GET", "/api/auth/waiters", b, null, undefined, "203.0.113.8")).json().allowed, false);
    assert.equal((await call("PUT", "/api/venue/network", a, cookies[a], { allowedIps: [] })).statusCode, 200);
    assert.equal((await call("GET", "/api/state", a, waiterCookie, undefined, "203.0.113.8")).statusCode, 403);
    // Duplicate provisioning is atomic and cannot replace an existing business.
    assert.equal((await call("POST", "/api/venues/register", a, null, { slug: a, name: "Overwrite", pin: "739105" })).statusCode, 409);
    const aPool = tenantPool(pool, (await resolveVenue(pool, a)).schema_name);
    assert.equal((await readSnapshot(aPool)).state.invoices.length, 1);
    await migrate(pool);
    assert.equal((await readSnapshot(aPool)).state.invoices.length, 1);
    assert.deepEqual(await readSnapshot(pool), legacyBefore, "existing business data must be unchanged");
    const loginAgain = await call("POST", "/api/auth/manager-login", a, null, { pin: "482913" });
    assert.equal(loginAgain.statusCode, 200);
    assert.equal((await call("GET", "/api/state", a, loginAgain.headers["set-cookie"].split(";")[0])).json().state.invoices.length, 1);
    // Bad PIN attempts in A must never lock B, even when both chose the same PIN.
    for (let attempt = 0; attempt < 5; attempt++)
      assert.equal((await call("POST", "/api/auth/manager-login", a, null, { pin: "111119" })).statusCode, 401);
    assert.equal((await call("POST", "/api/auth/manager-login", b, null, { pin: "482913" })).statusCode, 200);
    await call("POST", "/api/auth/logout", b, cookies[b]);
    assert.equal((await call("GET", "/api/state", b, cookies[b])).statusCode, 401);
    assert.equal((await call("GET", "/api/state", a, cookies[a])).statusCode, 200);
    return { isolation: true, freshBusiness: true, invoicesAndStock: true, networkIsolation: true, legacyPreserved: true, businesses: [a, b] };
  } finally { await app.close(); }
}

