import { createHash, randomUUID } from "node:crypto";
import { applyCommand, AppError } from "./commands.js";
const iso = (v) => (v == null ? null : new Date(v).toISOString());
export async function loadState(client) {
  // One database round trip, within the caller's transaction snapshot.
  const names = [
    "control", "categories", "departments", "products", "waiters", "order_lines",
    "dining_tables", "shifts", "invoice_lines", "invoices", "stock_movements",
    "station_tickets", "printers",
  ];
  // Identifiers come only from the fixed list above, never request data.
  const query = "SELECT jsonb_build_object(" + names.map((name) =>
    `'${name}', (SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) FROM bluebar.${name} r)`,
  ).join(",") + ") AS data";
  const data = (await client.query(query)).rows[0].data;
  const rows = (name) => data[name];
  const control = (rows("control"))[0];
  const categories = (rows("categories")).map((r) => r.name).sort();
  const departments = (rows("departments")).map((r) => r.name).sort();
  const products = (rows("products")).sort((a, b) => a.id - b.id);
  const waiters = (rows("waiters")).sort((a, b) => a.id - b.id);
  const lines = rows("order_lines");
  const tickets = rows("station_tickets");
  const tables = (rows("dining_tables"))
    .sort((a, b) => a.id - b.id)
    .map((t) => ({
      id: t.id,
      area: t.area,
      shape: t.shape,
      active: t.active,
      waiter: t.waiter_id,
      posX: Number(t.pos_x),
      posY: Number(t.pos_y),
      width: Number(t.width),
      height: Number(t.height),
      rotation: t.rotation,
      seats: t.seats,
      occupiedSince: iso(t.occupied_since),
      lines: lines
        .filter((l) => l.table_id === t.id)
        .sort((a, b) => a.product_id - b.product_id)
        .map((l) => ({
          id: l.product_id,
          name: l.name,
          price: l.price,
          qty: l.qty,
          sent: l.sent,
        })),
    }));
  // Per-shift sales, so the history and its totals never need every invoice loaded.
  const sales = new Map(
    (
      await client.query(
        `SELECT shift_id, count(*)::integer AS count, sum(total)::bigint AS total,
           COALESCE(sum(total) FILTER (WHERE method = 'Cash'), 0)::bigint AS cash,
           COALESCE(sum(total) FILTER (WHERE method = 'Kartë'), 0)::bigint AS card
         FROM bluebar.invoices GROUP BY shift_id`,
      )
    ).rows.map((r) => [r.shift_id, { count: r.count, total: Number(r.total), cash: Number(r.cash), card: Number(r.card) }]),
  );
  const openShift = rows("shifts").find((s) => !s.closed);
  const cashMovements = openShift
    ? (
        await client.query(
          "SELECT * FROM bluebar.cash_movements WHERE shift_id = $1 ORDER BY created_at, id",
          [openShift.id],
        )
      ).rows.map((m) => ({
        id: m.id,
        kind: m.kind,
        amount: m.amount,
        reason: m.reason,
        by: m.created_by,
        date: iso(m.created_at),
      }))
    : [];
  const shifts = (rows("shifts"))
    .map((s) => ({
      id: s.id,
      opened: iso(s.opened),
      opening: s.opening,
      openedBy: s.opened_by,
      ...(s.closed
        ? {
            closed: iso(s.closed),
            closedBy: s.closed_by,
            counted: s.counted,
            countedDetail: s.counted_detail,
            expected: Number(s.expected),
            difference: Number(s.difference),
            note: s.note,
            sales: sales.get(s.id) || { count: 0, total: 0, cash: 0, card: 0 },
          }
        : { cashMovements }),
    }))
    .sort((a, b) => b.id - a.id);
  const invoiceLines = rows("invoice_lines");
  const invoices = (rows("invoices"))
    .sort((a, b) => b.id - a.id)
    .map((i) => ({
      id: i.id,
      table: i.table_id,
      waiter: i.waiter_id,
      shiftId: i.shift_id,
      total: Number(i.total),
      method: i.method,
      date: iso(i.created_at),
      status: i.status,
      fiscalStatus: i.fiscal_status,
      fiscalIic: i.fiscal_iic,
      fiscalFic: i.fiscal_fic,
      fiscalVerificationUrl: i.fiscal_verification_url,
      lines: invoiceLines
        .filter((l) => l.invoice_id === i.id)
        .sort((a, b) => a.product_id - b.product_id)
        .map((l) => ({
          id: l.product_id,
          name: l.name,
          price: l.price,
          qty: l.qty,
        })),
    }));
  const movements = (rows("stock_movements"))
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((m) => ({
      product: m.product,
      qty: m.qty,
      reason: m.reason,
      date: iso(m.created_at),
    }));
  return {
    version: control.version,
    revision: Number(control.revision),
    state: {
      categories,
      departments,
      products,
      waiters,
      tables,
      invoices,
      movements,
      printers: rows("printers")
        .sort((a, b) => a.id - b.id)
        .map((x) => ({
          id: x.id,
          name: x.name,
          host: x.host,
          port: x.port,
          width: x.width,
          departments: x.departments,
          receipts: x.receipts,
          ascii: x.ascii,
          cutter: x.cutter,
        })),
      tickets: tickets
        .map((k) => ({
          id: k.id,
          table: k.table_id,
          invoice: k.invoice_id,
          round: k.round,
          department: k.department,
          waiter: k.waiter_id,
          date: iso(k.created_at),
          lines: k.lines,
          doneAt: iso(k.done_at),
          cancelledAt: iso(k.cancelled_at),
        }))
        .sort((a, b) => a.date.localeCompare(b.date) || a.department.localeCompare(b.department)),
      shift: shifts.find((s) => !s.closed) || null,
      shifts: shifts.filter((s) => s.closed),
    },
  };
}
const changed = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
export async function persist(client, previous, next) {
  for (const category of next.categories.filter(
    (c) => !previous.categories.includes(c),
  ))
    await client.query("INSERT INTO bluebar.categories(name) VALUES($1)", [
      category,
    ]);
  for (const department of next.departments.filter(
    (d) => !previous.departments.includes(d),
  ))
    await client.query("INSERT INTO bluebar.departments(name) VALUES($1)", [
      department,
    ]);
  for (const p of next.products.filter((p) =>
    changed(
      previous.products.find((x) => x.id === p.id),
      p,
    ),
  ))
    await client.query(
      "INSERT INTO bluebar.products(id,name,category,price,stock,department) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET name=$2,category=$3,price=$4,stock=$5,department=$6",
      [p.id, p.name, p.category, p.price, p.stock, p.department || null],
    );
  for (const w of next.waiters.filter((w) =>
    changed(
      previous.waiters.find((x) => x.id === w.id),
      w,
    ),
  ))
    await client.query(
      "INSERT INTO bluebar.waiters(id,name,active) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET name=$2,active=$3",
      [w.id, w.name, w.active],
    );
  const oldShifts = [
    ...previous.shifts,
    ...(previous.shift ? [previous.shift] : []),
  ];
  for (const s of [...next.shifts, ...(next.shift ? [next.shift] : [])].filter(
    (s) =>
      changed(
        oldShifts.find((x) => x.id === s.id),
        s,
      ),
  ))
    await client.query(
      `INSERT INTO bluebar.shifts(id,opened,opening,closed,counted,expected,difference,opened_by,closed_by,note,counted_detail)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT(id) DO UPDATE SET closed=$4,counted=$5,expected=$6,difference=$7,closed_by=$9,note=$10,counted_detail=$11`,
      [
        s.id,
        s.opened,
        s.opening,
        s.closed || null,
        s.counted ?? null,
        s.expected ?? null,
        s.difference ?? null,
        s.openedBy || null,
        s.closedBy || null,
        s.note || null,
        s.countedDetail ? JSON.stringify(s.countedDetail) : null,
      ],
    );
  // Cash movements are only ever added, and only to the open shift.
  if (next.shift)
    for (const m of (next.shift.cashMovements || []).filter(
      (m) => !(previous.shift?.cashMovements || []).some((x) => x.id === m.id),
    ))
      await client.query(
        "INSERT INTO bluebar.cash_movements(id,shift_id,kind,amount,reason,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [m.id, next.shift.id, m.kind, m.amount, m.reason, m.by, m.date],
      );
  for (const t of next.tables.filter((t) =>
    changed(
      previous.tables.find((x) => x.id === t.id),
      t,
    ),
  )) {
    const layout = [
      t.id, t.area, t.shape || null, t.active, t.waiter || null,
      t.posX, t.posY, t.width, t.height, t.rotation, t.seats, t.occupiedSince || null,
    ];
    if (previous.tables.some((x) => x.id === t.id))
      await client.query(
        `UPDATE bluebar.dining_tables SET area=$2,shape=$3,active=$4,waiter_id=$5,
           pos_x=$6,pos_y=$7,width=$8,height=$9,rotation=$10,seats=$11,occupied_since=$12
         WHERE id=$1`,
        layout,
      );
    else
      await client.query(
        `INSERT INTO bluebar.dining_tables(id,area,shape,active,waiter_id,pos_x,pos_y,width,height,rotation,seats,occupied_since)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        layout,
      );
    await client.query("DELETE FROM bluebar.order_lines WHERE table_id=$1", [
      t.id,
    ]);
    for (const l of t.lines)
      await client.query(
        "INSERT INTO bluebar.order_lines(table_id,product_id,name,price,qty,sent) VALUES($1,$2,$3,$4,$5,$6)",
        [t.id, l.id, l.name, l.price, l.qty, l.sent || 0],
      );
  }
  // table.delete already refused a table with any order_lines/invoices history, so this
  // is safe against dining_tables' non-cascading FKs from those two tables.
  for (const t of previous.tables.filter((t) => !next.tables.some((x) => x.id === t.id)))
    await client.query("DELETE FROM bluebar.dining_tables WHERE id=$1", [t.id]);
  for (const i of next.invoices.filter(
    (i) => !previous.invoices.some((x) => x.id === i.id),
  )) {
    await client.query(
      "INSERT INTO bluebar.invoices(id,table_id,waiter_id,shift_id,total,method,created_at,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [i.id, i.table, i.waiter, i.shiftId, i.total, i.method, i.date, i.status],
    );
    for (const l of i.lines)
      await client.query(
        "INSERT INTO bluebar.invoice_lines(invoice_id,product_id,name,price,qty) VALUES($1,$2,$3,$4,$5)",
        [i.id, l.id, l.name, l.price, l.qty],
      );
  }
  for (const k of previous.tickets.filter((k) => !next.tickets.some((x) => x.id === k.id)))
    await client.query("DELETE FROM bluebar.station_tickets WHERE id=$1", [k.id]);
  for (const k of next.tickets.filter((k) =>
    changed(previous.tickets.find((x) => x.id === k.id), k),
  ))
    await client.query(
      `INSERT INTO bluebar.station_tickets(id,table_id,invoice_id,round,department,waiter_id,lines,created_at,done_at,cancelled_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT(id) DO UPDATE SET invoice_id=$3, done_at=$9, cancelled_at=$10`,
      [k.id, k.table, k.invoice || null, k.round, k.department, k.waiter || null,
        JSON.stringify(k.lines), k.date, k.doneAt || null, k.cancelledAt || null],
    );
  for (const x of previous.printers.filter((x) => !next.printers.some((y) => y.id === x.id)))
    await client.query("DELETE FROM bluebar.printers WHERE id=$1", [x.id]);
  for (const x of next.printers.filter((x) => changed(previous.printers.find((y) => y.id === x.id), x)))
    await client.query(
      `INSERT INTO bluebar.printers(id,name,host,port,width,departments,receipts,ascii,cutter) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT(id) DO UPDATE SET name=$2,host=$3,port=$4,width=$5,departments=$6,receipts=$7,ascii=$8,cutter=$9`,
      [x.id, x.name, x.host, x.port, x.width, x.departments, x.receipts, x.ascii === true, x.cutter !== false],
    );
  // Print jobs follow from what just changed, in the same transaction: a sale can't
  // exist without its cashier job, nor a station ticket without its printer job.
  const enqueue = (printer, kind, ref, waitFiscal = false) =>
    printer &&
    client.query(
      "INSERT INTO bluebar.print_jobs(id,printer_id,kind,ref,wait_fiscal) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), printer.id, kind, String(ref), waitFiscal],
    );
  const stationPrinter = (department) => next.printers.find((x) => x.departments.includes(department));
  for (const k of next.tickets) {
    const before = previous.tickets.find((x) => x.id === k.id);
    if (!before) await enqueue(stationPrinter(k.department), "ticket", k.id);
    else if (!before.cancelledAt && k.cancelledAt) await enqueue(stationPrinter(k.department), "cancel", k.id);
  }
  const cashier = next.printers.find((x) => x.receipts);
  for (const i of next.invoices.filter((i) => !previous.invoices.some((x) => x.id === i.id)))
    await enqueue(cashier, "invoice", i.id, Boolean(i.fiscalRequested));
  for (const m of next.movements.slice(previous.movements.length))
    await client.query(
      "INSERT INTO bluebar.stock_movements(product,qty,reason,created_at) VALUES($1,$2,$3,$4)",
      [m.product, m.qty, m.reason, m.date || new Date().toISOString()],
    );
}
export async function readSnapshot(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const snapshot = await loadState(client);
    await client.query("COMMIT");
    return snapshot;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function readOrderTable(client, tableId) {
  const row = (
    await client.query(
      `SELECT t.id, t.area, t.shape, t.active, t.waiter_id,
        t.pos_x, t.pos_y, t.width, t.height, t.rotation, t.seats, t.occupied_since,
        COALESCE(
          jsonb_agg(jsonb_build_object(
            'id', l.product_id, 'name', l.name, 'price', l.price, 'qty', l.qty, 'sent', l.sent
          ) ORDER BY l.product_id) FILTER (WHERE l.product_id IS NOT NULL),
          '[]'::jsonb
        ) AS lines
       FROM bluebar.dining_tables t
       LEFT JOIN bluebar.order_lines l ON l.table_id = t.id
       WHERE t.id = $1
       GROUP BY t.id, t.area, t.shape, t.active, t.waiter_id`,
      [tableId],
    )
  ).rows[0];
  if (!row) throw new AppError("Tavolina nuk ekziston.");
  return {
    id: row.id,
    area: row.area,
    shape: row.shape,
    active: row.active,
    waiter: row.waiter_id,
    posX: Number(row.pos_x),
    posY: Number(row.pos_y),
    width: Number(row.width),
    height: Number(row.height),
    rotation: row.rotation,
    seats: row.seats,
    occupiedSince: iso(row.occupied_since),
    lines: row.lines,
  };
}

// The high-frequency POS path reads and returns only the affected order.
// Full snapshots remain the source of truth for initial load and management actions.
export async function executeOrderPatch(pool, command, actor = null) {
  if (!["order.add", "order.remove"].includes(command.type))
    throw new AppError("Veprimi i porosisë është i pavlefshëm.");
  const { tableId, productId, waiterId } = command.payload || {};
  if (!Number.isSafeInteger(tableId) || tableId < 1 ||
      !Number.isSafeInteger(productId) || productId < 1 ||
      (command.type === "order.add" && (!Number.isSafeInteger(waiterId) || waiterId < 1)))
    throw new AppError("Vlerë numerike e pavlefshme.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const hash = createHash("sha256")
      .update(JSON.stringify({ type: command.type, payload: command.payload }))
      .digest("hex");
    const context = (
      await client.query(
        `SELECT c.version, cmd.payload_hash, cmd.result,
          EXISTS(SELECT 1 FROM bluebar.shifts WHERE closed IS NULL) AS shift_open,
          t.id AS table_id, t.active AS table_active,
          w.active AS waiter_active,
          p.name AS product_name, p.price AS product_price, p.stock AS product_stock,
          COALESCE((SELECT sum(qty) FROM bluebar.order_lines WHERE product_id = $4), 0)::integer AS reserved,
          line.qty AS line_qty, line.sent AS line_sent,
          (SELECT count(*) FROM bluebar.order_lines WHERE table_id = $2)::integer AS table_line_count
         FROM bluebar.control c
         LEFT JOIN bluebar.commands cmd ON cmd.id = $1
         LEFT JOIN bluebar.dining_tables t ON t.id = $2
         LEFT JOIN bluebar.waiters w ON w.id = $3
         LEFT JOIN bluebar.products p ON p.id = $4
         LEFT JOIN bluebar.order_lines line ON line.table_id = $2 AND line.product_id = $4
         WHERE c.id = 1
         FOR UPDATE OF c`,
        [command.id, tableId, waiterId || null, productId],
      )
    ).rows[0];

    if (context.payload_hash) {
      if (context.payload_hash !== hash)
        throw new AppError("Ky identifikues është përdorur për një veprim tjetër.", 409);
      const table = await readOrderTable(client, tableId);
      await client.query("COMMIT");
      return {
        version: context.version,
        patch: { table },
        result: context.result,
        replayed: true,
      };
    }
    if (command.version !== context.version)
      throw new AppError(
        "Të dhënat ndryshuan nga një sesion tjetër. Gjendja u rifreskua; kontrolloni dhe provoni sërish.",
        409,
      );
    if (!context.shift_open) throw new AppError("Hapni turnin për të marrë porosi.");
    if (!context.table_id) throw new AppError("Tavolina nuk ekziston.");
    if (!context.table_active) throw new AppError("Tavolina është joaktive.");

    if (command.type === "order.add") {
      if (!context.waiter_active) throw new AppError("Zgjidhni një kamarier aktiv.");
      if (!context.product_name || context.reserved >= context.product_stock)
        throw new AppError("Nuk ka stok të disponueshëm për këtë produkt.");
      await client.query(
        `WITH added AS (
           INSERT INTO bluebar.order_lines(table_id, product_id, name, price, qty)
           VALUES($1, $2, $3, $4, 1)
           ON CONFLICT(table_id, product_id) DO UPDATE SET qty = bluebar.order_lines.qty + 1
           RETURNING 1
         )
         UPDATE bluebar.dining_tables SET waiter_id = $5, occupied_since = COALESCE(occupied_since, now())
         WHERE id = $1`,
        [tableId, productId, context.product_name, context.product_price, waiterId],
      );
    } else {
      if (!context.line_qty) throw new AppError("Produkti nuk është në porosi.");
      // A unit the station already got is being prepared; only a manager may void it.
      if (actor?.role === "waiter" && context.line_sent >= context.line_qty)
        throw new AppError("Ky artikull është dërguar tashmë në repart. Vetëm menaxheri mund ta heqë.", 403);
      await client.query(
        `WITH removed AS (
           DELETE FROM bluebar.order_lines
           WHERE table_id = $1 AND product_id = $2 AND qty = 1
           RETURNING 1
         )
         UPDATE bluebar.order_lines SET qty = qty - 1, sent = LEAST(sent, qty - 1)
         WHERE table_id = $1 AND product_id = $2 AND qty > 1`,
        [tableId, productId],
      );
      // Data-modifying CTEs in one statement share a snapshot and can't see each
      // other's writes, so "is the table empty now" is computed here from the
      // counts already read under FOR UPDATE, not re-queried after the delete.
      if (context.line_qty === 1 && context.table_line_count === 1) {
        await client.query("UPDATE bluebar.dining_tables SET occupied_since = NULL WHERE id = $1", [tableId]);
        // Same as order.cancel: the order is gone, so stations drop finished tickets
        // and see unfinished ones as cancelled.
        await client.query(
          `DELETE FROM bluebar.station_tickets
           WHERE table_id = $1 AND invoice_id IS NULL AND cancelled_at IS NULL AND done_at IS NOT NULL`,
          [tableId],
        );
        await client.query(
          `UPDATE bluebar.station_tickets SET cancelled_at = now()
           WHERE table_id = $1 AND invoice_id IS NULL AND cancelled_at IS NULL`,
          [tableId],
        );
      }
    }

    const version = (
      await client.query(
        `WITH bumped AS (
           UPDATE bluebar.control SET version = version + 1, revision = revision + 1 WHERE id = 1
           RETURNING version, revision
         )
         INSERT INTO bluebar.commands(id, payload_hash, type, result)
         SELECT $1, $2, $3, '{}'::jsonb FROM bumped
         RETURNING (SELECT version FROM bumped) AS version, (SELECT revision FROM bumped) AS revision`,
        [command.id, hash, command.type],
      )
    ).rows[0];
    const table = await readOrderTable(client, tableId);
    await client.query("COMMIT");
    return { version: version.version, revision: Number(version.revision), patch: { table }, result: {} };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function execute(pool, command, actor = null) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // One venue MVP: serialize mutations, including payment and shift closure.
    await client.query(
      "SELECT version FROM bluebar.control WHERE id=1 FOR UPDATE",
    );
    const hash = createHash("sha256")
      .update(JSON.stringify({ type: command.type, payload: command.payload }))
      .digest("hex");
    const cached = (
      await client.query(
        "SELECT payload_hash,result FROM bluebar.commands WHERE id=$1",
        [command.id],
      )
    ).rows[0];
    if (cached) {
      if (cached.payload_hash !== hash)
        throw new AppError(
          "Ky identifikues është përdorur për një veprim tjetër.",
          409,
        );
      const snapshot = await loadState(client);
      await client.query("COMMIT");
      return { ...snapshot, result: cached.result, replayed: true };
    }
    const snapshot = await loadState(client);
    if (command.version !== snapshot.version)
      throw new AppError(
        "Të dhënat ndryshuan nga një sesion tjetër. Gjendja u rifreskua; kontrolloni dhe provoni sërish.",
        409,
      );
    let next;
    try {
      next = applyCommand(snapshot.state, command.type, command.payload, actor);
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError(e.message);
    }
    await persist(client, snapshot.state, next.state);
    const version = snapshot.version + 1;
    const revision = Number(
      (await client.query("UPDATE bluebar.control SET version=$1, revision = revision + 1 WHERE id=1 RETURNING revision", [
        version,
      ])).rows[0].revision,
    );
    await client.query(
      "INSERT INTO bluebar.commands(id,payload_hash,type,result) VALUES($1,$2,$3,$4)",
      [command.id, hash, command.type, JSON.stringify(next.result)],
    );
    await client.query("COMMIT");
    return { state: next.state, version, revision, result: next.result };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// Fiscalization is a best-effort enrichment of an already-committed payment, run after
// order.pay's own transaction, so it never rolls back a sale that already succeeded.
// This does not bump bluebar.control's version — it's the same invoice, not a new command.
export async function setInvoiceFiscalResult(pool, invoiceId, { status, iic = null, fic = null, verificationUrl = null }) {
  await pool.query(
    `UPDATE bluebar.invoices
     SET fiscal_status = $2, fiscal_iic = $3, fiscal_fic = $4, fiscal_verification_url = $5
     WHERE id = $1`,
    [invoiceId, status, iic, fic, verificationUrl],
  );
  await bumpRevision(pool);
}
// For writes outside commands that still change what /api/state shows.
export const bumpRevision = (pool) => pool.query("UPDATE bluebar.control SET revision = revision + 1 WHERE id = 1");
// A device's cheap poll: has anything changed since the revision it already has?
export const readRevision = async (pool) =>
  Number((await pool.query("SELECT revision FROM bluebar.control WHERE id = 1")).rows[0].revision);
