import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
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
// A one-time code, valid 10 minutes and once, that a venue computer trades for the
// agent key. Nobody types it (it travels inside the installer link), so it is long and
// random — 192 bits — not a guessable short number. Creating one drops the previous.
export async function createPairing(pool, slug) {
  await pool.query("DELETE FROM bluebar_catalog.print_pairings WHERE venue_slug = $1 OR expires_at < now()", [slug]);
  for (;;) {
    const code = randomBytes(24).toString("base64url");
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
  // Printers whose latest job keeps failing (paper out, unplugged, wrong IP).
  const failing = (
    await db.query(
      `SELECT DISTINCT ON (printer_id) printer_id, error FROM bluebar.print_jobs
       WHERE created_at > now() - interval '${MAX_AGE}' ORDER BY printer_id, created_at DESC`,
    )
  ).rows.filter((r) => r.error).map((r) => r.printer_id);
  return {
    configured: Boolean(row),
    lastSeen: row?.last_seen ? new Date(row.last_seen).toISOString() : null,
    usbPrinters: row?.usb_printers ?? [],
    pending,
    failing,
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
    // The till's own receipt printer, else one not tied to any till.
    const id = Number(ref);
    const shiftId = !Number.isSafeInteger(id)
      ? null
      : kind === "shift" ? id : (await db.query("SELECT shift_id FROM bluebar.invoices WHERE id = $1", [id])).rows[0]?.shift_id;
    printer = (
      await db.query(
        `SELECT p.id FROM bluebar.printers p LEFT JOIN bluebar.shifts s ON s.id = $1
         WHERE p.receipts AND (p.pos_id = s.pos_id OR p.pos_id IS NULL) ORDER BY p.pos_id IS NULL LIMIT 1`,
        [shiftId ?? null],
      )
    ).rows[0];
  } else {
    // A ticket with a station prints on that station's printer; otherwise its till (stored
    // when sent, else its table's) picks among its department's printers.
    printer = (
      await db.query(
        `SELECT COALESCE(
           (SELECT s.printer_id FROM bluebar.stations s WHERE s.id = k.station_id),
           CASE WHEN k.station_id IS NULL THEN (
             SELECT p.id FROM bluebar.printers p
             WHERE k.department = ANY(p.departments) AND (p.pos_id = COALESCE(k.pos_id, tp.id) OR p.pos_id IS NULL)
             ORDER BY p.pos_id IS NULL LIMIT 1) END
         ) AS id
         FROM bluebar.station_tickets k
         JOIN bluebar.dining_tables t ON t.id = k.table_id
         CROSS JOIN LATERAL (
           SELECT id FROM bluebar.points_of_sale ORDER BY (t.area = ANY(areas)) DESC NULLS LAST, id LIMIT 1
         ) tp
         WHERE k.id = $1`,
        [ref],
      )
    ).rows[0];
    if (!printer?.id) printer = null;
  }
  if (!printer) return false;
  await enqueue(db, printer.id, kind === "ticket" ? "ticket" : kind, ref);
  return true;
}

const waiterName = async (db, id) =>
  id ? (await db.query("SELECT name FROM bluebar.waiters WHERE id = $1", [id])).rows[0]?.name : null;

const COURSE_NAMES = ["", "ANTIPASTË", "KRYESORE", "ËMBËLSIRË"];
async function ticketDocument(db, id, kind) {
  const k = (
    await db.query(
      `SELECT k.*, s.name AS station_name FROM bluebar.station_tickets k
       LEFT JOIN bluebar.stations s ON s.id = k.station_id WHERE k.id = $1`,
      [id],
    )
  ).rows[0];
  if (!k) return null;
  const who = await waiterName(db, k.waiter_id);
  // A void slip: units sent earlier and no longer wanted. A moved slip: the old station's
  // copy after another station accepted the work. A correction: how to make it changed.
  // A remake: make it again.
  const kindOf = k.kind || (k.void ? "void" : "order");
  const cancelled = kind === "cancel" || kind === "moved" || kindOf === "void";
  const headline =
    kind === "moved" ? `TRANSFERUAR TE ${(k.station_name || "").toUpperCase()} · MOS E PËRGATITNI`
    : kindOf === "void" ? "ANULIM · HIQENI NGA POROSIA"
    : kind === "cancel" ? "ANULUAR · MOS E PËRGATITNI"
    : kindOf === "correction" ? "KORRIGJIM · NDRYSHOI MËNYRA E PËRGATITJES"
    : kindOf === "remake" ? "RIPËRGATIT"
    : "POROSI PËR REPARTIN";
  const courses = [...new Set(k.lines.map((l) => l.course || 0))];
  return [
    { type: "title", text: (k.station_name && kind !== "moved" ? k.station_name : k.department).toUpperCase() },
    { type: "center", text: headline },
    { type: "pair", left: `Tavolina ${pad(k.table_id)}`, right: `Raundi ${k.round}` },
    { type: "text", text: `${stamp(k.created_at)}${who ? ` · ${who}` : ""}` },
    ...(k.allergy ? [{ type: "big", text: `ALERGJI: ${k.allergy}` }] : []),
    ...(k.note && kindOf === "order" ? [{ type: "text", text: `Shënim: ${k.note}` }] : []),
    ...(k.note && kindOf !== "order" ? [{ type: "text", text: `Arsyeja: ${k.note}` }] : []),
    { type: "rule" },
    ...courses.flatMap((c) => [
      ...(c && courses.length > 1 ? [{ type: "center", text: COURSE_NAMES[c] }] : c ? [{ type: "text", text: COURSE_NAMES[c] }] : []),
      ...k.lines
        .filter((l) => (l.course || 0) === c)
        .flatMap((l) => [
          { type: "big", text: `${l.qty} x ${l.name}`, strike: cancelled },
          ...(l.extras || []).map((x) => ({ type: "text", text: `  + ${x}` })),
          ...(l.note ? [{ type: "text", text: `  > ${l.note}` }] : []),
          ...(l.allergy ? [{ type: "text", text: `  ! ALERGJI: ${l.allergy}` }] : []),
        ]),
    ]),
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
    ...lines.flatMap((l) => [
      { type: "pair", left: `${l.qty} x ${[l.name, ...(l.extras || []).map((x) => x.name)].join(" + ")}`, right: lek(l.qty * l.price) },
      ...(l.comp ? [{ type: "pair", left: `  qerasje ${l.comp} x`, right: `-${lek(l.comp * l.price)}` }] : []),
    ]),
    { type: "rule" },
    ...(Number(i.discount) ? [{ type: "pair", left: `Ulje${i.discount_reason ? ` (${i.discount_reason})` : ""}`, right: `-${lek(Number(i.discount))}` }] : []),
    { type: "total", left: "TOTALI", right: lek(Number(i.total)) },
    ...(Number(i.cash_amount) ? [{ type: "pair", left: "Paguar cash", right: lek(Number(i.cash_amount)) }] : []),
    ...(Number(i.card_amount) ? [{ type: "pair", left: "Paguar me kartë", right: lek(Number(i.card_amount)) }] : []),
    ...(Number(i.tip_cash) + Number(i.tip_card) ? [{ type: "pair", left: "Bakshish", right: lek(Number(i.tip_cash) + Number(i.tip_card)) }] : []),
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
    ...(shift.posName ? [{ type: "text", text: `Kasa: ${shift.posName}` }] : []),
    { type: "text", text: `Hapur: ${stamp(shift.opened)}${shift.openedBy ? ` · ${shift.openedBy}` : ""}` },
    ...(shift.closed ? [{ type: "text", text: `Mbyllur: ${stamp(shift.closed)}${shift.closedBy ? ` · ${shift.closedBy}` : ""}` }] : []),
    { type: "rule" },
    { type: "pair", left: "Fatura", right: String(r.invoiceCount) },
    { type: "pair", left: "Shitje cash", right: lek(r.cash) },
    { type: "pair", left: "Bankë (kartë)", right: lek(r.card) },
    { type: "total", left: "ARKËTUAR GJITHSEJ", right: lek(r.cash + r.card) },
    ...(r.discount ? [{ type: "pair", left: "Ulje", right: lek(r.discount) }] : []),
    ...(r.comps ? [{ type: "pair", left: "Qerasje", right: lek(r.comps) }] : []),
    ...(r.tipsCash + r.tipsCard ? [{ type: "pair", left: "Bakshish (jo shitje)", right: lek(r.tipsCash + r.tipsCard) }] : []),
    { type: "rule" },
    { type: "pair", left: "Fondi fillestar", right: lek(shift.opening) },
    { type: "pair", left: "+ Shitje cash", right: lek(r.cash) },
    ...(r.tipsCash ? [{ type: "pair", left: "+ Bakshish cash", right: lek(r.tipsCash) }] : []),
    ...(r.cashIn ? [{ type: "pair", left: "+ Hyrje në arkë", right: lek(r.cashIn) }] : []),
    ...(r.refundsCash ? [{ type: "pair", left: "- Rimbursime cash", right: lek(r.refundsCash) }] : []),
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
          : await ticketDocument(db, j.ref, j.kind);
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
