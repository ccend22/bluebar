// A shift's report, computed in the database — so any past shift can be reported
// without the browser holding every invoice.
const iso = (v) => (v == null ? null : new Date(v).toISOString());

export async function shiftReport(db, id) {
  const s = (
    await db.query(
      `SELECT s.*, k.name AS pos_name, (SELECT count(*) FROM bluebar.points_of_sale) > 1 AS several
       FROM bluebar.shifts s JOIN bluebar.points_of_sale k ON k.id = s.pos_id WHERE s.id = $1`,
      [id],
    )
  ).rows[0];
  if (!s) return null;
  const totals = (
    await db.query(
      `SELECT count(*)::integer AS count,
         COALESCE(sum(cash_amount), 0)::bigint AS cash,
         COALESCE(sum(card_amount), 0)::bigint AS card,
         COALESCE(sum(tip_cash), 0)::bigint AS tip_cash,
         COALESCE(sum(tip_card), 0)::bigint AS tip_card,
         COALESCE(sum(discount), 0)::bigint AS discount,
         COALESCE(sum(comps), 0)::bigint AS comps,
         count(*) FILTER (WHERE fiscal_status = 'fiskalizuar')::integer AS fiscalized
       FROM bluebar.invoices WHERE shift_id = $1`,
      [id],
    )
  ).rows[0];
  const topProducts = (
    await db.query(
      `SELECT l.name, sum(l.qty)::integer AS qty, sum(l.qty * l.price)::bigint AS total
       FROM bluebar.invoice_lines l JOIN bluebar.invoices i ON i.id = l.invoice_id
       WHERE i.shift_id = $1 GROUP BY l.name ORDER BY qty DESC, total DESC LIMIT 5`,
      [id],
    )
  ).rows.map((r) => ({ name: r.name, qty: r.qty, total: Number(r.total) }));
  const byWaiter = (
    await db.query(
      `SELECT COALESCE(w.name, '—') AS name, count(*)::integer AS count, sum(i.total)::bigint AS total,
         COALESCE(sum(i.cash_amount), 0)::bigint AS cash,
         COALESCE(sum(i.tip_cash + i.tip_card), 0)::bigint AS tips
       FROM bluebar.invoices i LEFT JOIN bluebar.waiters w ON w.id = i.waiter_id
       WHERE i.shift_id = $1 GROUP BY w.name ORDER BY total DESC`,
      [id],
    )
  ).rows.map((r) => ({ name: r.name, count: r.count, total: Number(r.total), cash: Number(r.cash), tips: Number(r.tips) }));
  // Partial payments on bills still open (only while the shift is open) are in the till too.
  const open = (
    await db.query(
      `SELECT COALESCE(sum(amount) FILTER (WHERE method = 'Cash'), 0)::bigint AS cash,
         COALESCE(sum(amount) FILTER (WHERE method = 'Kartë'), 0)::bigint AS card,
         COALESCE(sum(tip) FILTER (WHERE method = 'Cash'), 0)::bigint AS tip_cash
       FROM bluebar.order_payments WHERE shift_id = $1`,
      [id],
    )
  ).rows[0];
  const refunds = (
    await db.query(
      `SELECT COALESCE(sum(amount) FILTER (WHERE method = 'Cash'), 0)::bigint AS cash,
         COALESCE(sum(amount) FILTER (WHERE method = 'Kartë'), 0)::bigint AS card
       FROM bluebar.refunds WHERE shift_id = $1`,
      [id],
    )
  ).rows[0];
  const cashMovements = (
    await db.query("SELECT * FROM bluebar.cash_movements WHERE shift_id = $1 ORDER BY created_at, id", [id])
  ).rows.map((m) => ({ kind: m.kind, amount: m.amount, reason: m.reason, by: m.created_by, date: iso(m.created_at) }));
  const cash = Number(totals.cash) + Number(open.cash);
  const tipsCash = Number(totals.tip_cash) + Number(open.tip_cash);
  const refundsCash = Number(refunds.cash);
  const cashIn = cashMovements.filter((m) => m.kind === "in").reduce((sum, m) => sum + m.amount, 0);
  const cashOut = cashMovements.filter((m) => m.kind === "out").reduce((sum, m) => sum + m.amount, 0);
  return {
    shift: {
      id: s.id,
      // Only worth printing when the business has more than one till.
      posId: s.pos_id,
      posName: s.several ? s.pos_name : null,
      opened: iso(s.opened),
      openedBy: s.opened_by,
      opening: s.opening,
      closed: iso(s.closed),
      closedBy: s.closed_by,
      // Still open: what the drawer should hold right now.
      expected: s.closed ? Number(s.expected) : s.opening + cash + tipsCash + cashIn - cashOut - refundsCash,
      counted: s.counted,
      countedDetail: s.counted_detail,
      difference: s.difference == null ? null : Number(s.difference),
      note: s.note,
    },
    invoiceCount: totals.count,
    fiscalized: totals.fiscalized,
    cash,
    card: Number(totals.card) + Number(open.card),
    tipsCash,
    tipsCard: Number(totals.tip_card),
    refundsCash,
    refundsCard: Number(refunds.card),
    discount: Number(totals.discount),
    comps: Number(totals.comps),
    cashIn,
    cashOut,
    cashMovements,
    topProducts,
    byWaiter,
  };
}
