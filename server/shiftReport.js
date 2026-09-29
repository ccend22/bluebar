// A shift's report, computed in the database — so any past shift can be reported
// without the browser holding every invoice.
const iso = (v) => (v == null ? null : new Date(v).toISOString());

export async function shiftReport(db, id) {
  const s = (await db.query("SELECT * FROM bluebar.shifts WHERE id = $1", [id])).rows[0];
  if (!s) return null;
  const totals = (
    await db.query(
      `SELECT count(*)::integer AS count,
         COALESCE(sum(total) FILTER (WHERE method = 'Cash'), 0)::bigint AS cash,
         COALESCE(sum(total) FILTER (WHERE method = 'Kartë'), 0)::bigint AS card,
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
         COALESCE(sum(i.total) FILTER (WHERE i.method = 'Cash'), 0)::bigint AS cash
       FROM bluebar.invoices i LEFT JOIN bluebar.waiters w ON w.id = i.waiter_id
       WHERE i.shift_id = $1 GROUP BY w.name ORDER BY total DESC`,
      [id],
    )
  ).rows.map((r) => ({ name: r.name, count: r.count, total: Number(r.total), cash: Number(r.cash) }));
  const cashMovements = (
    await db.query("SELECT * FROM bluebar.cash_movements WHERE shift_id = $1 ORDER BY created_at, id", [id])
  ).rows.map((m) => ({ kind: m.kind, amount: m.amount, reason: m.reason, by: m.created_by, date: iso(m.created_at) }));
  const cash = Number(totals.cash);
  const cashIn = cashMovements.filter((m) => m.kind === "in").reduce((sum, m) => sum + m.amount, 0);
  const cashOut = cashMovements.filter((m) => m.kind === "out").reduce((sum, m) => sum + m.amount, 0);
  return {
    shift: {
      id: s.id,
      opened: iso(s.opened),
      openedBy: s.opened_by,
      opening: s.opening,
      closed: iso(s.closed),
      closedBy: s.closed_by,
      // Still open: what the drawer should hold right now.
      expected: s.closed ? Number(s.expected) : s.opening + cash + cashIn - cashOut,
      counted: s.counted,
      countedDetail: s.counted_detail,
      difference: s.difference == null ? null : Number(s.difference),
      note: s.note,
    },
    invoiceCount: totals.count,
    fiscalized: totals.fiscalized,
    cash,
    card: Number(totals.card),
    cashIn,
    cashOut,
    cashMovements,
    topProducts,
    byWaiter,
  };
}
