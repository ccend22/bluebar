import Fastify from "fastify";
import { resolveVenue, tenantPool, registerVenue, publicVenue, validateNetworks, spendBudget } from "./tenants.js";
import { installer } from "./installers.js";
import { encode } from "../public/bluebar-print.mjs";
import { AppError } from "./commands.js";
import { readSnapshot, readRevision, bumpRevision, execute, executeOrderPatch, setInvoiceFiscalResult } from "./repository.js";
import { seal, open } from "./secretBox.js";
import { checkBlueBillConnection, fiscalizeInvoice } from "./bluebill.js";
import { shiftReport } from "./shiftReport.js";
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
} from "./auth.js";

const WAITER_COMMANDS = new Set(["order.add", "order.remove", "order.assign", "order.send", "order.pay"]);
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
    const origin = request.headers.origin;
    if (origin && !allowed.has(origin))
      return reply.code(403).send({ error: "Origin i palejuar." });
    // No CORS: cross-site browser requests cannot add this non-simple header.
    if (request.headers["x-bluebar-client"] !== "1")
      return reply.code(403).send({ error: "Kërkesë e palejuar." });
    if (path === "/api/venues/register" || path === "/api/print/pair") return;
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
    const shift = state.shift && { id: state.shift.id, opened: state.shift.opened };
    return {
      ...data,
      state: {
        ...state,
        shift,
        shifts: [],
        movements: [],
        invoices: state.invoices.filter((i) => i.shiftId === shift?.id),
        tables: state.tables.filter((t) => t.active),
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
    if (!invoice || invoice.fiscalStatus === "fiskalizuar") return result;
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
    } catch {
      await setInvoiceFiscalResult(request.db, invoiceId, { status: "dështoi" }).catch(() => {});
      return withInvoice({ fiscalStatus: "dështoi" });
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
    const { venue, accountId } = await registerVenue(pool, request.body, request.ip);
    request.venue = venue;
    request.db = tenantPool(pool, venue.schema_name);
    reply.code(201);
    return start(request, reply, accountId);
  });
  app.get("/api/venue", async request => publicVenue(request.venue));
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
    const [, code, kind] = /^(\d{6})\.(sh|ps1|cmd)$/.exec(request.params.file) || [];
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
      properties: { code: { type: "string", pattern: "^[0-9]{6}$" } } } },
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
                "printer.save",
                "printer.delete",
                "table.save",
                "tables.save",
                "table.toggle",
                "table.delete",
                "table.layout",
                "product.save",
                "category.create",
                "department.create",
                "stock.receive",
                "waiter.create",
                "waiter.toggle",
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
