import Fastify from "fastify";
import { AppError } from "./commands.js";
import { readSnapshot, execute } from "./repository.js";
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
  const cookie = cookieName(secureCookies);
  const waiterIpOk = ipPolicy(allowedIps);
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
      const token = readCookie(request, cookie);
      const user = token && (await findSession(pool, token));
      if (!user) throw new AppError("Sesioni ka skaduar. Hyni përsëri.", 401);
      if (user.role === "waiter" && !waiterIpOk(request.ip))
        throw new AppError("Kamarierët punojnë vetëm nga rrjeti i lokalit.", 403);
      if (roles.length && !roles.includes(user.role))
        throw new AppError("Nuk keni leje për këtë veprim.", 403);
      request.user = user;
      request.sessionToken = token;
    };
  // Managers get PIN status; waiters only see what a shift needs (no history, cash float or stock log).
  const present = async (data, user) => {
    const { state } = data;
    if (user.role === "manager") {
      const pins = new Set(
        (await pool.query("SELECT waiter_id FROM bluebar.accounts WHERE role = 'waiter'")).rows.map(
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
  const start = async (reply, accountId) => {
    const token = await issueSession(pool, accountId);
    reply.header("Set-Cookie", sessionCookie(secureCookies, token));
    return publicUser(await findSession(pool, token));
  };
  const attempt = (request) => {
    if (!loginBudget(request.ip))
      throw new AppError("Shumë përpjekje. Provoni pas pak minutash.", 429);
  };

  app.get("/api/health", async () => {
    requireDb();
    await pool.query("SELECT version FROM bluebar.control WHERE id=1");
    return { status: "connected" };
  });
  // Names for the waiter sign-in picker; only served to the venue network.
  app.get("/api/auth/waiters", async (request) => {
    requireDb();
    if (!waiterIpOk(request.ip)) return { allowed: false, waiters: [] };
    const { rows } = await pool.query(
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
      if (!waiterIpOk(request.ip))
        throw new AppError("Kamarierët hyjnë vetëm nga rrjeti i lokalit.", 403);
      attempt(request);
      return start(reply, await loginWaiter(pool, request.body));
    },
  );
  app.post(
    "/api/auth/manager-login",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["username", "pin"],
          properties: {
            username: { type: "string", minLength: 3, maxLength: 32 },
            pin,
          },
        },
      },
    },
    async (request, reply) => {
      requireDb();
      attempt(request);
      return start(reply, await loginManager(pool, request.body));
    },
  );
  app.get("/api/auth/session", { preValidation: session() }, async (request) =>
    publicUser(request.user),
  );
  app.post("/api/auth/logout", async (request, reply) => {
    requireDb();
    const token = readCookie(request, cookie);
    if (token) await endSession(pool, token);
    reply.header("Set-Cookie", sessionCookie(secureCookies, "", 0));
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
      await setWaiterPin(pool, request.params.id, request.body.pin);
      return { ok: true };
    },
  );
  app.get("/api/state", { preValidation: session() }, async (request) =>
    present(await readSnapshot(pool), request.user),
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
      return present(await execute(pool, body, user), user);
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
