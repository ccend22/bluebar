import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { PGlite } from "@electric-sql/pglite";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createMcpHttp } from "./mcp-http.js";
import { migrate, migrateTenant } from "./migrate.js";
import { createManager, issueSession, sessionCookie } from "./auth.js";
import { tenantPool } from "./tenants.js";

const today = "2026-11-23";
const callback = "https://chatgpt.com/connector_platform_oauth_redirect";
const formHeaders = { "Content-Type": "application/x-www-form-urlencoded" };
const salesScopes = "bluebar.read bluebar.sales.read";

test("remote MCP authorization is single-use, tenant-bound, scoped and revocable", async (t) => {
  const db = new PGlite();
  const query = (sql, params) => params ? db.query(sql, params) : db.exec(sql).then((results) => results.at(-1) || { rows: [] });
  const pool = { query, connect: async () => ({ query, release() {} }) };
  t.after(() => db.close());
  await migrate(pool);

  const otherSchema = "bluebar_" + randomUUID().replaceAll("-", "");
  await migrateTenant(pool, otherSchema);
  await pool.query("INSERT INTO bluebar_catalog.venues(slug, name, schema_name) VALUES ('other-bar','Other Bar',$1)", [otherSchema]);
  const other = tenantPool(pool, otherSchema);

  await createManager(pool, "manager");
  await createManager(other, "manager");
  const signIn = async (venueDb, slug) => {
    const { rows: [account] } = await venueDb.query("SELECT id FROM bluebar.accounts WHERE role='manager'");
    const token = await issueSession(venueDb, account.id);
    return sessionCookie(false, token, 3600, slug).split(";")[0];
  };
  const cookie = await signIn(pool, "bluebar");
  const otherCookie = await signIn(other, "other-bar");
  await pool.query(`
    UPDATE bluebar.dining_tables SET label='BlueBar corner' WHERE id=1;
    INSERT INTO bluebar.products(id,name,category,price,stock,min_stock) VALUES
      (1,'BlueBar water','Pije',100,5,8), (2,'BlueBar coffee','Kafe',100,10,4);
    INSERT INTO bluebar.order_lines(table_id,product_id,name,price,qty,line_key)
      VALUES(1,1,'BlueBar water',100,2,'mcp-test-line');
    INSERT INTO bluebar.reservations(id,name,phone,guests,table_id,day,start_time,end_time)
      VALUES('00000000-0000-4000-8000-000000000001','Private Guest','0691234567',3,1,'2026-11-23','19:00','20:00');
    INSERT INTO bluebar.waiters(id,name) VALUES(1,'Private Cashier');
    INSERT INTO bluebar.shifts(id,pos_id,opened,opening) VALUES(1,1,'2026-11-22 12:00+00',0);
    INSERT INTO bluebar.invoices(id,table_id,waiter_id,shift_id,total,method,created_at,cash_amount,tip_cash) VALUES
      (1,1,1,1,400,'Cash','2026-11-22 22:59:59+00',400,0),
      (2,1,1,1,180,'Cash','2026-11-22 23:00:00+00',180,50),
      (3,1,1,1,100,'Cash','2026-11-23 22:59:59+00',100,0),
      (4,1,1,1,500,'Cash','2026-11-23 23:00:00+00',500,0);
    INSERT INTO bluebar.invoice_lines(invoice_id,product_id,name,price,qty,comp,line_key) VALUES
      (2,1,'BlueBar water',100,3,1,'water'), (3,2,'BlueBar coffee',100,1,0,'coffee');
    INSERT INTO bluebar.refunds(id,invoice_id,shift_id,method,amount,reason,created_at)
      VALUES('mcp-test-refund',1,1,'Cash',30,'Private refund reason','2026-11-23 12:00+00');
  `);
  await other.query(`
    UPDATE bluebar.dining_tables SET label='Private other table' WHERE id=1;
    INSERT INTO bluebar.waiters(id,name) VALUES(1,'Private Other Cashier');
    INSERT INTO bluebar.shifts(id,pos_id,opened,opening) VALUES(1,1,'2026-11-23 00:00+00',0);
    INSERT INTO bluebar.invoices(id,table_id,waiter_id,shift_id,total,method,created_at,cash_amount)
      VALUES(1,1,1,1,9999,'Cash','2026-11-23 12:00+00',9999);
  `);

  let app;
  const listener = createServer((req, res) => app(req, res)).listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => listener.close(resolve)));
  await once(listener, "listening");
  const origin = `http://127.0.0.1:${listener.address().port}`;
  app = createMcpHttp({ pool, origin, signingKey: randomBytes(32).toString("base64url"), secureCookies: false });

  const resource = origin + "/mcp";
  const get = (path, options) => fetch(origin + path, { redirect: "manual", ...options });
  const postForm = (path, body, headers) => get(path, {
    method: "POST", headers: { ...formHeaders, ...headers }, body: new URLSearchParams(body),
  });
  const unauthenticated = await get("/mcp");
  assert.equal(unauthenticated.status, 401);
  assert.match(unauthenticated.headers.get("www-authenticate"), /resource_metadata="[^"]+\/mcp"/);
  const metadata = await get("/.well-known/oauth-protected-resource/mcp").then((r) => r.json());
  assert.equal(metadata.resource, resource);
  assert.deepEqual(metadata.scopes_supported, salesScopes.split(" "));
  const discovery = await get("/.well-known/oauth-authorization-server").then((r) => r.json());
  assert.equal(discovery.issuer, origin + "/");
  assert.equal((await get("/.well-known/openid-configuration")).status, 404);
  assert.deepEqual(discovery.code_challenge_methods_supported, ["S256"]);
  assert.equal(discovery.authorization_response_iss_parameter_supported, true);

  const register = (redirect, method = "client_secret_post") => get("/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirect_uris: [redirect], token_endpoint_auth_method: method }),
  });
  assert.equal((await register("https://example.com/callback")).status, 400);
  const claude = await register("https://claude.ai/api/mcp/auth_callback", "none");
  assert.equal(claude.status, 201);
  assert.equal((await claude.json()).client_secret, undefined);
  const registered = await register(callback);
  assert.equal(registered.status, 201);
  const { client_id, client_secret } = await registered.json();
  assert.ok(client_secret);
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authorize = new URLSearchParams({
    client_id, redirect_uri: callback, response_type: "code", state: "state-test",
    scope: "bluebar.read", resource, code_challenge_method: "S256", code_challenge: challenge,
  });
  const wrongScope = new URLSearchParams(authorize);
  wrongScope.set("scope", "bluebar.write");
  const refused = await get("/authorize?" + wrongScope);
  const errorRedirect = new URL(refused.headers.get("location"));
  assert.equal(errorRedirect.searchParams.get("error"), "invalid_scope");
  assert.equal(errorRedirect.searchParams.get("iss"), discovery.issuer);

  const approval = await get("/authorize?" + authorize);
  assert.equal(approval.status, 200);
  const approvalPage = await approval.text();
  assert.doesNotMatch(approvalPage, /raportin e shitjeve/);
  const ticket = approvalPage.match(/name="ticket" value="([^"]+)"/)[1];
  const decision = { ticket, business: "bluebar", decision: "allow" };
  const submit = (body, headers) => postForm("/oauth/bluebar/consent", { ...decision, ...body }, headers);
  assert.equal((await submit({}, { Origin: "https://example.com", Cookie: cookie })).status, 403);
  assert.equal((await submit({}, { Origin: origin })).status, 401);
  // A session for another tenant cannot approve the selected business.
  assert.equal((await submit({}, { Origin: origin, Cookie: otherCookie })).status, 401);
  assert.equal((await submit({ ticket: ticket + "!" }, { Origin: origin, Cookie: cookie })).status, 400);
  const consent = await submit({}, { Origin: origin, Cookie: cookie });
  assert.equal(consent.status, 200);
  assert.equal(consent.headers.get("location"), null);
  assert.equal(consent.headers.get("referrer-policy"), "no-referrer");
  const completionPage = await consent.text();
  assert.match(completionPage, /Vazhdo te ChatGPT/);
  const returned = new URL(completionPage.match(/class="return-link" href="([^"]+)"/)[1].replaceAll("&amp;", "&"));
  assert.equal(returned.origin + returned.pathname, callback);
  assert.equal(returned.searchParams.get("state"), "state-test");
  assert.equal(returned.searchParams.get("iss"), discovery.issuer);
  assert.equal((await submit({}, { Origin: origin, Cookie: cookie })).status, 400);

  const exchange = (body) => postForm("/token", {
    grant_type: "authorization_code", code: returned.searchParams.get("code"), client_id,
    client_secret, redirect_uri: callback, code_verifier: verifier, resource, ...body,
  });
  assert.equal((await exchange({ code_verifier: randomBytes(32).toString("base64url") })).status, 400);
  assert.equal((await exchange({ resource: origin + "/elsewhere" })).status, 400);
  const token = await exchange({});
  assert.equal(token.status, 200);
  const original = await token.json();
  assert.equal(original.scope, "bluebar.read");
  assert.equal((await exchange({})).status, 400, "authorization code cannot be replayed");

  const client = new Client({ name: "bluebar-test", version: "1" });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(resource), {
    requestInit: { headers: { Authorization: `Bearer ${original.access_token}`, "X-BlueBar-Venue": "other-bar" } },
  }));
  const tools = (await client.listTools()).tools;
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ["get_sales_summary", "list_inventory", "list_reservations", "list_tables"]);
  assert.ok(tools.every((tool) => tool.annotations.readOnlyHint && tool.annotations.destructiveHint === false));
  const lockedSales = await client.callTool({ name: "get_sales_summary", arguments: { from: today } });
  assert.equal(lockedSales.isError, true);
  assert.equal(lockedSales.structuredContent, undefined);
  assert.match(lockedSales._meta["mcp/www_authenticate"][0], /scope="bluebar.read bluebar.sales.read".*insufficient_scope/);
  const tables = (await client.callTool({ name: "list_tables", arguments: { limit: 1 } })).structuredContent;
  assert.equal(tables.venue, "bluebar");
  assert.equal(tables.items[0].label, "BlueBar corner");
  assert.equal(tables.items[0].status, "occupied");
  assert.equal(tables.nextOffset, 1);
  assert.ok((await client.callTool({ name: "list_tables", arguments: { venue: "other-bar" } })).isError);
  const inventory = (await client.callTool({ name: "list_inventory", arguments: { lowOnly: true } })).structuredContent;
  assert.deepEqual(inventory.items, [
    { id: 1, name: "BlueBar water", category: "Pije", onHand: 5, lowThreshold: 8, low: true, reserved: 2, available: 3 },
  ]);
  const reservations = await client.callTool({ name: "list_reservations", arguments: { date: today } });
  assert.deepEqual(reservations.structuredContent.items, [{ date: today, start: "19:00", end: "20:00", guests: 3, tableId: 1 }]);
  assert.doesNotMatch(JSON.stringify(reservations), /Private Guest|0691234567/);
  assert.ok((await client.callTool({ name: "list_reservations", arguments: { date: "2026-02-30" } })).isError);

  const refresh = (refresh_token, scope) => postForm("/token", {
    grant_type: "refresh_token", refresh_token, client_id, client_secret, resource, ...(scope && { scope }),
  });
  assert.equal((await refresh(original.refresh_token, salesScopes)).status, 400, "refresh does not add sales permission");
  const rotated = await refresh(original.refresh_token);
  assert.equal(rotated.status, 200);
  const refreshed = await rotated.json();
  assert.equal((await refresh(original.refresh_token)).status, 400, "refresh token rotation invalidates the old token");
  assert.equal((await get("/mcp", { headers: { Authorization: `Bearer ${original.access_token}` } })).status, 401);
  await pool.query("UPDATE bluebar.accounts SET active=false WHERE role='manager'");
  assert.equal((await get("/mcp", { headers: { Authorization: `Bearer ${refreshed.access_token}` } })).status, 401);
  await pool.query("UPDATE bluebar.accounts SET active=true WHERE role='manager'");
  const links = await get("/oauth/bluebar/connections?business=bluebar", { headers: { Cookie: cookie } });
  assert.equal(links.status, 200);
  const id = (await links.text()).match(/name="id" value="([^"]+)"/)[1];
  assert.equal((await postForm("/oauth/bluebar/connections", { business: "bluebar", id }, { Origin: origin, Cookie: otherCookie })).status, 403);
  assert.equal((await postForm("/oauth/bluebar/connections", { business: "bluebar", id }, { Origin: origin, Cookie: cookie })).status, 303);
  assert.equal((await get("/mcp", { headers: { Authorization: `Bearer ${refreshed.access_token}` } })).status, 401);
  assert.equal((await refresh(refreshed.refresh_token)).status, 400);

  authorize.set("scope", salesScopes);
  const salesApproval = await get("/authorize?" + authorize);
  assert.equal(salesApproval.status, 200);
  const salesApprovalPage = await salesApproval.text();
  assert.match(salesApprovalPage, /raportin e shitjeve/);
  const salesTicket = salesApprovalPage.match(/name="ticket" value="([^"]+)"/)[1];
  const salesConsent = await submit({ ticket: salesTicket }, { Origin: origin, Cookie: cookie });
  assert.equal(salesConsent.status, 200);
  const salesReturn = new URL((await salesConsent.text()).match(/class="return-link" href="([^"]+)"/)[1].replaceAll("&amp;", "&"));
  const salesToken = await exchange({ code: salesReturn.searchParams.get("code") });
  assert.equal(salesToken.status, 200);
  const salesGrant = await salesToken.json();
  assert.equal(salesGrant.scope, salesScopes);

  const salesClient = new Client({ name: "bluebar-sales-test", version: "1" });
  t.after(() => salesClient.close());
  await salesClient.connect(new StreamableHTTPClientTransport(new URL(resource), {
    requestInit: { headers: { Authorization: `Bearer ${salesGrant.access_token}`, "X-BlueBar-Venue": "other-bar" } },
  }));
  const sales = await salesClient.callTool({ name: "get_sales_summary", arguments: { from: today } });
  assert.deepEqual(sales.structuredContent, {
    venue: "bluebar", from: today, to: today, currency: "ALL",
    invoiceCount: 2, salesLek: 280, refundsLek: 30, netSalesLek: 250, averageInvoiceLek: 140,
    topProducts: [
      { name: "BlueBar water", quantity: 2, lineTotalLek: 200 },
      { name: "BlueBar coffee", quantity: 1, lineTotalLek: 100 },
    ],
  });
  assert.doesNotMatch(JSON.stringify(sales), /Private|9999/);
  const empty = await salesClient.callTool({ name: "get_sales_summary", arguments: { to: "2026-11-21" } });
  assert.equal(empty.structuredContent.salesLek, 0);
  assert.equal(empty.structuredContent.averageInvoiceLek, null);
  assert.deepEqual(empty.structuredContent.topProducts, []);
  assert.ok((await salesClient.callTool({ name: "get_sales_summary", arguments: { from: today, to: "2026-11-22" } })).isError);
  assert.ok((await salesClient.callTool({ name: "get_sales_summary", arguments: { from: today, to: "2027-11-24" } })).isError);
  const salesRefresh = await refresh(salesGrant.refresh_token);
  assert.equal(salesRefresh.status, 200);
  assert.equal((await salesRefresh.json()).scope, salesScopes);
});
