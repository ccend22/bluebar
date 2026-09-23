import Fastify from "fastify";
import { resolveVenue, tenantPool, registerVenue, publicVenue, validateNetworks } from "./tenants.js";
import { AppError } from "./commands.js";
import { readSnapshot, execute, executeOrderPatch } from "./repository.js";
import {
  cookieName,
  endSession,
  findSession,
  ipPolicy,
  issueSession,
  loginManager,
  loginWaiter,
  readCookie,
  sessionCookie,
  setWaiterPin,
  throttle,
} from "./auth.js";

const WAITER_COMMANDS = new Set(["order.add", "order.remove", "order.assign", "order.pay"]);
const publicUser = ({ role, waiterId, name }) => ({ role, waiterId, name });
const pin = { type: "string", pattern: "^[0-9]{6}$" };

export function buildApp({
  pool,
  provider = "PostgreSQL",
  origins = [],
  allowedIps = [],
  trustProxy = false,
  secureCookies = false,
  allowedHosts = ["localhost", "127.0.0.1"],
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
    const host = request.headers.host?.split(":")[0];
    if (!hosts.has(host))
      return reply.code(403).send({ error: "Host i palejuar." });
    const origin = request.headers.origin;
    if (origin && !allowed.has(origin))
      return reply.code(403).send({ error: "Origin i palejuar." });
    // No CORS: cross-site browser requests cannot add this non-simple header.
    if (request.headers["x-bluebar-client"] !== "1")
      return reply.code(403).send({ error: "Kërkesë e palejuar." });
    if (request.url.split("?")[0] === "/api/venues/register") return;
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
  const present = async (data, user, db) => {
    if (data.patch) return { ...data, provider };
    const { state } = data;
    if (user.role === "manager") {
      const pins = new Set(
        (await db.query("SELECT waiter_id FROM bluebar.accounts WHERE role = 'waiter'")).rows.map(
          (r) => r.waiter_id,
        ),
      );
      const waiters = state.waiters.map((w) => ({ ...w, hasPin: pins.has(w.id) }));
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
  const start = async (request, reply, accountId) => {
    const token = await issueSession(request.db, accountId);
    reply.header("Set-Cookie", sessionCookie(secureCookies, token, 12 * 3600, request.venue.slug));
    return { ...publicUser(await findSession(request.db, token)), venue: publicVenue(request.venue) };
  };
  const attempt = (request) => {
    if (!loginBudget(request.ip))
      throw new AppError("Shumë përpjekje. Provoni pas pak minutash.", 429);
  };

  app.post("/api/venues/register", {
    schema: { body: { type: "object", additionalProperties: false, required: ["slug", "name", "pin"],
      properties: { slug: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{2,39}$" }, name: { type: "string", minLength: 2, maxLength: 80 }, pin } } },
  }, async (request, reply) => {
    requireDb();
    attempt(request);
    const { venue, accountId } = await registerVenue(pool, request.body, request.ip);
    request.venue = venue;
    request.db = tenantPool(pool, venue.schema_name);
    reply.code(201);
    return start(request, reply, accountId);
  });
  app.get("/api/venue", async request => publicVenue(request.venue));
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
      `SELECT w.id, w.name FROM bluebar.waiters w JOIN bluebar.accounts a ON a.waiter_id = w.id
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
          required: ["waiterId", "pin"],
          properties: { waiterId: { type: "integer", minimum: 1 }, pin },
        },
      },
    },
    async (request, reply) => {
      requireDb();
      if (!waiterIpOk(request))
        throw new AppError("Kamarierët hyjnë vetëm nga rrjeti i lokalit.", 403);
      attempt(request);
      return start(request, reply, await loginWaiter(request.db, request.body));
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
          properties: { pin },
        },
      },
    },
    async (request, reply) => {
      requireDb();
      attempt(request);
      return start(request, reply, await loginManager(request.db, request.body));
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
  app.get("/api/state", { preValidation: session() }, async (request) =>
    present(await readSnapshot(request.db), request.user, request.db),
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
                "order.pay",
                "order.cancel",
                "table.save",
                "table.toggle",
                "table.layout",
                "product.save",
                "category.create",
                "stock.receive",
                "waiter.create",
                "waiter.toggle",
                "shift.open",
                "shift.close",
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
      const result = ["order.add", "order.remove"].includes(body.type)
        ? await executeOrderPatch(request.db, body)
        : await execute(request.db, body, user);
      return present(result, user, request.db);
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
