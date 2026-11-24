// Read-only API for a ChatGPT Custom GPT (Actions). It signs in with a per-business API key
// sent as "Authorization: Bearer bbgpt_…": only the key's SHA-256 is stored, in the catalog,
// so the key itself names the business. Nothing here writes business data.
import { createHash, randomBytes } from "node:crypto";
import { AppError } from "./commands.js";
import { salesSummary } from "./reports.js";
import { resolveVenue } from "./tenants.js";

const DAY = 86400000;
const tirana = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Tirane" });
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
const day = (s) => Date.parse(`${s}T00:00:00Z`);
const hash = (key) => createHash("sha256").update(key).digest("base64url");
export const PERIODS = ["today", "yesterday", "this_week", "last_week", "last_7_days", "last_30_days", "this_month", "last_month", "this_year"];

// A named period or from/to → inclusive Tirana calendar dates, plus the period just before
// it to compare with (same days of the previous week, month or year where that makes sense).
export function resolvePeriod({ period, from, to }, now = new Date()) {
  const today = day(tirana.format(now));
  const t = new Date(today), y = t.getUTCFullYear(), m = t.getUTCMonth(), dow = (t.getUTCDay() + 6) % 7;
  const monthBack = (ms, n) => { // same day n months earlier, clamped to that month's end
    const d = new Date(ms);
    return Math.min(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, d.getUTCDate()), Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n + 1, 0));
  };
  let start, end, prev;
  if (from || to) {
    start = day(from ?? to); end = day(to ?? from);
    if (!(start <= end) || end - start > 365 * DAY) throw new AppError("Choose from/to dates (YYYY-MM-DD) up to 366 days apart, with from on or before to.", 400);
    period = "custom";
  } else {
    period ??= "today";
    [start, end] = {
      today: [today, today],
      yesterday: [today - DAY, today - DAY],
      this_week: [today - dow * DAY, today],
      last_week: [today - (dow + 7) * DAY, today - (dow + 1) * DAY],
      last_7_days: [today - 6 * DAY, today],
      last_30_days: [today - 29 * DAY, today],
      this_month: [Date.UTC(y, m, 1), today],
      last_month: [Date.UTC(y, m - 1, 1), Date.UTC(y, m, 0)],
      this_year: [Date.UTC(y, 0, 1), today],
    }[period];
    if (period === "this_week") prev = [start - 7 * DAY, end - 7 * DAY];
    if (period === "this_month") prev = [Date.UTC(y, m - 1, 1), monthBack(today, 1)];
    if (period === "last_month") prev = [Date.UTC(y, m - 2, 1), Date.UTC(y, m - 1, 0)];
    if (period === "this_year") prev = [Date.UTC(y - 1, 0, 1), monthBack(today, 12)];
  }
  const span = end - start + DAY;
  prev ??= [start - span, end - span];
  return { period, from: ymd(start), to: ymd(end), previous: { from: ymd(prev[0]), to: ymd(prev[1]) } };
}

// The business a bearer key belongs to, or a 401. Only well-formed keys reach the database.
export async function gptVenue(pool, authorization) {
  const key = /^Bearer (bbgpt_[\w-]{43})$/.exec(authorization ?? "")?.[1];
  const row = key && (await pool.query(
    "UPDATE bluebar_catalog.gpt_keys SET last_used_at = now() WHERE key_hash = $1 RETURNING venue_slug", [hash(key)],
  )).rows[0];
  if (!row) throw new AppError("Missing or revoked BlueBar API key.", 401);
  return resolveVenue(pool, row.venue_slug);
}

const periodQuery = {
  period: { type: "string", enum: PERIODS, description: "Named period in Europe/Tirane. Default today. Ignored when from/to are given." },
  from: { type: "string", format: "date", description: "First day, YYYY-MM-DD (inclusive)." },
  to: { type: "string", format: "date", description: "Last day, YYYY-MM-DD (inclusive)." },
};
const query = (properties) => ({ querystring: { type: "object", additionalProperties: false, properties } });
export const BUCKETS = { // fixed SQL only; `by` is checked against these keys by the schema
  hour: "extract(hour FROM i.created_at AT TIME ZONE 'Europe/Tirane')::integer",
  weekday: "extract(isodow FROM i.created_at AT TIME ZONE 'Europe/Tirane')::integer",
  day: "(i.created_at AT TIME ZONE 'Europe/Tirane')::date::text",
  month: "to_char(i.created_at AT TIME ZONE 'Europe/Tirane', 'YYYY-MM')",
};
const BOUNDS = `bounds AS (SELECT $1::date::timestamp AT TIME ZONE 'Europe/Tirane' AS starts,
  ($2::date + 1)::timestamp AT TIME ZONE 'Europe/Tirane' AS ends)`;

// ---- Reports shared by the Custom GPT routes below and the MCP tools (mcp-tools.js).
// q: { period | from/to, ... } as validated by the caller. Money is lek, days are Tirana's.
const META = { currency: "ALL", timezone: "Europe/Tirane" };

// Paid invoices by how they were collected. A bill paid partly in cash and partly by card is
// 'Përzier'; its two parts are already in cash_amount and card_amount.
async function paymentSplit(db, { from, to }) {
  const { rows: [r] } = await db.query(`WITH ${BOUNDS}
    SELECT COALESCE(sum(i.cash_amount), 0)::bigint AS cash, COALESCE(sum(i.card_amount), 0)::bigint AS card,
      COALESCE(sum(i.tip_cash + i.tip_card), 0)::bigint AS tips,
      count(*) FILTER (WHERE i.method = 'Cash')::integer AS "cashInvoices",
      count(*) FILTER (WHERE i.method = 'Kartë')::integer AS "cardInvoices",
      count(*) FILTER (WHERE i.method = 'Përzier')::integer AS "mixedInvoices"
    FROM bluebar.invoices i CROSS JOIN bounds b WHERE i.created_at >= b.starts AND i.created_at < b.ends`, [from, to]);
  return { cashLek: Number(r.cash), cardLek: Number(r.card), tipsLek: Number(r.tips),
    cashInvoices: r.cashInvoices, cardInvoices: r.cardInvoices, mixedInvoices: r.mixedInvoices };
}

export async function salesReport(db, q) {
  const range = resolvePeriod(q);
  const opts = { rankBy: q.rankBy ?? "quantity", top: q.top ?? 10 };
  const current = await salesSummary(db, { from: range.from, to: range.to, ...opts });
  const byPayment = await paymentSplit(db, range);
  const previous = q.compare ? await salesSummary(db, { ...range.previous, ...opts, top: 1 }) : undefined;
  return {
    ...META, ...range, rankedBy: opts.rankBy, ...current, byPayment,
    ...(previous && { previous: { ...range.previous, ...previous, topProducts: undefined } }),
  };
}

export async function salesBreakdown(db, q) {
  const range = resolvePeriod(q), by = q.by ?? "hour";
  const { rows } = await db.query(`WITH ${BOUNDS}
    SELECT ${BUCKETS[by]} AS bucket, count(*)::integer AS "invoiceCount", COALESCE(sum(i.total), 0)::bigint AS "salesLek"
    FROM bluebar.invoices i CROSS JOIN bounds b WHERE i.created_at >= b.starts AND i.created_at < b.ends
    GROUP BY 1 ORDER BY 1`, [range.from, range.to]);
  return { ...META, ...range, by, rows: rows.map((r) => ({ bucket: r.bucket, invoiceCount: r.invoiceCount, salesLek: Number(r.salesLek) })) };
}

export async function inventoryReport(db, { status = "all", q, limit = 100 }) {
  const { rows } = await db.query(`
    SELECT p.name, p.category, p.stock AS "onHand", p.min_stock AS "lowThreshold",
      COALESCE((SELECT sum(qty) FROM bluebar.order_lines WHERE product_id = p.id), 0)::integer AS "inOpenOrders"
    FROM bluebar.products p
    WHERE p.track_stock
      AND ($1 = 'all' OR ($1 = 'low' AND p.stock <= p.min_stock) OR ($1 = 'out' AND p.stock = 0))
      AND ($2::text IS NULL OR p.name ILIKE '%' || $2 || '%')
    ORDER BY p.stock - p.min_stock, p.name LIMIT $3`, [status, q ?? null, limit]);
  return {
    status, count: rows.length,
    items: rows.map((r) => ({ ...r, available: Math.max(0, r.onHand - r.inOpenOrders), low: r.onHand <= r.lowThreshold })),
  };
}

export async function staffSales(db, q) {
  const range = resolvePeriod(q);
  const { rows } = await db.query(`WITH ${BOUNDS}
    SELECT w.name AS waiter, count(*)::integer AS "invoiceCount", sum(i.total)::bigint AS "salesLek"
    FROM bluebar.invoices i JOIN bluebar.waiters w ON w.id = i.waiter_id CROSS JOIN bounds b
    WHERE i.created_at >= b.starts AND i.created_at < b.ends
    GROUP BY w.id, w.name ORDER BY "salesLek" DESC`, [range.from, range.to]);
  return {
    ...META, ...range,
    staff: rows.map((r) => ({ ...r, salesLek: Number(r.salesLek), averageInvoiceLek: Math.round(Number(r.salesLek) / r.invoiceCount) })),
  };
}

export function registerGpt(app, { pool, session }) {
  // ---- Key management, from Cilësimet → Integrimet (manager session, normal app headers).
  app.get("/api/integrations/gpt", { preValidation: session("manager") }, async (request) => {
    const row = (await pool.query(
      "SELECT hint, created_at, last_used_at FROM bluebar_catalog.gpt_keys WHERE venue_slug = $1", [request.venue.slug],
    )).rows[0];
    return { active: Boolean(row), hint: row?.hint ?? null, createdAt: row?.created_at ?? null, lastUsedAt: row?.last_used_at ?? null };
  });
  // One key per business: a new one replaces (and so revokes) the old one. Shown once.
  app.post("/api/integrations/gpt", { preValidation: session("manager") }, async (request) => {
    const key = `bbgpt_${randomBytes(32).toString("base64url")}`;
    const hint = `bbgpt_…${key.slice(-4)}`;
    await pool.query(
      `INSERT INTO bluebar_catalog.gpt_keys(venue_slug, key_hash, hint) VALUES($1, $2, $3)
       ON CONFLICT (venue_slug) DO UPDATE SET key_hash = $2, hint = $3, created_at = now(), last_used_at = NULL`,
      [request.venue.slug, hash(key), hint],
    );
    return { key, hint };
  });
  app.delete("/api/integrations/gpt", { preValidation: session("manager") }, async (request) => {
    await pool.query("DELETE FROM bluebar_catalog.gpt_keys WHERE venue_slug = $1", [request.venue.slug]);
    return { ok: true };
  });

  // ---- What the GPT calls. request.venue/request.db come from the bearer key (app.js hook).
  app.get("/api/gpt/openapi.json", async (request) => openapi(`https://${request.headers.host}`));

  const named = (request, body) => ({ business: request.venue.name, ...body });
  app.get("/api/gpt/sales", { schema: query({
    ...periodQuery,
    compare: { type: "boolean", default: false },
    rankBy: { type: "string", enum: ["quantity", "revenue"], default: "quantity" },
    top: { type: "integer", minimum: 1, maximum: 50, default: 10 },
  }) }, async (request) => named(request, await salesReport(request.db, request.query)));
  app.get("/api/gpt/sales/breakdown", { schema: query({
    ...periodQuery,
    by: { type: "string", enum: Object.keys(BUCKETS), default: "hour" },
  }) }, async (request) => named(request, await salesBreakdown(request.db, request.query)));
  app.get("/api/gpt/inventory", { schema: query({
    status: { type: "string", enum: ["low", "out", "all"], default: "all" },
    q: { type: "string", minLength: 1, maxLength: 80 },
    limit: { type: "integer", minimum: 1, maximum: 200, default: 100 },
  }) }, async (request) => named(request, await inventoryReport(request.db, request.query)));
  app.get("/api/gpt/staff", { schema: query(periodQuery) }, async (request) => named(request, await staffSales(request.db, request.query)));
}

// OpenAPI 3.1 for the GPT editor ("Import from URL"). Must stay in step with the routes above;
// gpt.test.js checks every path here answers.
function openapi(server) {
  const p = (name, schema, description) => ({ name, in: "query", required: false, description, schema });
  const periodParams = [
    p("period", { type: "string", enum: PERIODS, default: "today" }, "Named period in Europe/Tirane. Weeks start on Monday. Ignored when from/to are given."),
    p("from", { type: "string", format: "date" }, "First day, YYYY-MM-DD, inclusive. Use with to for a custom range (max 366 days)."),
    p("to", { type: "string", format: "date" }, "Last day, YYYY-MM-DD, inclusive."),
  ];
  const ok = (description) => ({ 200: { description, content: { "application/json": { schema: { type: "object" } } } }, 401: { description: "Missing or revoked API key." } });
  return {
    openapi: "3.1.0",
    info: {
      title: "BlueBar",
      version: "1.0.0",
      description: "Read-only sales, inventory and staff figures for one BlueBar business. Money is in Albanian lek (ALL). Dates are calendar days in Europe/Tirane.",
    },
    servers: [{ url: server }],
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } }, schemas: {} },
    security: [{ bearer: [] }],
    paths: {
      "/api/gpt/sales": { get: {
        operationId: "getSales",
        summary: "Sales totals for a period",
        description: "Paid sales (salesLek), number of invoices, refunds, net sales, average invoice, cash/card split (byPayment) and top products for a period. Set compare=true to also get the previous period (yesterday for today, last week's same days for this_week, and so on). Use rankBy=revenue for best sellers by money, quantity for by units.",
        parameters: [
          ...periodParams,
          p("compare", { type: "boolean", default: false }, "Also return the previous comparable period."),
          p("rankBy", { type: "string", enum: ["quantity", "revenue"], default: "quantity" }, "How to rank topProducts."),
          p("top", { type: "integer", minimum: 1, maximum: 50, default: 10 }, "How many top products to return."),
        ],
        responses: ok("Sales summary."),
      } },
      "/api/gpt/sales/breakdown": { get: {
        operationId: "getSalesBreakdown",
        summary: "Sales split by hour, weekday, day or month",
        description: "Invoice count and sales per bucket. by=hour finds the busiest hours (0-23, Tirana time); weekday is 1=Monday..7=Sunday; day gives daily totals; month gives monthly revenue (use period=this_year or from/to). Buckets with no sales are omitted.",
        parameters: [...periodParams, p("by", { type: "string", enum: Object.keys(BUCKETS), default: "hour" }, "Bucket size.")],
        responses: ok("Sales per bucket."),
      } },
      "/api/gpt/inventory": { get: {
        operationId: "getInventory",
        summary: "Stock levels",
        description: "Tracked products with units on hand, units in open (unpaid) orders, available units, and the low-stock threshold. status=low: at or below threshold; status=out: zero on hand. q searches product names.",
        parameters: [
          p("status", { type: "string", enum: ["low", "out", "all"], default: "all" }, "Which products to return."),
          p("q", { type: "string", maxLength: 80 }, "Part of a product name."),
          p("limit", { type: "integer", minimum: 1, maximum: 200, default: 100 }, "Maximum products."),
        ],
        responses: ok("Inventory items."),
      } },
      "/api/gpt/staff": { get: {
        operationId: "getStaffSales",
        summary: "Sales per waiter",
        description: "Invoice count, paid sales and average invoice per waiter for a period, highest first.",
        parameters: periodParams,
        responses: ok("Sales per waiter."),
      } },
    },
  };
}
