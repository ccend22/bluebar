import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { shiftReport } from "./shiftReport.js";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
// The API runs in UTC; slips are read by staff in Tirana.
const stamp = (value) =>
  new Intl.DateTimeFormat("sq-AL", {
    timeZone: "Europe/Tirane",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
const lek = (n) => new Intl.NumberFormat("sq-AL", { maximumFractionDigits: 0 }).format(n) + " Lek";
const pad = (n) => String(n).padStart(2, "0");
// Pending jobs older than this are never printed: a lunch backlog must not come out at dinner.
const MAX_AGE = "20 minutes";
// How long a "Konfirmo dhe fiskalizo" invoice waits for its NIVF/NSLF before printing anyway.
const FISCAL_WAIT_MS = 30000;

export async function createAgentKey(db) {
  const key = randomBytes(24).toString("base64url");
  await db.query(
    `INSERT INTO bluebar.print_agent(id, token_hash) VALUES(1, $1)
     ON CONFLICT(id) DO UPDATE SET token_hash = $1, created_at = now(), last_seen = NULL`,
    [sha256(key)],
  );
  return key;
}
// A 6-digit code, valid 10 minutes and once, that a venue computer trades for the agent
// key. Creating one drops the venue's previous unused code.
export async function createPairing(pool, slug) {
  await pool.query("DELETE FROM bluebar_catalog.print_pairings WHERE venue_slug = $1 OR expires_at < now()", [slug]);
  for (;;) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const row = (
      await pool.query(
        `INSERT INTO bluebar_catalog.print_pairings(code_hash, venue_slug, expires_at)
         VALUES ($1, $2, now() + interval '10 minutes') ON CONFLICT DO NOTHING RETURNING expires_at`,
        [sha256(code), slug],
      )
    ).rows[0];
    if (row) return { code, expiresAt: new Date(row.expires_at).toISOString() };
  }
}
// The venue slug the code belongs to, or null. Using a code consumes it.
export async function redeemPairing(pool, code) {
  const row = (
    await pool.query(
      "DELETE FROM bluebar_catalog.print_pairings WHERE code_hash = $1 AND expires_at > now() RETURNING venue_slug",
      [sha256(String(code))],
    )
  ).rows[0];
  return row?.venue_slug ?? null;
}
export async function agentKeyValid(db, key) {
  if (typeof key !== "string" || key.length < 20) return false;
  const row = (await db.query("SELECT token_hash FROM bluebar.print_agent WHERE id = 1")).rows[0];
  if (!row) return false;
  const a = Buffer.from(sha256(key));
  const b = Buffer.from(row.token_hash);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function agentStatus(db) {
  const row = (await db.query("SELECT last_seen, usb_printers FROM bluebar.print_agent WHERE id = 1")).rows[0];
  const pending = (
    await db.query(
      `SELECT count(*)::integer AS n FROM bluebar.print_jobs
       WHERE printed_at IS NULL AND created_at > now() - interval '${MAX_AGE}'`,
    )
  ).rows[0].n;
  return {
    configured: Boolean(row),
    lastSeen: row?.last_seen ? new Date(row.last_seen).toISOString() : null,
    usbPrinters: row?.usb_printers ?? [],
    pending,
  };
}

const enqueue = (db, printerId, kind, ref) =>
  db.query("INSERT INTO bluebar.print_jobs(id, printer_id, kind, ref) VALUES($1, $2, $3, $4)", [
    randomUUID(),
    printerId,
    kind,
    String(ref),
  ]);
export async function enqueueTest(db, printerId) {
  const found = (await db.query("SELECT id FROM bluebar.printers WHERE id = $1", [printerId])).rows[0];
  if (found) await enqueue(db, found.id, "test", found.id);
  return Boolean(found);
}
// Reprint through the network printer when one covers this document; false tells the
// client to fall back to the browser's print dialog.
export async function enqueueReprint(db, kind, ref) {
  let printer;
  if (kind === "invoice" || kind === "shift") {
    printer = (await db.query("SELECT id FROM bluebar.printers WHERE receipts LIMIT 1")).rows[0];
  } else {
    const ticket = (await db.query("SELECT department FROM bluebar.station_tickets WHERE id = $1", [ref])).rows[0];
    if (ticket)
      printer = (
        await db.query("SELECT id FROM bluebar.printers WHERE $1 = ANY(departments) LIMIT 1", [ticket.department])
      ).rows[0];
  }
  if (!printer) return false;
  await enqueue(db, printer.id, kind === "ticket" ? "ticket" : kind, ref);
  return true;
}

const waiterName = async (db, id) =>
  id ? (await db.query("SELECT name FROM bluebar.waiters WHERE id = $1", [id])).rows[0]?.name : null;

async function ticketDocument(db, id, cancelled) {
  const k = (await db.query("SELECT * FROM bluebar.station_tickets WHERE id = $1", [id])).rows[0];
  if (!k) return null;
  const who = await waiterName(db, k.waiter_id);
  return [
    { type: "title", text: k.department.toUpperCase() },
    { type: "center", text: cancelled ? "ANULUAR · MOS E PËRGATITNI" : "POROSI PËR REPARTIN" },
    { type: "pair", left: `Tavolina ${pad(k.table_id)}`, right: `Raundi ${k.round}` },
    { type: "text", text: `${stamp(k.created_at)}${who ? ` · ${who}` : ""}` },
    { type: "rule" },
    ...k.lines.map((l) => ({ type: "big", text: `${l.qty} x ${l.name}`, strike: cancelled })),
    { type: "rule" },
  ];
}
async function invoiceDocument(db, id, venueName) {
  const i = (await db.query("SELECT * FROM bluebar.invoices WHERE id = $1", [Number(id)])).rows[0];
  if (!i) return null;
  const lines = (
    await db.query("SELECT * FROM bluebar.invoice_lines WHERE invoice_id = $1 ORDER BY product_id", [i.id])
  ).rows;
  const who = await waiterName(db, i.waiter_id);
  const fiscal = i.fiscal_status === "fiskalizuar" && i.fiscal_iic;
  return [
    { type: "title", text: venueName || "BlueBar" },
    { type: "center", text: fiscal ? "FATURË E FISKALIZUAR" : "KOPJE · JO FATURË FISKALE" },
    { type: "pair", left: `Fatura D-${i.id}`, right: `Tavolina ${pad(i.table_id)}` },
    { type: "text", text: `${stamp(i.created_at)}${who ? ` · ${who}` : ""}` },
    { type: "rule" },
    ...lines.map((l) => ({ type: "pair", left: `${l.qty} x ${l.name}`, right: lek(l.qty * l.price) })),
    { type: "rule" },
    { type: "total", left: "TOTALI", right: lek(Number(i.total)) },
    { type: "text", text: `Pagesa: ${i.method}` },
    ...(fiscal
      ? [
          { type: "rule" },
          { type: "text", text: `NIVF: ${i.fiscal_iic}` },
          { type: "text", text: `NSLF: ${i.fiscal_fic}` },
          ...(i.fiscal_verification_url ? [{ type: "qr", text: i.fiscal_verification_url }] : []),
        ]
      : []),
    { type: "center", text: "Faleminderit për vizitën!" },
  ];
}
async function shiftDocument(db, id, venueName) {
  const r = await shiftReport(db, Number(id));
  if (!r) return null;
  const { shift } = r;
  return [
    { type: "title", text: venueName || "BlueBar" },
    { type: "center", text: shift.closed ? `RAPORT TURNI #${shift.id}` : `GJENDJA E TURNIT #${shift.id}` },
    { type: "text", text: `Hapur: ${stamp(shift.opened)}${shift.openedBy ? ` · ${shift.openedBy}` : ""}` },
    ...(shift.closed ? [{ type: "text", text: `Mbyllur: ${stamp(shift.closed)}${shift.closedBy ? ` · ${shift.closedBy}` : ""}` }] : []),
    { type: "rule" },
    { type: "pair", left: "Fatura", right: String(r.invoiceCount) },
    { type: "pair", left: "Shitje cash", right: lek(r.cash) },
    { type: "pair", left: "Shitje me kartë", right: lek(r.card) },
    { type: "total", left: "SHITJE GJITHSEJ", right: lek(r.cash + r.card) },
    { type: "rule" },
    { type: "pair", left: "Fondi fillestar", right: lek(shift.opening) },
    { type: "pair", left: "+ Shitje cash", right: lek(r.cash) },
    ...(r.cashIn ? [{ type: "pair", left: "+ Hyrje në arkë", right: lek(r.cashIn) }] : []),
    ...(r.cashOut ? [{ type: "pair", left: "- Dalje nga arka", right: lek(r.cashOut) }] : []),
    { type: "total", left: "CASH I PRITSHËM", right: lek(shift.expected) },
    ...(shift.closed
      ? [
          { type: "pair", left: "Cash i numëruar", right: lek(shift.counted) },
          { type: "pair", left: "Diferenca", right: lek(shift.difference) },
          ...(shift.note ? [{ type: "text", text: `Shënim: ${shift.note}` }] : []),
        ]
      : []),
    ...(r.cashMovements.length
      ? [{ type: "rule" }, { type: "center", text: "LËVIZJET E ARKËS" },
        ...r.cashMovements.map((m) => ({ type: "pair", left: `${m.kind === "in" ? "+" : "-"} ${m.reason}`, right: lek(m.amount) }))]
      : []),
    { type: "rule" },
    { type: "center", text: "SIPAS KAMARIERIT" },
    ...r.byWaiter.map((w) => ({ type: "pair", left: `${w.name} (${w.count})`, right: lek(w.total) })),
    { type: "rule" },
    { type: "center", text: "MË TË SHITURAT" },
    ...r.topProducts.map((p) => ({ type: "pair", left: `${p.qty} x ${p.name}`, right: lek(p.total) })),
    { type: "rule" },
    { type: "text", text: `Të fiskalizuara: ${r.fiscalized} nga ${r.invoiceCount}` },
  ];
}
async function testDocument(db, printerId) {
  const p = (await db.query("SELECT * FROM bluebar.printers WHERE id = $1", [Number(printerId)])).rows[0];
  if (!p) return null;
  return [
    { type: "title", text: "BlueBar" },
    { type: "center", text: "PROVË PRINTIMI" },
    { type: "rule" },
    { type: "pair", left: "Printeri", right: p.name },
    { type: "pair", left: "Adresa", right: `${p.host}:${p.port}` },
    { type: "text", text: `Repartet: ${p.departments.join(", ") || "—"}${p.receipts ? " · Faturat" : ""}` },
    { type: "text", text: "Shkronjat: ë Ë ç Ç" },
    { type: "rule" },
    { type: "center", text: "Nëse e lexoni këtë, printeri punon." },
  ];
}

// Called by the agent every couple of seconds; doubles as its heartbeat. usbPrinters:
// the print queues the agent's computer reported (null when it didn't say).
export async function pendingJobs(db, venueName, usbPrinters = null) {
  await db.query(
    "UPDATE bluebar.print_agent SET last_seen = now(), usb_printers = COALESCE($1, usb_printers) WHERE id = 1",
    [usbPrinters],
  );
  const rows = (
    await db.query(
      `SELECT j.*, p.host, p.port, p.width, p.ascii, p.cutter, i.fiscal_status
       FROM bluebar.print_jobs j
       JOIN bluebar.printers p ON p.id = j.printer_id
       LEFT JOIN bluebar.invoices i ON j.kind = 'invoice' AND i.id::text = j.ref
       WHERE j.printed_at IS NULL AND j.created_at > now() - interval '${MAX_AGE}'
       ORDER BY j.created_at
       LIMIT 20`,
    )
  ).rows;
  const jobs = [];
  for (const j of rows) {
    if (j.wait_fiscal && j.fiscal_status === "pa_fiskalizuar" && Date.now() - new Date(j.created_at) < FISCAL_WAIT_MS)
      continue;
    const document =
      j.kind === "invoice"
        ? await invoiceDocument(db, j.ref, venueName)
        : j.kind === "test"
          ? await testDocument(db, j.ref)
          : j.kind === "shift"
            ? await shiftDocument(db, j.ref, venueName)
          : await ticketDocument(db, j.ref, j.kind === "cancel");
    if (!document) {
      // The ticket was finished and cleared before the agent got to it: nothing to print.
      await finishJob(db, j.id, true);
      continue;
    }
    jobs.push({ id: j.id, printer: { host: j.host, port: j.port, width: j.width, ascii: j.ascii, cutter: j.cutter }, document });
  }
  return jobs;
}
export async function finishJob(db, id, ok, error) {
  await db.query(
    ok
      ? "UPDATE bluebar.print_jobs SET printed_at = now(), error = NULL WHERE id = $1"
      : "UPDATE bluebar.print_jobs SET attempts = attempts + 1, error = $2 WHERE id = $1",
    ok ? [id] : [id, String(error || "Printeri nuk u përgjigj.").slice(0, 200)],
  );
}
