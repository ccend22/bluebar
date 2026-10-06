import { createHash, randomUUID } from "node:crypto";
import { applyCommand, AppError } from "./commands.js";
import { newLineKey, printerFor, ticketPos } from "../src/domain.js";
const iso = (v) => (v == null ? null : new Date(v).toISOString());
export async function loadState(client) {
  // One database round trip, within the caller's transaction snapshot.
  const names = [
    "control", "categories", "departments", "products", "waiters", "order_lines",
    "dining_tables", "shifts", "invoice_lines", "invoices", "stock_movements",
    "station_tickets", "printers", "points_of_sale", "stations", "order_payments", "refunds",
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
  const products = rows("products")
    .sort((a, b) => a.id - b.id)
    .map((p) => ({
      id: p.id, name: p.name, category: p.category, price: p.price, stock: p.stock,
      department: p.department, minStock: p.min_stock, available: p.available, extras: p.extras,
    }));
  const waiters = (rows("waiters"))
    .sort((a, b) => a.id - b.id)
    .map((w) => ({ id: w.id, name: w.name, active: w.active, posId: w.pos_id }));
  const lines = rows("order_lines");
  const line = (l) => ({
    key: l.line_key, id: l.product_id, name: l.name, price: l.price, qty: l.qty, sent: l.sent, comp: l.comp,
    note: l.note, allergy: l.allergy, extras: l.extras, course: l.course, hold: l.hold,
  });
  const payment = (x) => ({ id: x.id, method: x.method, amount: x.amount, tip: x.tip, by: x.actor, date: iso(x.created_at), shiftId: x.shift_id });
  const openPayments = rows("order_payments").sort((a, b) => iso(a.created_at).localeCompare(iso(b.created_at)));
  const refunds = rows("refunds")
    .sort((a, b) => iso(a.created_at).localeCompare(iso(b.created_at)))
    .map((r) => ({ id: r.id, invoiceId: r.invoice_id, amount: r.amount, method: r.method, reason: r.reason, by: r.actor, date: iso(r.created_at), shiftId: r.shift_id }));
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
      guests: t.guests,
      discount: t.discount,
      note: t.note,
      allergy: t.allergy,
      course: t.course,
      payments: openPayments.filter((x) => x.table_id === t.id).map(payment),
      lines: lines
        .filter((l) => l.table_id === t.id)
        .sort((a, b) => a.product_id - b.product_id || a.line_key.localeCompare(b.line_key))
        .map(line),
    }));
  // Per-shift sales, so the history and its totals never need every invoice loaded.
  const sales = new Map(
    (
      await client.query(
        `SELECT shift_id, count(*)::integer AS count, sum(total)::bigint AS total,
           sum(cash_amount)::bigint AS cash, sum(card_amount)::bigint AS card
         FROM bluebar.invoices GROUP BY shift_id`,
      )
    ).rows.map((r) => [r.shift_id, { count: r.count, total: Number(r.total), cash: Number(r.cash), card: Number(r.card) }]),
  );
  const openIds = rows("shifts").filter((s) => !s.closed).map((s) => s.id);
  const cashMovements = openIds.length
    ? (
        await client.query(
          "SELECT * FROM bluebar.cash_movements WHERE shift_id = ANY($1) ORDER BY created_at, id",
          [openIds],
        )
      ).rows.map((m) => ({
        shiftId: m.shift_id,
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
      posId: s.pos_id,
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
        : { cashMovements: cashMovements.filter((m) => m.shiftId === s.id).map(({ shiftId, ...m }) => m) }),
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
      subtotal: Number(i.subtotal ?? i.total),
      comps: Number(i.comps),
      discount: Number(i.discount),
      discountReason: i.discount_reason,
      cash: Number(i.cash_amount),
      card: Number(i.card_amount),
      tipCash: Number(i.tip_cash),
      tipCard: Number(i.tip_card),
      guests: i.guests,
      refunds: refunds.filter((r) => r.invoiceId === i.id),
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
          key: l.line_key,
          id: l.product_id,
          name: l.name,
          price: l.price,
          qty: l.qty,
          comp: l.comp,
          extras: l.extras,
        })),
    }));
  const movements = (rows("stock_movements"))
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((m) => ({
      product: m.product,
      qty: m.qty,
      reason: m.reason,
      kind: m.kind,
      actor: m.actor,
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
          posId: x.pos_id,
        })),
      stations: rows("stations")
        .sort((a, b) => a.id - b.id)
        .map((x) => ({
          id: x.id,
          name: x.name,
          departments: x.departments,
          areas: x.areas,
          active: x.active,
          backupId: x.backup_id,
          printerId: x.printer_id,
          deviceSeenAt: iso(x.device_seen_at),
        })),
      pointsOfSale: rows("points_of_sale")
        .sort((a, b) => a.id - b.id)
        .map((k) => ({ id: k.id, name: k.name, areas: k.areas })),
      refunds,
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
          void: k.void,
          kind: k.kind,
          note: k.note,
          allergy: k.allergy,
          station: k.station_id,
          posId: k.pos_id,
          transferTo: k.transfer_to,
          transferBy: k.transfer_by,
          transferAt: iso(k.transfer_at),
        }))
        .sort((a, b) => a.date.localeCompare(b.date) || a.department.localeCompare(b.department)),
      openShifts: shifts.filter((s) => !s.closed).sort((a, b) => a.posId - b.posId),
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
      `INSERT INTO bluebar.products(id,name,category,price,stock,department,min_stock,available,extras) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT(id) DO UPDATE SET name=$2,category=$3,price=$4,stock=$5,department=$6,min_stock=$7,available=$8,extras=$9`,
      [p.id, p.name, p.category, p.price, p.stock, p.department || null, p.minStock ?? 10, p.available !== false, JSON.stringify(p.extras || [])],
    );
  // Tills first: waiters, shifts and printers reference them; a removed till's
  // waiters and printers were already moved off it (pos.delete).
  for (const k of next.pointsOfSale.filter((k) => changed(previous.pointsOfSale.find((x) => x.id === k.id), k)))
    await client.query(
      "INSERT INTO bluebar.points_of_sale(id,name,areas) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET name=$2,areas=$3",
      [k.id, k.name, k.areas],
    );
  for (const w of next.waiters.filter((w) =>
    changed(
      previous.waiters.find((x) => x.id === w.id),
      w,
    ),
  ))
    await client.query(
      "INSERT INTO bluebar.waiters(id,name,active,pos_id) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=$2,active=$3,pos_id=$4",
      [w.id, w.name, w.active, w.posId ?? null],
    );
  const oldShifts = [...previous.shifts, ...previous.openShifts];
  for (const s of [...next.shifts, ...next.openShifts].filter(
    (s) =>
      changed(
        oldShifts.find((x) => x.id === s.id),
        s,
      ),
  ))
    await client.query(
      `INSERT INTO bluebar.shifts(id,opened,opening,closed,counted,expected,difference,opened_by,closed_by,note,counted_detail,pos_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
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
        s.posId,
      ],
    );
  // Cash movements are only ever added, and only to an open shift.
  for (const shift of next.openShifts) {
    const before = previous.openShifts.find((x) => x.id === shift.id)?.cashMovements || [];
    for (const m of (shift.cashMovements || []).filter((m) => !before.some((x) => x.id === m.id)))
      await client.query(
        "INSERT INTO bluebar.cash_movements(id,shift_id,kind,amount,reason,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [m.id, shift.id, m.kind, m.amount, m.reason, m.by, m.date],
      );
  }
  for (const t of next.tables.filter((t) =>
    changed(
      previous.tables.find((x) => x.id === t.id),
      t,
    ),
  )) {
    const layout = [
      t.id, t.area, t.shape || null, t.active, t.waiter || null,
      t.posX, t.posY, t.width, t.height, t.rotation, t.seats, t.occupiedSince || null,
      t.guests || null, t.discount ? JSON.stringify(t.discount) : null,
      t.note || "", t.allergy || "", t.course || 1,
    ];
    if (previous.tables.some((x) => x.id === t.id))
      await client.query(
        `UPDATE bluebar.dining_tables SET area=$2,shape=$3,active=$4,waiter_id=$5,
           pos_x=$6,pos_y=$7,width=$8,height=$9,rotation=$10,seats=$11,occupied_since=$12,guests=$13,discount=$14,
           note=$15,allergy=$16,course=$17
         WHERE id=$1`,
        layout,
      );
    else
      await client.query(
        `INSERT INTO bluebar.dining_tables(id,area,shape,active,waiter_id,pos_x,pos_y,width,height,rotation,seats,occupied_since,guests,discount,note,allergy,course)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        layout,
      );
    await client.query("DELETE FROM bluebar.order_lines WHERE table_id=$1", [
      t.id,
    ]);
    for (const l of t.lines)
      await client.query(
        `INSERT INTO bluebar.order_lines(table_id,line_key,product_id,name,price,qty,sent,comp,note,allergy,extras,course,hold)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [t.id, l.key || `p${l.id}`, l.id, l.name, l.price, l.qty, l.sent || 0, l.comp || 0,
          l.note || "", l.allergy || "", JSON.stringify(l.extras || []), l.course || 0, Boolean(l.hold)],
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
      `INSERT INTO bluebar.invoices(id,table_id,waiter_id,shift_id,total,method,created_at,status,
         subtotal,comps,discount,discount_reason,cash_amount,card_amount,tip_cash,tip_card,guests)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [i.id, i.table, i.waiter, i.shiftId, i.total, i.method, i.date, i.status,
        i.subtotal ?? i.total, i.comps || 0, i.discount || 0, i.discountReason || null,
        i.cash ?? (i.method === "Cash" ? i.total : 0), i.card ?? (i.method === "Kartë" ? i.total : 0),
        i.tipCash || 0, i.tipCard || 0, i.guests || null],
    );
    for (const l of i.lines)
      await client.query(
        "INSERT INTO bluebar.invoice_lines(invoice_id,line_key,product_id,name,price,qty,comp,extras) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [i.id, l.key || `p${l.id}`, l.id, l.name, l.price, l.qty, l.comp || 0, JSON.stringify(l.extras || [])],
      );
  }
  for (const k of previous.tickets.filter((k) => !next.tickets.some((x) => x.id === k.id)))
    await client.query("DELETE FROM bluebar.station_tickets WHERE id=$1", [k.id]);
  for (const k of next.tickets.filter((k) =>
    changed(previous.tickets.find((x) => x.id === k.id), k),
  ))
    await client.query(
      `INSERT INTO bluebar.station_tickets(id,table_id,invoice_id,round,department,waiter_id,lines,created_at,done_at,cancelled_at,void,
         station_id,pos_id,transfer_to,transfer_by,transfer_at,kind,note,allergy)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT(id) DO UPDATE SET table_id=$2, invoice_id=$3, done_at=$9, cancelled_at=$10,
         station_id=$12, transfer_to=$14, transfer_by=$15, transfer_at=$16`,
      [k.id, k.table, k.invoice || null, k.round, k.department, k.waiter || null,
        JSON.stringify(k.lines), k.date, k.doneAt || null, k.cancelledAt || null, k.void === true,
        k.station ?? null, k.posId ?? null, k.transferTo ?? null, k.transferBy ?? null, k.transferAt ?? null,
        k.kind || (k.void ? "void" : "order"), k.note || "", k.allergy || ""],
    );
  for (const x of previous.printers.filter((x) => !next.printers.some((y) => y.id === x.id)))
    await client.query("DELETE FROM bluebar.printers WHERE id=$1", [x.id]);
  for (const x of next.printers.filter((x) => changed(previous.printers.find((y) => y.id === x.id), x)))
    await client.query(
      `INSERT INTO bluebar.printers(id,name,host,port,width,departments,receipts,ascii,cutter,pos_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT(id) DO UPDATE SET name=$2,host=$3,port=$4,width=$5,departments=$6,receipts=$7,ascii=$8,cutter=$9,pos_id=$10`,
      [x.id, x.name, x.host, x.port, x.width, x.departments, x.receipts, x.ascii === true, x.cutter !== false, x.posId ?? null],
    );
  for (const k of previous.pointsOfSale.filter((k) => !next.pointsOfSale.some((x) => x.id === k.id)))
    await client.query("DELETE FROM bluebar.points_of_sale WHERE id=$1", [k.id]);
  // Stations: backups reference other stations, so insert/update without the backup
  // first, then set backups once every row exists.
  const nextStations = next.stations || [];
  const prevStations = previous.stations || [];
  const changedStations = nextStations.filter((x) => changed(prevStations.find((y) => y.id === x.id), x));
  for (const x of changedStations)
    await client.query(
      `INSERT INTO bluebar.stations(id,name,departments,areas,active,printer_id) VALUES($1,$2,$3,$4,$5,$6)
       ON CONFLICT(id) DO UPDATE SET name=$2,departments=$3,areas=$4,active=$5,printer_id=$6`,
      [x.id, x.name, x.departments, x.areas, x.active, x.printerId ?? null],
    );
  for (const x of changedStations)
    await client.query("UPDATE bluebar.stations SET backup_id=$2 WHERE id=$1", [x.id, x.backupId ?? null]);
  for (const x of prevStations.filter((x) => !nextStations.some((y) => y.id === x.id)))
    await client.query("DELETE FROM bluebar.stations WHERE id=$1", [x.id]);
  // Print jobs follow from what just changed, in the same transaction: a sale can't
  // exist without its cashier job, nor a station ticket without its printer job.
  const enqueue = (printer, kind, ref, waitFiscal = false) =>
    printer &&
    client.query(
      "INSERT INTO bluebar.print_jobs(id,printer_id,kind,ref,wait_fiscal) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), printer.id, kind, String(ref), waitFiscal],
    );
  // A ticket sent to a station prints on that station's printer (none: a Repartet
  // screen shows it); without stations, on its department's printer for its till.
  const stationPrinter = (k, stationId = k.station) =>
    stationId
      ? next.printers.find((x) => x.id === nextStations.find((s) => s.id === stationId)?.printerId)
      : printerFor(next.printers, ticketPos(next, k), k.department);
  for (const k of next.tickets) {
    const before = previous.tickets.find((x) => x.id === k.id);
    if (!before) await enqueue(stationPrinter(k), "ticket", k.id);
    else if (!before.cancelledAt && k.cancelledAt) await enqueue(stationPrinter(k), "cancel", k.id);
    else if (before.station !== k.station) {
      // Accepted transfer: the new station prints it, the old one gets "TRANSFERUAR".
      await enqueue(stationPrinter(k), "ticket", k.id);
      await enqueue(stationPrinter(k, before.station), "moved", k.id);
    }
  }
  const shiftPos = (id) => next.openShifts.find((s) => s.id === id)?.posId;
  for (const i of next.invoices.filter((i) => !previous.invoices.some((x) => x.id === i.id)))
    await enqueue(printerFor(next.printers, shiftPos(i.shiftId)), "invoice", i.id, Boolean(i.fiscalRequested));
  // Partial payments follow their bill (a moved bill takes them along); once the bill
  // settles they're part of its invoice and leave this table.
  const nextPayments = next.tables.flatMap((t) => (t.payments || []).map((x) => ({ ...x, table: t.id })));
  const prevPayments = previous.tables.flatMap((t) => (t.payments || []).map((x) => ({ ...x, table: t.id })));
  for (const x of prevPayments.filter((x) => !nextPayments.some((y) => y.id === x.id)))
    await client.query("DELETE FROM bluebar.order_payments WHERE id=$1", [x.id]);
  for (const x of nextPayments.filter((x) => prevPayments.find((y) => y.id === x.id)?.table !== x.table))
    await client.query(
      `INSERT INTO bluebar.order_payments(id,table_id,shift_id,method,amount,tip,actor,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(id) DO UPDATE SET table_id=$2`,
      [x.id, x.table, x.shiftId, x.method, x.amount, x.tip || 0, x.by || null, x.date],
    );
  for (const r of (next.refunds || []).filter((r) => !(previous.refunds || []).some((x) => x.id === r.id)))
    await client.query(
      "INSERT INTO bluebar.refunds(id,invoice_id,shift_id,method,amount,reason,actor,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [r.id, r.invoiceId, r.shiftId, r.method, r.amount, r.reason, r.by || null, r.date],
    );
  // After the invoices: a 'pay' event references its invoice.
  for (const e of (next.events || []).slice((previous.events || []).length))
    await client.query(
      `INSERT INTO bluebar.order_events(table_id,kind,detail,actor,invoice_id,created_at,amount,pos_id,duration_s)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [e.table, e.kind, e.detail, e.actor, e.invoice, e.date, e.amount ?? null, e.posId ?? null, e.duration ?? null],
    );
  for (const m of next.movements.slice(previous.movements.length))
    await client.query(
      "INSERT INTO bluebar.stock_movements(product,qty,reason,created_at,kind,actor) VALUES($1,$2,$3,$4,$5,$6)",
      [m.product, m.qty, m.reason, m.date || new Date().toISOString(), m.kind || "adjust", m.actor || null],
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
        t.pos_x, t.pos_y, t.width, t.height, t.rotation, t.seats, t.occupied_since, t.guests, t.discount,
        t.note, t.allergy, t.course,
        COALESCE(
          jsonb_agg(jsonb_build_object(
            'key', l.line_key, 'id', l.product_id, 'name', l.name, 'price', l.price, 'qty', l.qty, 'sent', l.sent,
            'comp', l.comp, 'note', l.note, 'allergy', l.allergy, 'extras', l.extras, 'course', l.course, 'hold', l.hold
          ) ORDER BY l.product_id, l.line_key) FILTER (WHERE l.product_id IS NOT NULL),
          '[]'::jsonb
        ) AS lines,
        (SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', x.id, 'method', x.method, 'amount', x.amount, 'tip', x.tip, 'by', x.actor,
            'date', x.created_at, 'shiftId', x.shift_id) ORDER BY x.created_at), '[]'::jsonb)
         FROM bluebar.order_payments x WHERE x.table_id = t.id) AS payments
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
    guests: row.guests,
    discount: row.discount,
    note: row.note,
    allergy: row.allergy,
    course: row.course,
    payments: row.payments.map((x) => ({ ...x, date: iso(x.date) })),
    lines: row.lines,
  };
}

// Thrown inside the fast path to hand the command to the full one (after its rollback).
const FULL_PATH = Symbol("full path");
const logEvent = (client, tableId, kind, detail, actor) =>
  client.query("INSERT INTO bluebar.order_events(table_id,kind,detail,actor) VALUES($1,$2,$3,$4)", [
    tableId, kind, detail.slice(0, 300), actor?.name || null,
  ]);
// The high-frequency POS path reads and returns only the affected order.
// Full snapshots remain the source of truth for initial load and management actions.
export async function executeOrderPatch(pool, command, actor = null) {
  if (!["order.add", "order.remove"].includes(command.type))
    throw new AppError("Veprimi i porosisë është i pavlefshëm.");
  const { tableId, productId, waiterId, lineKey, course = 0, ...details } = command.payload || {};
  // A line named only by its key: the full path finds it.
  if (command.type === "order.remove" && productId === undefined && lineKey !== undefined) return execute(pool, command, actor);
  if (!Number.isSafeInteger(tableId) || tableId < 1 ||
      !Number.isSafeInteger(productId) || productId < 1 ||
      (command.type === "order.add" && (!Number.isSafeInteger(waiterId) || waiterId < 1)))
    throw new AppError("Vlerë numerike e pavlefshme.");
  // The fast path covers a plain unit (optionally of a course) and removing an unsent one;
  // anything with a note, allergy, extras or hold goes through the full command path.
  if (Object.keys(details).length || !Number.isInteger(course) || course < 0 || course > 3 ||
      (lineKey !== undefined && (typeof lineKey !== "string" || lineKey.length > 40)))
    return execute(pool, command, actor);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const hash = createHash("sha256")
      .update(JSON.stringify({ type: command.type, payload: command.payload }))
      .digest("hex");
    const context = (
      await client.query(
        `SELECT c.version, cmd.payload_hash, cmd.result,
          EXISTS(SELECT 1 FROM bluebar.shifts WHERE closed IS NULL AND pos_id = tp.id) AS shift_open,
          tp.id AS table_pos, tp.name AS table_pos_name, aw.pos_id AS actor_pos,
          t.id AS table_id, t.active AS table_active,
          w.active AS waiter_active,
          p.name AS product_name, p.price AS product_price, p.stock AS product_stock, p.available AS product_available,
          COALESCE((SELECT sum(qty) FROM bluebar.order_lines WHERE product_id = $4), 0)::integer AS reserved,
          line.line_key, line.name AS line_name, line.qty AS line_qty, line.sent AS line_sent,
          EXISTS(SELECT 1 FROM bluebar.order_payments WHERE table_id = $2) AS has_payments,
          (SELECT count(*) FROM bluebar.order_lines WHERE table_id = $2)::integer AS table_line_count
         FROM bluebar.control c
         LEFT JOIN bluebar.commands cmd ON cmd.id = $1
         LEFT JOIN bluebar.dining_tables t ON t.id = $2
         LEFT JOIN bluebar.waiters w ON w.id = $3
         LEFT JOIN bluebar.products p ON p.id = $4
         -- The line: the one named; for an add, the product's plain line of that course.
         LEFT JOIN LATERAL (
           SELECT * FROM bluebar.order_lines l
           WHERE l.table_id = $2 AND CASE
             WHEN $6::text IS NOT NULL THEN l.line_key = $6
             WHEN $8 THEN l.product_id = $4 AND l.note = '' AND l.allergy = '' AND l.extras = '[]'::jsonb
               AND l.course = $7 AND NOT l.hold AND l.price = p.price
             ELSE l.product_id = $4 END
           ORDER BY l.line_key LIMIT 1
         ) line ON true
         LEFT JOIN bluebar.waiters aw ON aw.id = $5
         -- Same rule as posOf(): the till claiming the table's area, else the first till.
         LEFT JOIN LATERAL (
           SELECT id, name FROM bluebar.points_of_sale
           ORDER BY (t.area = ANY(areas)) DESC NULLS LAST, id LIMIT 1
         ) tp ON true
         WHERE c.id = 1
         FOR UPDATE OF c`,
        [command.id, tableId, waiterId || null, productId, actor?.role === "waiter" ? actor.waiterId : null,
          lineKey ?? null, course, command.type === "order.add"],
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
    if (context.actor_pos && context.actor_pos !== context.table_pos)
      throw new AppError(`Kjo tavolinë i përket kasës "${context.table_pos_name}".`, 403);

    if (command.type === "order.add") {
      if (!context.waiter_active) throw new AppError("Zgjidhni një kamarier aktiv.");
      if (context.product_name && context.product_available === false)
        throw new AppError(`${context.product_name} nuk është në dispozicion tani.`);
      if (!context.product_name || context.reserved >= context.product_stock)
        throw new AppError("Nuk ka stok të disponueshëm për këtë produkt.");
      if (context.line_key)
        await client.query("UPDATE bluebar.order_lines SET qty = qty + 1 WHERE table_id = $1 AND line_key = $2", [tableId, context.line_key]);
      else {
        const keys = (await client.query("SELECT line_key AS key FROM bluebar.order_lines WHERE table_id = $1", [tableId])).rows;
        await client.query(
          `INSERT INTO bluebar.order_lines(table_id, line_key, product_id, name, price, qty, course) VALUES($1, $2, $3, $4, $5, 1, $6)`,
          [tableId, newLineKey(keys, productId), productId, context.product_name, context.product_price, course],
        );
      }
      await client.query(
        "UPDATE bluebar.dining_tables SET waiter_id = $2, occupied_since = COALESCE(occupied_since, now()) WHERE id = $1",
        [tableId, waiterId],
      );
      await logEvent(client, tableId, "add", `+1 × ${context.product_name}`, actor);
    } else {
      if (!context.line_key) throw new AppError("Produkti nuk është në porosi.");
      // A unit the station already got is being prepared; only a manager may void it.
      if (actor?.role === "waiter" && context.line_sent >= context.line_qty)
        throw new AppError("Ky artikull është dërguar tashmë në repart. Vetëm menaxheri mund ta heqë.", 403);
      // Voiding a sent unit sends the station a void slip: the full command path does that.
      // So does a bill with payments taken: it must not drop below what's paid.
      if (context.line_sent >= context.line_qty || context.has_payments) throw FULL_PATH;
      await client.query(
        `WITH removed AS (
           DELETE FROM bluebar.order_lines
           WHERE table_id = $1 AND line_key = $2 AND qty = 1
           RETURNING 1
         )
         UPDATE bluebar.order_lines SET qty = qty - 1, sent = LEAST(sent, qty - 1), comp = LEAST(comp, qty - 1)
         WHERE table_id = $1 AND line_key = $2 AND qty > 1`,
        [tableId, context.line_key],
      );
      await logEvent(client, tableId, "remove", `−1 × ${context.line_name}`, actor);
      // Data-modifying CTEs in one statement share a snapshot and can't see each
      // other's writes, so "is the table empty now" is computed here from the
      // counts already read under FOR UPDATE, not re-queried after the delete.
      if (context.line_qty === 1 && context.table_line_count === 1) {
        await client.query("UPDATE bluebar.dining_tables SET occupied_since = NULL, note = '', allergy = '', course = 1 WHERE id = $1", [tableId]);
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
    if (error !== FULL_PATH) throw error;
  } finally {
    client.release();
  }
  return execute(pool, command, actor);
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
    const { events, ...state } = next.state;
    return { state, version, revision, result: next.result };
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
