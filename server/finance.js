// Financat: a period's money in one place, computed in the database.
//  - income: what was sold (invoices) less what was refunded, by how it was paid;
//  - spending: the expenses the manager entered (approved, or pending) and the cash taken out
//    of a till during a shift ("Turnet" → dalje), which is spending paid in cash;
//  - by category: sales by the products' menu category, spending by its own category.
// All in whole Lek. Methods: "Cash", and "Bankë" for cards and bank transfers alike.
export async function finance(db, { from, to }) {
  const range = [from, to];
  const one = async (sql, params = range) => (await db.query(sql, params)).rows;
  const [sales] = await one(
    `SELECT COALESCE(sum(total), 0)::bigint AS total, COALESCE(sum(cash_amount), 0)::bigint AS cash,
       COALESCE(sum(card_amount), 0)::bigint AS card, count(*)::integer AS count
     FROM bluebar.invoices WHERE created_at >= $1 AND created_at < $2`,
  );
  const refunds = await one(
    `SELECT method, COALESCE(sum(amount), 0)::bigint AS amount FROM bluebar.refunds
     WHERE created_at >= $1 AND created_at < $2 GROUP BY method`,
  );
  const refunded = (method) => Number(refunds.find((r) => r.method === method)?.amount || 0);
  const expenses = await one(
    `SELECT category, method, status, sum(amount)::bigint AS amount FROM bluebar.expenses
     WHERE spent_at >= $1 AND spent_at < $2 GROUP BY category, method, status`,
  );
  const tillOut = await one(
    `SELECT reason, sum(amount)::bigint AS amount FROM bluebar.cash_movements
     WHERE kind = 'out' AND created_at >= $1 AND created_at < $2 GROUP BY reason`,
  );
  const categories = await one(
    `SELECT COALESCE(p.category, 'Tjetër') AS category, sum(l.qty * l.price)::bigint AS amount
     FROM bluebar.invoice_lines l
     JOIN bluebar.invoices i ON i.id = l.invoice_id
     LEFT JOIN bluebar.products p ON p.id = l.product_id
     WHERE i.created_at >= $1 AND i.created_at < $2 AND l.comp = 0
     GROUP BY 1`,
  );

  const income = { Cash: Number(sales.cash) - refunded("Cash"), Bankë: Number(sales.card) - refunded("Kartë") };
  const spent = { Cash: 0, Bankë: 0 }, pending = { Cash: 0, Bankë: 0 };
  const byCategory = new Map();
  const category = (name) => {
    if (!byCategory.has(name)) byCategory.set(name, { name, income: 0, pending: 0, spent: 0 });
    return byCategory.get(name);
  };
  for (const c of categories) category(c.category).income += Number(c.amount);
  for (const e of expenses) {
    const amount = Number(e.amount);
    if (e.status === "pritje") {
      pending[e.method] += amount;
      category(e.category).pending += amount;
    } else {
      spent[e.method] += amount;
      category(e.category).spent += amount;
    }
  }
  for (const t of tillOut) {
    spent.Cash += Number(t.amount);
    category("Nga arka").spent += Number(t.amount);
  }
  const incomeTotal = income.Cash + income.Bankë;
  const spentTotal = spent.Cash + spent.Bankë;
  // A category's share of all the money that moved (in and out) in the period.
  const moved = [...byCategory.values()].reduce((s, c) => s + c.income + c.spent, 0) || 1;
  const methodsMoved = incomeTotal + spentTotal || 1;
  return {
    invoices: sales.count,
    income: incomeTotal,
    spent: spentTotal,
    pending: pending.Cash + pending.Bankë,
    net: incomeTotal - spentTotal,
    netCash: income.Cash - spent.Cash,
    methods: ["Cash", "Bankë"].map((m) => ({
      method: m, income: income[m], spent: spent[m], pending: pending[m], net: income[m] - spent[m],
      share: (income[m] + spent[m]) / methodsMoved,
    })),
    categories: [...byCategory.values()]
      .map((c) => ({ ...c, share: (c.income + c.spent) / moved }))
      .sort((a, b) => b.income + b.spent - (a.income + a.spent)),
  };
}

// Llogaritë financiare: every account's balance now. Opening balance, plus what flowed in by
// its payment method (sales less refunds, less spending and till cash-outs), plus moves in,
// less moves out.
export async function accounts(db) {
  const rows = (await db.query("SELECT * FROM bluebar.money_accounts ORDER BY grp, id")).rows;
  const one = async (sql) => (await db.query(sql)).rows[0];
  const sales = await one("SELECT COALESCE(sum(cash_amount), 0)::bigint AS cash, COALESCE(sum(card_amount), 0)::bigint AS card FROM bluebar.invoices");
  const refunds = (await db.query("SELECT method, sum(amount)::bigint AS amount FROM bluebar.refunds GROUP BY method")).rows;
  const spent = (await db.query("SELECT method, sum(amount)::bigint AS amount FROM bluebar.expenses WHERE status = 'aprovuar' GROUP BY method")).rows;
  const tillOut = await one("SELECT COALESCE(sum(amount), 0)::bigint AS amount FROM bluebar.cash_movements WHERE kind = 'out'");
  const moves = (await db.query(
    `SELECT a.id, COALESCE((SELECT sum(amount) FROM bluebar.money_moves WHERE to_account = a.id), 0)::bigint AS inflow,
       COALESCE((SELECT sum(amount) FROM bluebar.money_moves WHERE from_account = a.id), 0)::bigint AS outflow
     FROM bluebar.money_accounts a`,
  )).rows;
  const of = (list, method) => Number(list.find((r) => r.method === method)?.amount || 0);
  const flow = {
    Cash: Number(sales.cash) - of(refunds, "Cash") - of(spent, "Cash") - Number(tillOut.amount),
    Bankë: Number(sales.card) - of(refunds, "Kartë") - of(spent, "Bankë"),
  };
  return rows.map((a) => {
    const m = moves.find((x) => x.id === a.id);
    return {
      id: a.id, name: a.name, group: a.grp, kind: a.kind, opening: a.opening, receives: a.receives,
      balance: a.opening + (a.receives ? flow[a.receives] : 0) + Number(m.inflow) - Number(m.outflow),
    };
  });
}
