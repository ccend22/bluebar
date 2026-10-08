import Fastify from "fastify";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { resolveVenue, tenantPool, registerVenue, publicVenue, validateNetworks, spendBudget } from "./tenants.js";
import { installer } from "./installers.js";
import { encode } from "../public/bluebar-print.mjs";
import { AppError } from "./commands.js";
import { readSnapshot, readRevision, bumpRevision, execute, executeOrderPatch, setInvoiceFiscalResult } from "./repository.js";
import { seal, open } from "./secretBox.js";
import { checkBlueBillConnection, fiscalizeInvoice, FISCAL_FAILURE_MESSAGES } from "./bluebill.js";
import { shiftReport } from "./shiftReport.js";
import { report } from "./reports.js";
import { deeplTranslator } from "./translate.js";
import { posOf, resolveExtras, tableShift } from "../src/domain.js";
import {
  agentKeyValid,
  agentStatus,
  createAgentKey,
  createPairing,
  redeemPairing,
  enqueueReprint,
  enqueueTest,
  finishJob,
  pendingJobs,
} from "./printing.js";
import {
  cookieName,
  endSession,
  findSession,
  ipPolicy,
  issueSession,
  loginManager,
  loginWaiter,
  loginWaiterByPin,
  loginWaiterPattern,
  setWaiterPattern,
  readCookie,
  sessionCookie,
  setWaiterPin,
  throttle,
  updateManagerAccount,
} from "./auth.js";

// ticket.*: a station screen may be signed in as any staff member.
// Discounts, comps and refunds are the manager's; moving and handing over are
// everyday service (each command still checks the table is the waiter's own).
const WAITER_COMMANDS = new Set([
  "order.add", "order.remove", "order.assign", "order.send", "order.pay", "order.handover", "order.move",
  "order.edit", "order.note", "order.fire", "order.remake",
  "ticket.done", "ticket.transfer", "ticket.accept",
  "guest.accept", "guest.reject", "guest.seen",
]);
const publicUser = ({ role, waiterId, name }) => ({ role, waiterId, name });
const pin = { type: "string", pattern: "^[0-9]{6}$" };
const pattern = { type: "array", minItems: 4, maxItems: 9, items: { type: "integer", minimum: 1, maximum: 9 } };

const tokenMode = (token) => (token.startsWith("bb_test_") ? "test" : "live");
const tokenHint = (token) => `${token.slice(0, token.indexOf("_", 3) + 1)}…${token.slice(-4)}`;

export function buildApp({
  pool,
  provider = "PostgreSQL",
  origins = [],
  allowedIps = [],
  trustProxy = false,
  secureCookies = false,
  allowedHosts = ["localhost", "127.0.0.1"],
  // Legacy single-business setup; a token a manager saves in Cilësimet takes priority.
  blueBill = {
    token: process.env.BLUEBILL_API_TOKEN,
    venueSlug: process.env.BLUEBILL_VENUE_SLUG,
  },
  secretKey = process.env.BLUEBAR_SECRET_KEY,
  // Albanian → English for the online menu (null: no translation, the menu shows Albanian).
  translate = deeplTranslator(process.env.DEEPL_API_KEY),
}) {
  const app = Fastify({
    logger: false,
    bodyLimit: 16384,
    requestTimeout: 20000,
    trustProxy,
  });
  const allowed = new Set(origins);
  const hosts = new Set(allowedHosts);
  const requestCookie = request => cookieName(secureCookies, request.venue.slug);
  const waiterIpOk = request => {
    const ips = request.venue.use_legacy_network ? allowedIps : request.venue.allowed_ips;
    if (!request.venue.use_legacy_network && !ips.length) return false;
    return ipPolicy(ips)(request.ip);
  };
  const loginBudget = throttle();
  app.addHook("onRequest", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("X-Frame-Options", "DENY");
    const host = request.headers.host?.split(":")[0];
    if (!hosts.has(host))
      return reply.code(403).send({ error: "Host i palejuar." });
    const path = request.url.split("?")[0];
    // Fetched by curl/PowerShell or a download link: carries only its one-time code.
    if (request.method === "GET" && path.startsWith("/api/print/install/")) return;
    // The public online menu: opened by guests' phones and <img> tags, read-only, no
    // session, and each route resolves its own business from the URL.
    if (request.method === "GET" && path.startsWith("/api/menu/")) return;
    const origin = request.headers.origin;
    if (origin && !allowed.has(origin))
      return reply.code(403).send({ error: "Origin i palejuar." });
    // No CORS: cross-site browser requests cannot add this non-simple header.
    if (request.headers["x-bluebar-client"] !== "1")
      return reply.code(403).send({ error: "Kërkesë e palejuar." });
    if (path === "/api/venues/register" || path === "/api/print/pair" || path.startsWith("/api/menu/")) return;
    requireDb();
    request.venue = await resolveVenue(pool, request.headers["x-bluebar-venue"] || "bluebar");
    request.db = tenantPool(pool, request.venue.schema_name);
  });
  const requireDb = () => {
    if (!pool)
      throw new AppError(
        "Mungon DATABASE_URL në .env. Vendosni lidhjen Neon dhe rinisni serverin.",
        503,
      );
  };
  // Runs before body validation so unauthenticated callers learn nothing about the schema.
  const session =
    (...roles) =>
    async (request) => {
      requireDb();
      const token = readCookie(request, requestCookie(request));
      const user = token && (await findSession(request.db, token));
      if (!user) throw new AppError("Sesioni ka skaduar. Hyni përsëri.", 401);
      if (user.role === "waiter" && !waiterIpOk(request))
        throw new AppError("Kamarierët punojnë vetëm nga rrjeti i lokalit.", 403);
      if (roles.length && !roles.includes(user.role))
        throw new AppError("Nuk keni leje për këtë veprim.", 403);
      request.user = user;
      request.sessionToken = token;
    };
  // Managers get PIN status; waiters only see what a shift needs (no history, cash float or stock log).
  const present = async (data, request) => {
    const { user, db } = request;
    if (data.patch) return { ...data, provider };
    const fiscal = await fiscalStatus(request);
    const state = { ...data.state, fiscal: { enabled: fiscal.enabled, mode: fiscal.mode } };
    if (user.role === "manager") {
      const secrets = new Map(
        (
          await db.query(
            `SELECT waiter_id, secret_hash IS NOT NULL AS pin, pattern_hash IS NOT NULL AS pattern
             FROM bluebar.accounts WHERE role = 'waiter'`,
          )
        ).rows.map((r) => [r.waiter_id, r]),
      );
      const waiters = state.waiters.map((w) => ({
        ...w,
        hasPin: Boolean(secrets.get(w.id)?.pin),
        hasPattern: Boolean(secrets.get(w.id)?.pattern),
      }));
      return { ...data, state: { ...state, waiters }, provider };
    }
    // A waiter assigned to one till sees only that till's tables and shift.
    const own = state.waiters.find((w) => w.id === user.waiterId)?.posId;
    const openShifts = state.openShifts
      .filter((x) => !own || x.posId === own)
      .map(({ id, posId, opened }) => ({ id, posId, opened }));
    return {
      ...data,
      state: {
        ...state,
        openShifts,
        shifts: [],
        movements: [],
        refunds: [],
        invoices: state.invoices.filter((i) => openShifts.some((x) => x.id === i.shiftId)),
        tables: state.tables.filter((t) => t.active && (!own || posOf(state, t) === own)),
        guestOrders: (state.guestOrders || []).filter((g) => {
          const t = state.tables.find((x) => x.id === g.table);
          return t && (!own || posOf(state, t) === own);
        }),
        guestAlerts: (state.guestAlerts || []).filter((g) => {
          const t = state.tables.find((x) => x.id === g.table);
          return t && (!own || posOf(state, t) === own);
        }),
        // Station tickets of other tills' tables are none of this waiter's business.
        tickets: own
          ? state.tickets.filter((k) => (k.posId ?? posOf(state, state.tables.find((t) => t.id === k.table) || {})) === own)
          : state.tickets,
      },
      provider,
    };
  };
  // Best-effort enrichment of an already-paid invoice, called from a dedicated endpoint
  // (never chained into order.pay itself) so a slow or unreachable BlueBill delays
  // fiscalization — retryable via the same endpoint — without ever affecting the payment.
  const serverToken = (request) =>
    blueBill.token && blueBill.venueSlug && request.venue.slug === blueBill.venueSlug ? blueBill.token : null;
  const connectionRow = async (request) =>
    (await request.db.query("SELECT * FROM bluebar.bluebill_connection")).rows[0];
  // The token this business fiscalizes with: its own (saved in Cilësimet), else the legacy
  // server one. null when neither is usable — including a saved token that no longer opens.
  const blueBillToken = async (request) => {
    const row = await connectionRow(request);
    if (row) {
      if (!secretKey) return null;
      try {
        return open(secretKey, row.token_cipher, request.venue.schema_name);
      } catch {
        return null;
      }
    }
    return serverToken(request);
  };
  // Safe to show a manager: never the token itself.
  const fiscalStatus = async (request) => {
    const row = await connectionRow(request);
    if (row) {
      const token = await blueBillToken(request);
      return {
        enabled: Boolean(token), source: "venue", mode: row.mode, hint: row.token_hint,
        connectedBy: row.connected_by, connectedAt: row.connected_at.toISOString?.() ?? row.connected_at,
        ...(!token && { problem: "Token-i i ruajtur nuk mund të lexohet më. Vendoseni përsëri." }),
      };
    }
    const legacy = serverToken(request);
    if (legacy) return { enabled: true, source: "server", mode: tokenMode(legacy), hint: tokenHint(legacy) };
    return { enabled: false, source: null, mode: null };
  };
  // methodOverride lets a manager report a different payment method to BlueBill than
  // what's on BlueBar's own record (see buildBlueBillPayload) — it's folded into the
  // idempotency key so switching methods on a retry gets a fresh BlueBill draft instead
  // of replaying the previous attempt's (mismatched) cached one.
  const fiscalizeInvoiceInState = async (request, invoiceId, result, methodOverride) => {
    const token = invoiceId && (await blueBillToken(request));
    if (!token) return result;
    const invoice = result.state.invoices.find((i) => i.id === invoiceId);
    // A fully comped bill sold nothing: there's nothing to report.
    if (!invoice || invoice.fiscalStatus === "fiskalizuar" || invoice.total === 0) return result;
    const withInvoice = (patch) => ({
      ...result,
      state: {
        ...result.state,
        invoices: result.state.invoices.map((i) => (i.id === invoiceId ? { ...i, ...patch } : i)),
      },
    });
    try {
      const key = `bluebar-${request.venue.slug}-${invoiceId}-${methodOverride || invoice.method}`;
      const fiscal = await fiscalizeInvoice(token, invoice, key, blueBill.fetchImpl, methodOverride);
      await setInvoiceFiscalResult(request.db, invoiceId, { status: "fiskalizuar", ...fiscal });
      return withInvoice({
        fiscalStatus: "fiskalizuar", fiscalIic: fiscal.iic, fiscalFic: fiscal.fic,
        fiscalVerificationUrl: fiscal.verificationUrl,
      });
    } catch (e) {
      await setInvoiceFiscalResult(request.db, invoiceId, { status: "dështoi" }).catch(() => {});
      // Not stored: tells the person who asked why, so they know what to do next.
      return { ...withInvoice({ fiscalStatus: "dështoi" }), fiscalError: FISCAL_FAILURE_MESSAGES[e.reason] || FISCAL_FAILURE_MESSAGES.rejected };
    }
  };
  const start = async (request, reply, accountId) => {
    const token = await issueSession(request.db, accountId);
    reply.header("Set-Cookie", sessionCookie(secureCookies, token, 12 * 3600, request.venue.slug));
    return { ...publicUser(await findSession(request.db, token)), venue: publicVenue(request.venue) };
  };
  // Sign-in and registration attempts: a fast in-memory check, then an hourly budget
  // in the database that every serverless instance shares.
  const attempt = async (request) => {
    if (!loginBudget(request.ip) || (await spendBudget(pool, `login:${request.ip}`)) > 300)
      throw new AppError("Shumë përpjekje. Provoni pas pak minutash.", 429);
  };

  app.post("/api/venues/register", {
    schema: { body: { type: "object", additionalProperties: false, required: ["slug", "name", "pin"],
      properties: { slug: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{2,39}$" }, name: { type: "string", minLength: 2, maxLength: 80 }, pin,
        website: { type: "string", maxLength: 200 } } } },
  }, async (request, reply) => {
    requireDb();
    await attempt(request);
    // Honeypot: the form hides this field from people; anything that fills it is a bot.
    if (request.body.website) throw new AppError("Regjistrimi nuk u pranua.", 400);
    const { venue, accountId } = await registerVenue(pool, request.body, request.ip).catch((error) => {
      throw error.code === "23505" ? new AppError("Ky kod biznesi është i zënë. Zgjidhni një tjetër.", 409) : error;
    });
    request.venue = venue;
    request.db = tenantPool(pool, venue.schema_name);
    reply.code(201);
    return start(request, reply, accountId);
  });
  app.get("/api/venue", async request => publicVenue(request.venue));

  // ---- Online menu. Guests see only products the manager left visible, and only
  // their guest-facing fields: never stock, departments or anything about orders.
  const menuBudget = throttle(600, 10 * 60_000);
  const menuVenue = async (request) => {
    requireDb();
    if (!menuBudget(request.ip)) throw new AppError("Shumë kërkesa. Provoni pas pak.", 429);
    const venue = await resolveVenue(pool, request.params.slug);
    if (!venue.menu_enabled) throw new AppError("Menuja nuk është e disponueshme.", 404);
    return { venue, db: tenantPool(pool, venue.schema_name) };
  };
  const photoVersion = (at) => (at ? new Date(at).getTime().toString(36) : null);
  app.get("/api/menu/:slug", async (request, reply) => {
    const { venue, db } = await menuVenue(request);
    const [categories, products, brand] = await Promise.all([
      db.query("SELECT name, name_en FROM bluebar.categories ORDER BY name"),
      db.query(`SELECT id, name, name_en, description, description_en, price, category, available, extras, photo_at
                FROM bluebar.products WHERE menu_visible ORDER BY name`),
      db.query("SELECT tagline, accent, logo_at FROM bluebar.menu_branding WHERE id = 1"),
    ]);
    const b = brand.rows[0] || {};
    // The edge (Vercel) answers most guests for up to a minute; a phone always asks again,
    // so turning the menu off or changing a price never sticks on a guest's phone.
    reply.header("Cache-Control", "public, max-age=0, s-maxage=60");
    return {
      name: venue.name,
      ordering: Boolean(venue.menu_ordering),
      brand: { tagline: b.tagline || "", accent: b.accent || "blue", logo: photoVersion(b.logo_at) },
      categories: categories.rows
        .filter((c) => products.rows.some((p) => p.category === c.name))
        .map((c) => ({ name: c.name, nameEn: c.name_en })),
      products: products.rows.map((p) => ({
        id: p.id, name: p.name, nameEn: p.name_en, description: p.description, descriptionEn: p.description_en,
        price: p.price, category: p.category, available: p.available,
        extras: (p.extras || []).map(({ name, price }) => ({ name, price })),
        photo: photoVersion(p.photo_at),
      })),
    };
  });
  app.get("/api/menu/:slug/photo/:id", async (request, reply) => {
    const { db } = await menuVenue(request);
    const id = Number(request.params.id);
    const photo = Number.isSafeInteger(id) && id > 0 && (await db.query(
      `SELECT f.type, f.data FROM bluebar.product_photos f JOIN bluebar.products p ON p.id = f.product_id
       WHERE f.product_id = $1 AND p.menu_visible`, [id])).rows[0];
    if (!photo) throw new AppError("Fotoja nuk u gjet.", 404);
    // The URL carries the photo's version (?v=), so it can be cached for good.
    reply.header("Cache-Control", "public, max-age=31536000, immutable").type(photo.type);
    return Buffer.from(photo.data);
  });
  app.put("/api/venue/menu", {
    preValidation: session("manager"),
    schema: { body: { type: "object", additionalProperties: false, minProperties: 1,
      properties: { enabled: { type: "boolean" }, ordering: { type: "boolean" } } } },
  }, async (request) => {
    const { enabled = null, ordering = null } = request.body;
    const row = (await pool.query(
      `UPDATE bluebar_catalog.venues SET menu_enabled = COALESCE($1, menu_enabled), menu_ordering = COALESCE($2, menu_ordering)
       WHERE slug = $3 RETURNING menu_enabled, menu_ordering`,
      [enabled, ordering, request.venue.slug],
    )).rows[0];
    return { menuEnabled: row.menu_enabled, menuOrdering: row.menu_ordering };
  });

  // ---- Guests ordering from the menu. Only someone holding a table's QR code can order
  // for it: the code carries a key signed with the business's own secret. Nothing a
  // guest sends is trusted beyond product ids, quantities and chosen extras; every
  // order waits for staff (guest.accept) before it touches the table.
  const menuSecret = async (venue) =>
    venue.menu_secret ||
    (await pool.query(
      "UPDATE bluebar_catalog.venues SET menu_secret = COALESCE(menu_secret, $1) WHERE slug = $2 RETURNING menu_secret",
      [randomBytes(32).toString("base64url"), venue.slug],
    )).rows[0].menu_secret;
  const tableKey = (secret, tableId) => createHmac("sha256", secret).update(`table:${tableId}`).digest("base64url").slice(0, 16);
  const keyOk = async (venue, tableId, key) => {
    const expected = Buffer.from(tableKey(await menuSecret(venue), tableId));
    const given = Buffer.from(typeof key === "string" ? key : "");
    return given.length === expected.length && timingSafeEqual(given, expected);
  };
  const hashToken = (token) => createHash("sha256").update(token).digest("hex");
  // Can this table order right now? (The menu asks before showing the order buttons.)
  const orderingAt = (venue, state, tableId) => {
    const table = state.tables.find((t) => t.id === tableId && t.active);
    if (!venue.menu_ordering || !table) return { open: false, reason: "off", message: "Porositë nga menuja nuk janë aktive." };
    if (!tableShift(state, table)) return { open: false, reason: "closed", message: "Lokali nuk merr porosi tani." };
    return { open: true, table };
  };
  app.get("/api/menu/:slug/table/:table", async (request) => {
    const { venue, db } = await menuVenue(request);
    const tableId = Number(request.params.table);
    if (!Number.isSafeInteger(tableId) || !(await keyOk(venue, tableId, request.query.k)))
      return { table: tableId || null, open: false, reason: "key", message: "Skanoni kodin QR të tavolinës për të porositur." };
    const { open, reason, message } = orderingAt(venue, (await readSnapshot(db)).state, tableId);
    return { table: tableId, open, reason, message };
  });
  app.get("/api/venue/menu/tables", { preValidation: session("manager") }, async (request) => {
    const secret = await menuSecret(request.venue);
    const tables = (await request.db.query("SELECT id FROM bluebar.dining_tables WHERE active ORDER BY id")).rows;
    return { tables: tables.map((t) => ({ id: t.id, key: tableKey(secret, t.id) })) };
  });
  app.post("/api/menu/:slug/orders", {
    schema: {
      body: {
        type: "object", additionalProperties: false, required: ["table", "key", "items"],
        properties: {
          table: { type: "integer", minimum: 1 },
          key: { type: "string", maxLength: 40 },
          note: { type: "string", maxLength: 200 },
          items: {
            type: "array", minItems: 1, maxItems: 30,
            items: {
              type: "object", additionalProperties: false, required: ["productId", "qty"],
              properties: {
                productId: { type: "integer", minimum: 1 },
                qty: { type: "integer", minimum: 1, maximum: 20 },
                extras: { type: "array", maxItems: 10, items: { type: "string", maxLength: 60 } },
                note: { type: "string", maxLength: 120 },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { venue, db } = await menuVenue(request);
    const { table: tableId, key, items, note = "" } = request.body;
    if (!(await keyOk(venue, tableId, key))) throw new AppError("Skanoni kodin QR të tavolinës për të porositur.", 403);
    if ((await spendBudget(pool, `guest-order:${request.ip}`)) > 20)
      throw new AppError("Shumë porosi nga kjo pajisje. Thërrisni kamarierin.", 429);
    const { state } = await readSnapshot(db);
    const { open, message } = orderingAt(venue, state, tableId);
    if (!open) throw new AppError(message, 409);
    // No waiter checks it before the kitchen does, so a table gets a bounded number of orders.
    const recent = (await db.query(
      "SELECT count(*)::int AS n FROM bluebar.guest_orders WHERE table_id = $1 AND created_at > now() - interval '30 minutes'", [tableId],
    )).rows[0].n;
    if (recent >= 6) throw new AppError("Shumë porosi nga kjo tavolinë. Thërrisni kamarierin.", 429);
    if (items.reduce((s, i) => s + i.qty, 0) > 40) throw new AppError("Porosia është shumë e madhe. Thërrisni kamarierin.", 400);
    const clean = items.map((item) => {
      const product = state.products.find((p) => p.id === item.productId && p.menuVisible !== false);
      if (!product) throw new AppError("Një produkt nuk është më në menu. Rifreskoni menunë.", 409);
      if (product.available === false) throw new AppError(`${product.name} ka mbaruar.`, 409);
      let extras;
      try {
        extras = resolveExtras(product, item.extras || []).map((x) => x.name);
      } catch (e) {
        throw new AppError(e.message, 400);
      }
      return { productId: product.id, qty: item.qty, extras, note: (item.note || "").trim() };
    });
    const token = randomBytes(18).toString("base64url");
    const id = (await db.query(
      "INSERT INTO bluebar.guest_orders(table_id, items, note, token_hash) VALUES($1,$2,$3,$4) RETURNING id",
      [tableId, JSON.stringify(clean), note.trim(), hashToken(token)],
    )).rows[0].id;
    // Straight to the table and its stations, as if the table's waiter had entered it. The
    // order is the table waiter's, else a waiter of that till's, else any active one.
    // If it can't go through (stock ran out, no active waiter, a concurrent change three
    // times running), it stays waiting and staff accept it by hand: never lost.
    const table = state.tables.find((t) => t.id === tableId);
    const active = state.waiters.filter((w) => w.active);
    const waiterId = table.waiter ?? (active.find((w) => w.posId === posOf(state, table)) ?? active[0])?.id;
    let status = "pending";
    for (let attempt = 0; waiterId && attempt < 3 && status === "pending"; attempt++) {
      try {
        const { version } = await readSnapshot(db);
        await execute(db, { id: randomUUID(), version, type: "guest.accept", payload: { id, waiterId } }, { role: "system", name: "Menuja online" });
        status = "accepted";
      } catch (e) {
        if (e.statusCode !== 409) break;
      }
    }
    if (status === "pending") await bumpRevision(db);
    reply.code(201);
    return { id, token, status };
  });
  // The guest's phone follows its order: waiting, accepted (on its way) or rejected.
  app.get("/api/menu/:slug/orders/:id", async (request) => {
    const { db } = await menuVenue(request);
    const id = Number(request.params.id);
    const token = String(request.query.token || "");
    const row = Number.isSafeInteger(id) && token && (await db.query(
      "SELECT status, reason FROM bluebar.guest_orders WHERE id = $1 AND token_hash = $2", [id, hashToken(token)],
    )).rows[0];
    if (!row) throw new AppError("Porosia nuk u gjet.", 404);
    return { status: row.status, reason: row.reason };
  });
  // A product's photo, as the browser already shrank it (WebP or JPEG, at most ~400 KB).
  // Checked by its first bytes, not by what the request claims.
  const readPhoto = (dataUrl, { png = false, max = 400000 } = {}) => {
    const m = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/]+=*)$/.exec(dataUrl);
    const data = m && Buffer.from(m[2], "base64");
    const isWebp = data && data.subarray(0, 4).toString("latin1") === "RIFF" && data.subarray(8, 12).toString("latin1") === "WEBP";
    const isJpeg = data && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    const isPng = png && data && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const ok = { "image/webp": isWebp, "image/jpeg": isJpeg, "image/png": isPng };
    if (!data || !ok[m[1]]) throw new AppError(png ? "Logo duhet të jetë PNG, WebP ose JPEG." : "Fotoja nuk është WebP ose JPEG i vlefshëm.", 400);
    if (data.length > max) throw new AppError("Fotoja është shumë e madhe.", 413);
    return { type: m[1], data };
  };
  const productId = (request) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) throw new AppError("Produkti nuk ekziston.", 404);
    return id;
  };
  // A photo change isn't a till command (no version conflict for orders in flight), but it
  // bumps the revision so every open screen picks up the new photo on its next refresh.
  const photoChanged = (db, id, at) =>
    db.query(
      `WITH p AS (UPDATE bluebar.products SET photo_at = ${at} WHERE id = $1 RETURNING id)
       UPDATE bluebar.control SET revision = revision + 1 WHERE id = 1 AND EXISTS (SELECT 1 FROM p) RETURNING 1`,
      [id],
    );
  app.get("/api/products/:id/photo", { preValidation: session("manager") }, async (request) => {
    const photo = (await request.db.query("SELECT type, data FROM bluebar.product_photos WHERE product_id=$1", [productId(request)])).rows[0];
    return { dataUrl: photo ? `data:${photo.type};base64,${Buffer.from(photo.data).toString("base64")}` : null };
  });
  app.put("/api/products/:id/photo", {
    // The one route that carries a picture: the app's 16 KB limit stays everywhere else.
    bodyLimit: 600000,
    preValidation: session("manager"),
    schema: { body: { type: "object", additionalProperties: false, required: ["dataUrl"], properties: { dataUrl: { type: "string", maxLength: 560000 } } } },
  }, async (request) => {
    const id = productId(request);
    const { type, data } = readPhoto(request.body.dataUrl);
    await request.db.query(
      `INSERT INTO bluebar.product_photos(product_id, type, data) VALUES($1,$2,$3)
       ON CONFLICT(product_id) DO UPDATE SET type=$2, data=$3`, [id, type, data],
    ).catch((error) => {
      throw error.code === "23503" ? new AppError("Produkti nuk ekziston.", 404) : error;
    });
    await photoChanged(request.db, id, "now()");
    return { ok: true };
  });
  // The online menu's English, written by the translator whenever a product or category
  // is saved; the manager never types it. Awaited (a serverless function may stop after
  // replying), bounded by the translator's own timeout, and never fails the save.
  const clip = (text, max) => String(text || "").slice(0, max);
  const translateSaved = async (db, type, payload, state) => {
    if (!translate || !state) return;
    try {
      if (type === "product.save") {
        const name = String(payload.name || "").trim().toLowerCase();
        const p = state.products.find((x) => x.name.toLowerCase() === name);
        if (!p) return;
        const [nameEn, descriptionEn] = await translate(p.description ? [p.name, p.description] : [p.name]);
        await db.query("UPDATE bluebar.products SET name_en=$2, description_en=$3 WHERE id=$1", [p.id, clip(nameEn, 80), clip(descriptionEn, 300)]);
      } else {
        const category = String(payload.name || "").trim();
        const [nameEn] = await translate([category]);
        await db.query("UPDATE bluebar.categories SET name_en=$2 WHERE name=$1", [category, clip(nameEn, 40)]);
      }
      await bumpRevision(db);
    } catch {
      // Best effort: the menu keeps the Albanian until the next save or a manual translate.
    }
  };
  // Cilësimet → Menuja online → "Përkthe menunë": everything not yet in English.
  app.post("/api/venue/menu/translate", { preValidation: session("manager") }, async (request) => {
    if (!translate) throw new AppError("Përkthimi automatik nuk është konfiguruar (DEEPL_API_KEY).", 503);
    const products = (await request.db.query("SELECT id, name, description FROM bluebar.products WHERE name_en = '' ORDER BY id LIMIT 200")).rows;
    const categories = (await request.db.query("SELECT name FROM bluebar.categories WHERE name_en = ''")).rows;
    const texts = [...products.flatMap((p) => [p.name, p.description || "-"]), ...categories.map((c) => c.name)];
    if (!texts.length) return { products: 0, categories: 0 };
    let out;
    try {
      out = [];
      for (let i = 0; i < texts.length; i += 50) out.push(...(await translate(texts.slice(i, i + 50))));
    } catch {
      throw new AppError("Shërbimi i përkthimit nuk u përgjigj. Provoni pas pak.", 502);
    }
    for (const [n, p] of products.entries())
      await request.db.query("UPDATE bluebar.products SET name_en=$2, description_en=$3 WHERE id=$1",
        [p.id, clip(out[2 * n], 80), p.description ? clip(out[2 * n + 1], 300) : ""]);
    for (const [n, c] of categories.entries())
      await request.db.query("UPDATE bluebar.categories SET name_en=$2 WHERE name=$1", [c.name, clip(out[2 * products.length + n], 40)]);
    await bumpRevision(request.db);
    return { products: products.length, categories: categories.length };
  });
  // The menu's identity (Cilësimet → Menuja online): welcome line, brand colour, logo.
  const ACCENTS = ["blue", "terracotta", "olive", "plum", "teal", "amber"];
  app.get("/api/venue/menu-brand", { preValidation: session("manager") }, async (request) => {
    const b = (await request.db.query("SELECT tagline, accent, logo_type, logo FROM bluebar.menu_branding WHERE id = 1")).rows[0];
    return { tagline: b.tagline, accent: b.accent, logo: b.logo ? `data:${b.logo_type};base64,${Buffer.from(b.logo).toString("base64")}` : null, translation: Boolean(translate) };
  });
  app.put("/api/venue/menu-brand", {
    preValidation: session("manager"),
    schema: { body: { type: "object", additionalProperties: false, required: ["tagline", "accent"],
      properties: { tagline: { type: "string", maxLength: 90 }, accent: { type: "string", enum: ACCENTS } } } },
  }, async (request) => {
    await request.db.query("UPDATE bluebar.menu_branding SET tagline=$1, accent=$2 WHERE id = 1", [request.body.tagline.trim(), request.body.accent]);
    return { tagline: request.body.tagline.trim(), accent: request.body.accent };
  });
  app.put("/api/venue/menu-logo", {
    bodyLimit: 450000,
    preValidation: session("manager"),
    schema: { body: { type: "object", additionalProperties: false, required: ["dataUrl"], properties: { dataUrl: { type: "string", maxLength: 410000 } } } },
  }, async (request) => {
    const { type, data } = readPhoto(request.body.dataUrl, { png: true, max: 300000 });
    await request.db.query("UPDATE bluebar.menu_branding SET logo_type=$1, logo=$2, logo_at=now() WHERE id = 1", [type, data]);
    return { ok: true };
  });
  app.delete("/api/venue/menu-logo", { preValidation: session("manager") }, async (request) => {
    await request.db.query("UPDATE bluebar.menu_branding SET logo_type=NULL, logo=NULL, logo_at=NULL WHERE id = 1");
    return { ok: true };
  });
  app.get("/api/menu/:slug/logo", async (request, reply) => {
    const { db } = await menuVenue(request);
    const b = (await db.query("SELECT logo_type, logo FROM bluebar.menu_branding WHERE id = 1 AND logo IS NOT NULL")).rows[0];
    if (!b) throw new AppError("Logo nuk u gjet.", 404);
    reply.header("Cache-Control", "public, max-age=31536000, immutable").type(b.logo_type);
    return Buffer.from(b.logo);
  });
  app.delete("/api/products/:id/photo", { preValidation: session("manager") }, async (request) => {
    const id = productId(request);
    await request.db.query("DELETE FROM bluebar.product_photos WHERE product_id=$1", [id]);
    await photoChanged(request.db, id, "NULL");
    return { ok: true };
  });
  app.get("/api/integrations/bluebill/connection", {
    preValidation: session("manager"),
  }, async request => {
    // A BlueBill token is scoped to one business. Never probe it from another tenant.
    const token = await blueBillToken(request);
    if (!token) return { configured: false, connected: false };
    return {
      configured: true,
      ...await checkBlueBillConnection(token, blueBill.fetchImpl),
    };
  });
  app.get("/api/integrations/bluebill", { preValidation: session("manager") }, async (request) => ({
    ...(await fiscalStatus(request)),
    canSave: Boolean(secretKey),
  }));
  app.put("/api/integrations/bluebill", {
    preValidation: session("manager"),
    schema: { body: { type: "object", additionalProperties: false, required: ["token"],
      properties: { token: { type: "string", pattern: "^bb_[a-z]+_[A-Za-z0-9_-]{16,200}$" } } } },
  }, async (request) => {
    if (!secretKey)
      throw new AppError("Serveri nuk ka çelësin e enkriptimit (BLUEBAR_SECRET_KEY). Kontaktoni administratorin.", 503);
    const { token } = request.body;
    // Only a token BlueBill itself accepts gets saved — a typo shows up now, not at the first sale.
    const check = await checkBlueBillConnection(token, blueBill.fetchImpl);
    if (!check.connected)
      throw check.providerStatus == null
        ? new AppError("BlueBill nuk u arrit. Kontrolloni internetin dhe provoni përsëri.", 502)
        : new AppError("BlueBill nuk e pranoi këtë token. Kopjojeni të plotë nga BlueBill dhe provoni përsëri.", 400);
    await request.db.query(
      `INSERT INTO bluebar.bluebill_connection (id, token_cipher, token_hint, mode, connected_by, connected_at)
       VALUES (true, $1, $2, $3, $4, now())
       ON CONFLICT (id) DO UPDATE SET token_cipher = $1, token_hint = $2, mode = $3, connected_by = $4, connected_at = now()`,
      [seal(secretKey, token, request.venue.schema_name), tokenHint(token), tokenMode(token), request.user.name],
    );
    await bumpRevision(request.db);
    return { ...(await fiscalStatus(request)), canSave: true };
  });
  app.delete("/api/integrations/bluebill", { preValidation: session("manager") }, async (request) => {
    await request.db.query("DELETE FROM bluebar.bluebill_connection");
    await bumpRevision(request.db);
    return { ...(await fiscalStatus(request)), canSave: Boolean(secretKey) };
  });
  app.get("/api/venue/network", { preValidation: session("manager") }, async request => ({
    allowedIps: request.venue.use_legacy_network ? allowedIps : request.venue.allowed_ips,
    currentIp: request.ip.replace(/^::ffff:/i, ""),
  }));
  app.put("/api/venue/network", {
    preValidation: session("manager"),
    schema: { body: { type: "object", additionalProperties: false, required: ["allowedIps"],
      properties: { allowedIps: { type: "array", maxItems: 20, items: { type: "string", maxLength: 60 } } } } },
  }, async request => {
    const ips = validateNetworks(request.body.allowedIps);
    await pool.query("UPDATE bluebar_catalog.venues SET allowed_ips=$1, use_legacy_network=false WHERE slug=$2", [ips, request.venue.slug]);
    return { allowedIps: ips, currentIp: request.ip.replace(/^::ffff:/i, "") };
  });
  // --- Network printing: the in-venue agent (public/bluebar-print.mjs) pulls jobs here.
  const printAgent = async (request) => {
    requireDb();
    const key = request.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!(await agentKeyValid(request.db, key)))
      throw new AppError("Çelësi i agjentit të printimit është i pavlefshëm.", 401);
  };
  app.get("/api/print/jobs", { preValidation: printAgent }, async (request, reply) => {
    // "x-bluebar-usb: queue1,queue2": the print computer's local printers, offered in the form.
    const usb = request.headers["x-bluebar-usb"];
    const usbPrinters =
      typeof usb === "string"
        ? usb.split(",").map((q) => q.trim()).filter((q) => /^[A-Za-z0-9_.-]{1,60}$/.test(q)).slice(0, 20)
        : null;
    const jobs = await pendingJobs(request.db, request.venue.name, usbPrinters);
    if (request.query.format !== "lines") return { jobs };
    // For the script agents (bash/PowerShell): "id host port base64(ESC/POS)" per line.
    reply.type("text/plain; charset=utf-8");
    return jobs
      .map((j) => `${j.id} ${j.printer.host} ${j.printer.port} ${encode(j.document, j.printer.width, { ascii: j.printer.ascii, cut: j.printer.cutter }).toString("base64")}`)
      .join("\n");
  });
  // Pairing a venue computer: the manager gets a one-time code; the installer that
  // carries it trades it for the agent key. A new pairing disconnects the old computer.
  app.post("/api/print/pairing", { preValidation: session("manager") }, async (request) =>
    createPairing(pool, request.venue.slug));
  app.get("/api/print/install/:file", async (request, reply) => {
    const [, code, kind] = /^([A-Za-z0-9_-]{32})\.(sh|ps1|cmd)$/.exec(request.params.file) || [];
    if (!code) throw new AppError("Nuk u gjet.", 404);
    const host = request.headers.host;
    const url = `${/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? "http" : "https"}://${host}`;
    if (kind === "cmd")
      reply.type("application/octet-stream").header("Content-Disposition", 'attachment; filename="BlueBar Print.cmd"');
    else reply.type("text/plain; charset=utf-8");
    return installer(kind, url, code);
  });
  app.post("/api/print/pair", {
    schema: { body: { type: "object", additionalProperties: false, required: ["code"],
      properties: { code: { type: "string", pattern: "^[A-Za-z0-9_-]{32}$" } } } },
  }, async (request, reply) => {
    requireDb();
    if ((await spendBudget(pool, `pair:${request.ip}`)) > 20)
      throw new AppError("Shumë përpjekje. Provoni pas një ore.", 429);
    const slug = await redeemPairing(pool, request.body.code);
    if (!slug) throw new AppError("Kodi nuk vlen më. Krijoni një të ri te Cilësimet → Printerët.", 400);
    const venue = await resolveVenue(pool, slug);
    const key = await createAgentKey(tenantPool(pool, venue.schema_name));
    if (request.query.format !== "lines") return { venue: venue.slug, name: venue.name, key };
    reply.type("text/plain; charset=utf-8");
    return [venue.slug, key, venue.name.replace(/\s+/g, " ")].join("\n");
  });
  app.post("/api/print/jobs/:id", {
    preValidation: printAgent,
    schema: {
      params: { type: "object", properties: { id: { type: "string", maxLength: 64 } } },
      body: { type: "object", additionalProperties: false, required: ["ok"],
        properties: { ok: { type: "boolean" }, error: { type: "string", maxLength: 200 } } },
    },
  }, async (request) => {
    await finishJob(request.db, request.params.id, request.body.ok, request.body.error);
    return { ok: true };
  });
  app.get("/api/print/status", { preValidation: session("manager") }, async (request) => agentStatus(request.db));
  // Shown once: only its hash is stored. Creating a new key disconnects the old agent.
  app.post("/api/print/key", { preValidation: session("manager") }, async (request) => ({
    key: await createAgentKey(request.db),
  }));
  app.post("/api/print/test", {
    preValidation: session("manager"),
    schema: { body: { type: "object", additionalProperties: false, required: ["printerId"],
      properties: { printerId: { type: "integer", minimum: 1 } } } },
  }, async (request) => {
    if (!(await enqueueTest(request.db, request.body.printerId))) throw new AppError("Printeri nuk ekziston.", 404);
    return { queued: true };
  });
  app.post("/api/print/reprint", {
    preValidation: session(),
    schema: { body: { type: "object", additionalProperties: false, required: ["kind", "id"],
      properties: { kind: { type: "string", enum: ["ticket", "invoice", "shift"] }, id: { type: "string", maxLength: 64 } } } },
  }, async (request) => {
    // Shift reports hold the cash count: managers only.
    if (request.body.kind === "shift" && request.user.role !== "manager")
      throw new AppError("Nuk keni leje për këtë veprim.", 403);
    return { queued: await enqueueReprint(request.db, request.body.kind, request.body.id) };
  });
  // A Repartet screen checks in for the stations it shows, so the configuration check
  // knows a station without a printer still has a working device.
  app.post("/api/stations/seen", {
    preValidation: session(),
    schema: { body: { type: "object", additionalProperties: false, required: ["stations"],
      properties: { stations: { type: "array", maxItems: 50, items: { type: "integer", minimum: 1 } } } } },
  }, async (request) => {
    await request.db.query("UPDATE bluebar.stations SET device_seen_at = now() WHERE id = ANY($1)", [request.body.stations]);
    return { ok: true };
  });
  // An order's change history: its table's events since the order before it closed
  // (paid or cancelled). For an invoice, the order that ended in its payment.
  const HISTORY = `SELECT e.kind, e.detail, e.actor, e.created_at FROM bluebar.order_events e
    WHERE e.table_id = $1 AND e.kind <> 'ready' AND e.id <= $2 AND e.id > COALESCE((
      SELECT max(x.id) FROM bluebar.order_events x
      WHERE x.table_id = $1 AND x.kind IN ('pay', 'cancel') AND x.id < $2), 0)
    ORDER BY e.id`;
  const history = async (db, tableId, untilId) =>
    (await db.query(HISTORY, [tableId, untilId])).rows.map((e) => ({
      kind: e.kind, detail: e.detail, actor: e.actor, date: e.created_at.toISOString?.() ?? e.created_at,
    }));
  app.get("/api/tables/:id/history", {
    preValidation: session(),
    schema: { params: { type: "object", properties: { id: { type: "integer", minimum: 1 } } } },
  }, async (request) => history(request.db, request.params.id, Number.MAX_SAFE_INTEGER));
  app.get("/api/invoices/:id/history", {
    preValidation: session("manager"),
    schema: { params: { type: "object", properties: { id: { type: "integer", minimum: 1 } } } },
  }, async (request) => {
    const pay = (
      await request.db.query("SELECT id, table_id FROM bluebar.order_events WHERE invoice_id = $1 AND kind = 'pay'", [request.params.id])
    ).rows[0];
    return pay ? history(request.db, pay.table_id, Number(pay.id)) : [];
  });
  app.get("/api/reports", {
    preValidation: session("manager"),
    schema: {
      querystring: {
        type: "object", additionalProperties: false, required: ["from", "to"],
        properties: {
          from: { type: "string", format: "date-time" },
          to: { type: "string", format: "date-time" },
          basis: { type: "string", enum: ["day", "shift"] },
          pos: { type: "integer", minimum: 1 },
          shift: { type: "integer", minimum: 1 },
          area: { type: "string", maxLength: 40 },
          waiter: { type: "integer", minimum: 1 },
        },
      },
    },
  }, async (request) => {
    const q = request.query;
    if (!(new Date(q.from) < new Date(q.to))) throw new AppError("Periudha është e pavlefshme.");
    if (new Date(q.to) - new Date(q.from) > 400 * 86400_000) throw new AppError("Zgjidhni një periudhë deri në një vit.");
    return report(request.db, q);
  });
  app.get("/api/shifts/:id/report", {
    preValidation: session("manager"),
    schema: { params: { type: "object", properties: { id: { type: "integer", minimum: 1 } } } },
  }, async (request) => {
    const report = await shiftReport(request.db, request.params.id);
    if (!report) throw new AppError("Turni nuk ekziston.", 404);
    return report;
  });

  app.put("/api/venue/manager-login", {
    preValidation: session("manager"),
    schema: { body: { type: "object", additionalProperties: false, required: ["managerLogin"],
      properties: { managerLogin: { type: "string", enum: ["pin_only", "name_pin"] } } } },
  }, async (request) => {
    await pool.query("UPDATE bluebar_catalog.venues SET manager_login=$1 WHERE slug=$2", [request.body.managerLogin, request.venue.slug]);
    return { managerLogin: request.body.managerLogin };
  });
  app.put("/api/venue/login-mode", {
    preValidation: session("manager"),
    schema: { body: { type: "object", additionalProperties: false, required: ["loginMode"],
      properties: { loginMode: { type: "string", enum: ["name_pin", "pin_only", "pattern"] } } } },
  }, async request => {
    if (request.body.loginMode === "pattern") {
      const missing = await request.db.query(
        `SELECT count(*)::integer AS count FROM bluebar.waiters w
         LEFT JOIN bluebar.accounts a ON a.waiter_id = w.id AND a.active
         WHERE w.active AND a.pattern_hash IS NULL`,
      );
      if (missing.rows[0].count)
        throw new AppError(`Vendosni pattern për ${missing.rows[0].count} kamarierë aktivë para se të ndryshoni hyrjen.`, 400);
    } else {
      const missing = await request.db.query(
        `SELECT count(*)::integer AS count FROM bluebar.waiters w
         LEFT JOIN bluebar.accounts a ON a.waiter_id = w.id AND a.active
         WHERE w.active AND a.secret_hash IS NULL`,
      );
      if (missing.rows[0].count)
        throw new AppError(`Vendosni PIN për ${missing.rows[0].count} kamarierë aktivë para se të ndryshoni hyrjen.`, 400);
    }
    await pool.query("UPDATE bluebar_catalog.venues SET login_mode=$1 WHERE slug=$2", [request.body.loginMode, request.venue.slug]);
    return { loginMode: request.body.loginMode };
  });

  app.get("/api/health", async () => {
    requireDb();
    await pool.query("SELECT version FROM bluebar.control WHERE id=1");
    return { status: "connected" };
  });
  // Names for the waiter sign-in picker; only served to the venue network.
  app.get("/api/auth/waiters", async (request) => {
    requireDb();
    if (!waiterIpOk(request)) return { allowed: false, waiters: [] };
    const { rows } = await request.db.query(
      `SELECT w.id, w.name, a.secret_hash IS NOT NULL AS "hasPin", a.pattern_hash IS NOT NULL AS "hasPattern"
       FROM bluebar.waiters w JOIN bluebar.accounts a ON a.waiter_id = w.id
       WHERE w.active AND a.active ORDER BY w.name`,
    );
    return { allowed: true, waiters: rows };
  });
  app.post(
    "/api/auth/waiter-login",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["pin"],
          // waiterId is omitted in pin_only login mode — the PIN alone picks the account.
          properties: { waiterId: { type: "integer", minimum: 1 }, pin },
        },
      },
    },
    async (request, reply) => {
      requireDb();
      if (!waiterIpOk(request))
        throw new AppError("Kamarierët hyjnë vetëm nga rrjeti i lokalit.", 403);
      await attempt(request);
      if (request.venue.login_mode === "pattern")
        throw new AppError("Përdorni pattern për të hyrë.", 403);
      const accountId = request.body.waiterId
        ? await loginWaiter(request.db, request.body)
        : await loginWaiterByPin(request.db, request.body.pin);
      return start(request, reply, accountId);
    },
  );
  app.post(
    "/api/auth/manager-login",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["pin"],
          properties: { pin, username: { type: "string", maxLength: 60 } },
        },
      },
    },
    async (request, reply) => {
      requireDb();
      await attempt(request);
      // "Emri + kodi": the name is required and must match. "Vetëm kodi": the PIN alone.
      const byName = request.venue.manager_login === "name_pin";
      const username = request.body.username?.trim();
      if (byName && !username) throw new AppError("Shkruani emrin e menaxherit.", 400);
      return start(request, reply, await loginManager(request.db, { pin: request.body.pin, username: byName ? username : undefined }));
    },
  );
  app.get("/api/auth/session", { preValidation: session() }, async (request) =>
    ({ ...publicUser(request.user), venue: publicVenue(request.venue) }),
  );
  app.post("/api/auth/logout", async (request, reply) => {
    requireDb();
    const token = readCookie(request, requestCookie(request));
    if (token) await endSession(request.db, token);
    reply.header("Set-Cookie", sessionCookie(secureCookies, "", 0, request.venue.slug));
    return { ok: true };
  });
  app.put(
    "/api/accounts/waiters/:id/pin",
    {
      preValidation: session("manager"),
      schema: {
        params: { type: "object", properties: { id: { type: "integer", minimum: 1 } } },
        body: { type: "object", additionalProperties: false, required: ["pin"], properties: { pin } },
      },
    },
    async (request) => {
      await setWaiterPin(request.db, request.params.id, request.body.pin);
      return { ok: true };
    },
  );
  // The signed-in manager's own name and PIN (Cilësimet → Llogaria juaj).
  app.put(
    "/api/accounts/me",
    {
      preValidation: session("manager"),
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["currentPin"],
          properties: { currentPin: { type: "string", maxLength: 6 }, username: { type: "string", maxLength: 40 }, newPin: pin },
        },
      },
    },
    async (request) => {
      await attempt(request);
      const username = request.body.username?.trim().toLowerCase();
      await updateManagerAccount(request.db, request.user.id, { ...request.body, username }, request.sessionToken);
      return publicUser(await findSession(request.db, request.sessionToken));
    },
  );
  app.put(
    "/api/accounts/waiters/:id/pattern",
    {
      preValidation: session("manager"),
      schema: {
        params: { type: "object", properties: { id: { type: "integer", minimum: 1 } } },
        body: { type: "object", additionalProperties: false, required: ["pattern"], properties: { pattern } },
      },
    },
    async (request) => {
      await setWaiterPattern(request.db, request.params.id, request.body.pattern);
      return { ok: true };
    },
  );
  app.post(
    "/api/auth/waiter-pattern",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["waiterId", "pattern"],
          properties: { waiterId: { type: "integer", minimum: 1 }, pattern },
        },
      },
    },
    async (request, reply) => {
      requireDb();
      if (!waiterIpOk(request))
        throw new AppError("Kamarierët hyjnë vetëm nga rrjeti i lokalit.", 403);
      await attempt(request);
      if (request.venue.login_mode !== "pattern")
        throw new AppError("Hyrja me pattern nuk është aktive për këtë lokal.", 403);
      return start(request, reply, await loginWaiterPattern(request.db, request.body));
    },
  );
  app.get("/api/state", {
    preValidation: session(),
    schema: { querystring: { type: "object", properties: { since: { type: "integer", minimum: 0 } } } },
  }, async (request) => {
    const since = request.query.since;
    if (since !== undefined && (await readRevision(request.db)) === since) return { unchanged: true, revision: since };
    return present(await readSnapshot(request.db), request);
  });
  app.post(
    "/api/invoices/:id/fiscalize",
    {
      // Any authenticated session, matching order.pay: a waiter fiscalizes the sale
      // they just closed, a manager retries one later from Faturat.
      preValidation: session(),
      schema: {
        params: { type: "object", properties: { id: { type: "integer", minimum: 1 } } },
        // type includes "null" because a plain POST with no body (the common case —
        // no method override) arrives as an unparsed, bodyless request, not "{}".
        body: {
          type: ["object", "null"],
          additionalProperties: false,
          properties: { method: { type: "string", enum: ["Cash", "Kartë"] } },
        },
      },
    },
    async (request) => {
      if (!(await blueBillToken(request))) throw new AppError("BlueBill nuk është konfiguruar për këtë biznes.", 503);
      const snapshot = await readSnapshot(request.db);
      if (!snapshot.state.invoices.some((i) => i.id === request.params.id))
        throw new AppError("Fatura nuk ekziston.", 404);
      const result = await fiscalizeInvoiceInState(request, request.params.id, snapshot, request.body?.method);
      return present(result, request);
    },
  );
  app.post(
    "/api/commands",
    {
      preValidation: session(),
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["id", "version", "type", "payload"],
          properties: {
            id: { type: "string", format: "uuid" },
            version: { type: "integer", minimum: 0 },
            type: {
              type: "string",
              enum: [
                "order.add",
                "order.remove",
                "order.assign",
                "order.send",
                "order.pay",
                "order.cancel",
                "order.handover",
                "order.move",
                "order.edit",
                "order.note",
                "order.fire",
                "order.remake",
                "order.discount",
                "order.comp",
                "invoice.refund",
                "ticket.done",
                "ticket.transfer",
                "ticket.accept",
                "station.save",
                "station.toggle",
                "station.delete",
                "printer.save",
                "printer.delete",
                "table.save",
                "tables.save",
                "table.toggle",
                "table.delete",
                "table.layout",
                "product.save",
                "category.create",
                "category.translate",
                "guest.accept",
                "guest.reject",
                "guest.seen",
                "department.create",
                "stock.receive",
                "stock.adjust",
                "product.stockRules",
                "waiter.create",
                "waiter.toggle",
                "waiter.pos",
                "pos.save",
                "pos.delete",
                "shift.open",
                "shift.close",
                "shift.cash",
              ],
            },
            payload: { type: "object" },
          },
        },
      },
    },
    async (request) => {
      const { user, body } = request;
      if (user.role === "waiter") {
        const own = ["order.add", "order.assign"].includes(body.type)
          ? body.payload.waiterId === user.waiterId
          : true;
        if (!WAITER_COMMANDS.has(body.type) || !own)
          throw new AppError("Nuk keni leje për këtë veprim.", 403);
      }
      // Fiscalization is a separate request the client fires right after a successful
      // payment (see /api/invoices/:id/fiscalize below) — not chained into order.pay
      // itself. BlueBill's fiscalize call can take several seconds for a real tax-
      // authority round trip; a slow BlueBill must never make a completed payment look
      // like it failed, or race the server's own request timeout.
      const result = ["order.add", "order.remove"].includes(body.type)
        ? await executeOrderPatch(request.db, body, user)
        : await execute(request.db, body, user);
      if (["product.save", "category.create"].includes(body.type)) await translateSaved(request.db, body.type, body.payload, result.state);
      return present(result, request);
    },
  );
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError)
      return reply.code(error.statusCode).send({ error: error.message });
    if (error.validation)
      return reply
        .code(400)
        .send({ error: "Formati i kërkesës është i pavlefshëm." });
    if (error.code === "23505")
      return reply
        .code(409)
        .send({
          error: "Ky regjistrim ekziston. Rifreskoni dhe provoni sërish.",
        });
    if (error.code === "42P01")
      return reply
        .code(503)
        .send({ error: "Skema mungon. Ekzekutoni npm run db:migrate." });
    if (error.statusCode === 413)
      return reply.code(413).send({ error: "Kërkesa është shumë e madhe." });
    // Never include SQL, a DSN, credentials, parameters or provider messages in responses/logs.
    return reply
      .code(503)
      .send({
        error:
          "Lidhja me databazën dështoi. Kontrolloni konfigurimin dhe provoni sërish.",
      });
  });
  return app;
}
