// Reports for a period, computed in the database so they never need every invoice in
// the browser's state. Three different things, kept apart:
//  - sales: what was sold (invoices), split by how it was collected (cash / bank);
//  - the drawer: per shift, the cash that should be there and what was counted;
//  - corrections and service: cancellations, voids, stock losses, how long things took.
// basis "day": invoices dated in the period. basis "shift": invoices of shifts opened
// in the period — a shift that runs past midnight belongs to the day it opened.
const iso = (v) => (v == null ? null : new Date(v).toISOString());

export async function report(db, { from, to, basis = "day", pos, shift, area, waiter }) {
  const params = [from, to];
  const where = [basis === "shift" ? "s.opened >= $1 AND s.opened < $2" : "i.created_at >= $1 AND i.created_at < $2"];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (pos) add("s.pos_id = ?", pos);
  if (shift) add("i.shift_id = ?", shift);
  if (area) add("t.area = ?", area);
  if (waiter) add("i.waiter_id = ?", waiter);
  const scope = `FROM bluebar.invoices i
    JOIN bluebar.shifts s ON s.id = i.shift_id
    JOIN bluebar.dining_tables t ON t.id = i.table_id
    WHERE ${where.join(" AND ")}`;

  const invoices = (
    await db.query(
      `SELECT i.id, i.created_at, i.total, i.method, i.table_id, t.area, i.waiter_id, s.pos_id, i.shift_id,
         i.cash_amount, i.card_amount, i.tip_cash, i.tip_card, i.discount, i.comps, i.guests ${scope}
       ORDER BY i.id LIMIT 20000`,
      params,
    )
  ).rows.map((r) => ({
    id: r.id, date: iso(r.created_at), total: Number(r.total), method: r.method, table: r.table_id,
    area: r.area, waiter: r.waiter_id, posId: r.pos_id, shiftId: r.shift_id,
    cash: Number(r.cash_amount), card: Number(r.card_amount), tip: Number(r.tip_cash) + Number(r.tip_card),
    discount: Number(r.discount), comps: Number(r.comps), guests: r.guests,
  }));
  const topProducts = (
    await db.query(
      `SELECT l.name, sum(l.qty)::integer AS qty, sum(l.qty * l.price)::bigint AS total
       FROM bluebar.invoice_lines l WHERE l.invoice_id IN (SELECT i.id ${scope})
       GROUP BY l.name ORDER BY qty DESC, total DESC LIMIT 8`,
      params,
    )
  ).rows.map((r) => ({ name: r.name, qty: r.qty, total: Number(r.total) }));

  // How long an order took, first item to payment.
  const orderTimes = invoices.length
    ? (
        await db.query(
          `WITH closes AS (
             SELECT id, table_id, created_at, invoice_id,
               LAG(id) OVER (PARTITION BY table_id ORDER BY id) AS prev_id
             FROM bluebar.order_events WHERE kind IN ('pay', 'cancel'))
           SELECT EXTRACT(EPOCH FROM c.created_at - min(e.created_at))::integer AS secs
           FROM closes c JOIN bluebar.order_events e
             ON e.table_id = c.table_id AND e.id > COALESCE(c.prev_id, 0) AND e.id <= c.id
           WHERE c.invoice_id = ANY($1) GROUP BY c.id, c.created_at`,
          [invoices.map((i) => i.id)],
        )
      ).rows.map((r) => r.secs)
    : [];

  // Events (cancellations, voids, preparation) by when they happened; filtered by till
  // and zone. Not by waiter: these are mostly the manager's and the stations' actions.
  const eventParams = [from, to];
  const eventWhere = ["e.created_at >= $1 AND e.created_at < $2"];
  if (pos) eventWhere.push(`e.pos_id = $${eventParams.push(pos)}`);
  if (area) eventWhere.push(`t.area = $${eventParams.push(area)}`);
  const events = (
    await db.query(
      `SELECT e.kind, e.detail, e.actor, e.amount, e.duration_s, e.created_at, e.table_id
       FROM bluebar.order_events e JOIN bluebar.dining_tables t ON t.id = e.table_id
       WHERE e.kind IN ('cancel', 'void', 'ready') AND ${eventWhere.join(" AND ")} ORDER BY e.id`,
      eventParams,
    )
  ).rows;
  const corrections = events
    .filter((e) => e.kind !== "ready")
    .map((e) => ({ kind: e.kind, detail: e.detail, actor: e.actor, amount: e.amount ?? 0, date: iso(e.created_at), table: e.table_id }));
  const prep = new Map();
  for (const e of events.filter((e) => e.kind === "ready")) {
    const place = e.detail.split(" gati:")[0];
    prep.set(place, [...(prep.get(place) || []), e.duration_s]);
  }

  // The drawer: shifts overlapping the period (an overnight shift shows on both days).
  const shiftParams = [from, to];
  const shiftWhere = ["s.opened < $2 AND (s.closed IS NULL OR s.closed >= $1)"];
  if (pos) shiftWhere.push(`s.pos_id = $${shiftParams.push(pos)}`);
  if (shift) shiftWhere.push(`s.id = $${shiftParams.push(shift)}`);
  const shifts = (
    await db.query(
      `SELECT s.*, k.name AS pos_name,
         COALESCE((SELECT sum(cash_amount) FROM bluebar.invoices WHERE shift_id = s.id), 0)::bigint
           + COALESCE((SELECT sum(amount) FROM bluebar.order_payments WHERE shift_id = s.id AND method = 'Cash'), 0)::bigint AS cash,
         COALESCE((SELECT sum(card_amount) FROM bluebar.invoices WHERE shift_id = s.id), 0)::bigint
           + COALESCE((SELECT sum(amount) FROM bluebar.order_payments WHERE shift_id = s.id AND method = 'Kartë'), 0)::bigint AS card,
         COALESCE((SELECT sum(tip_cash) FROM bluebar.invoices WHERE shift_id = s.id), 0)::bigint
           + COALESCE((SELECT sum(tip) FROM bluebar.order_payments WHERE shift_id = s.id AND method = 'Cash'), 0)::bigint AS tips_cash,
         COALESCE((SELECT sum(amount) FROM bluebar.refunds WHERE shift_id = s.id AND method = 'Cash'), 0)::bigint AS refunds_cash,
         COALESCE((SELECT sum(amount) FROM bluebar.cash_movements WHERE shift_id = s.id AND kind = 'in'), 0)::bigint AS cash_in,
         COALESCE((SELECT sum(amount) FROM bluebar.cash_movements WHERE shift_id = s.id AND kind = 'out'), 0)::bigint AS cash_out
       FROM bluebar.shifts s JOIN bluebar.points_of_sale k ON k.id = s.pos_id
       WHERE ${shiftWhere.join(" AND ")} ORDER BY s.id`,
      shiftParams,
    )
  ).rows.map((s) => {
    const cash = Number(s.cash), cashIn = Number(s.cash_in), cashOut = Number(s.cash_out);
    const tipsCash = Number(s.tips_cash), refundsCash = Number(s.refunds_cash);
    return {
      id: s.id, posId: s.pos_id, posName: s.pos_name, opened: iso(s.opened), closed: iso(s.closed),
      openedBy: s.opened_by, closedBy: s.closed_by,
      opening: s.opening, cash, card: Number(s.card), cashIn, cashOut, tipsCash, refundsCash,
      expected: s.closed ? Number(s.expected) : s.opening + cash + tipsCash + cashIn - cashOut - refundsCash,
      counted: s.counted, difference: s.difference == null ? null : Number(s.difference),
    };
  });

  const losses = (
    await db.query(
      `SELECT product, qty, reason, actor, created_at FROM bluebar.stock_movements
       WHERE kind = 'loss' AND created_at >= $1 AND created_at < $2 ORDER BY id`,
      [from, to],
    )
  ).rows.map((m) => ({ product: m.product, qty: m.qty, reason: m.reason, actor: m.actor, date: iso(m.created_at) }));

  // Refunds given in the period (by when they were given), for the filtered till/zone.
  const refundParams = [from, to];
  const refundWhere = ["r.created_at >= $1 AND r.created_at < $2"];
  if (pos) refundWhere.push(`s.pos_id = $${refundParams.push(pos)}`);
  if (area) refundWhere.push(`t.area = $${refundParams.push(area)}`);
  const refunds = (
    await db.query(
      `SELECT r.amount, r.method, r.reason, r.actor, r.created_at, r.invoice_id FROM bluebar.refunds r
       JOIN bluebar.invoices i ON i.id = r.invoice_id JOIN bluebar.shifts s ON s.id = i.shift_id
       JOIN bluebar.dining_tables t ON t.id = i.table_id
       WHERE ${refundWhere.join(" AND ")} ORDER BY r.created_at`,
      refundParams,
    )
  ).rows.map((r) => ({ amount: r.amount, method: r.method, reason: r.reason, actor: r.actor, date: iso(r.created_at), invoice: r.invoice_id }));

  const avg = (list) => (list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null);
  return {
    invoices,
    topProducts,
    shifts,
    corrections,
    losses,
    refunds,
    service: {
      orderSeconds: avg(orderTimes),
      orders: orderTimes.length,
      prep: [...prep].map(([place, list]) => ({ place, seconds: avg(list), tickets: list.length })),
    },
  };
}
