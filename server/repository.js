import { createHash } from "node:crypto";
import { applyCommand, AppError } from "./commands.js";
const iso = (v) => (v == null ? null : new Date(v).toISOString());
export async function loadState(client) {
  // Sequential queries on the same transaction connection produce one consistent snapshot.
  const rows = async (table) =>
    (await client.query(`SELECT * FROM bluebar.${table}`)).rows;
  const control = (await rows("control"))[0];
  const categories = (await rows("categories")).map((r) => r.name).sort();
  const products = (await rows("products")).sort((a, b) => a.id - b.id);
  const waiters = (await rows("waiters")).sort((a, b) => a.id - b.id);
  const lines = await rows("order_lines");
  const tables = (await rows("dining_tables"))
    .sort((a, b) => a.id - b.id)
    .map((t) => ({
      id: t.id,
      area: t.area,
      shape: t.shape,
      active: t.active,
      waiter: t.waiter_id,
      lines: lines
        .filter((l) => l.table_id === t.id)
        .sort((a, b) => a.product_id - b.product_id)
        .map((l) => ({
          id: l.product_id,
          name: l.name,
          price: l.price,
          qty: l.qty,
        })),
    }));
  const shifts = (await rows("shifts"))
    .map((s) => ({
      id: s.id,
      opened: iso(s.opened),
      opening: s.opening,
      ...(s.closed
        ? {
            closed: iso(s.closed),
            counted: s.counted,
            expected: Number(s.expected),
            difference: Number(s.difference),
          }
        : {}),
    }))
    .sort((a, b) => b.id - a.id);
  const invoiceLines = await rows("invoice_lines");
  const invoices = (await rows("invoices"))
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
  const movements = (await rows("stock_movements"))
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((m) => ({
      product: m.product,
      qty: m.qty,
      reason: m.reason,
      date: iso(m.created_at),
    }));
  return {
    version: control.version,
    state: {
      categories,
      products,
      waiters,
      tables,
      invoices,
      movements,
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
  for (const p of next.products.filter((p) =>
    changed(
      previous.products.find((x) => x.id === p.id),
      p,
    ),
  ))
    await client.query(
      "INSERT INTO bluebar.products(id,name,category,price,stock) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET name=$2,category=$3,price=$4,stock=$5",
      [p.id, p.name, p.category, p.price, p.stock],
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
      "INSERT INTO bluebar.shifts(id,opened,opening,closed,counted,expected,difference) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET closed=$4,counted=$5,expected=$6,difference=$7",
      [
        s.id,
        s.opened,
        s.opening,
        s.closed || null,
        s.counted ?? null,
        s.expected ?? null,
        s.difference ?? null,
      ],
    );
  for (const t of next.tables.filter((t) =>
    changed(
      previous.tables.find((x) => x.id === t.id),
      t,
    ),
  )) {
    if (previous.tables.some((x) => x.id === t.id))
      await client.query(
        "UPDATE bluebar.dining_tables SET area=$2,shape=$3,active=$4,waiter_id=$5 WHERE id=$1",
        [t.id, t.area, t.shape || null, t.active, t.waiter || null],
      );
    else
      await client.query(
        "INSERT INTO bluebar.dining_tables(id,area,shape,active,waiter_id) VALUES($1,$2,$3,$4,$5)",
        [t.id, t.area, t.shape || null, t.active, t.waiter || null],
      );
    await client.query("DELETE FROM bluebar.order_lines WHERE table_id=$1", [
      t.id,
    ]);
    for (const l of t.lines)
      await client.query(
        "INSERT INTO bluebar.order_lines(table_id,product_id,name,price,qty) VALUES($1,$2,$3,$4,$5)",
        [t.id, l.id, l.name, l.price, l.qty],
      );
  }
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
export async function execute(pool, command) {
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
      next = applyCommand(snapshot.state, command.type, command.payload);
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError(e.message);
    }
    await persist(client, snapshot.state, next.state);
    const version = snapshot.version + 1;
    await client.query("UPDATE bluebar.control SET version=$1 WHERE id=1", [
      version,
    ]);
    await client.query(
      "INSERT INTO bluebar.commands(id,payload_hash,type,result) VALUES($1,$2,$3,$4)",
      [command.id, hash, command.type, JSON.stringify(next.result)],
    );
    await client.query("COMMIT");
    return { state: next.state, version, result: next.result };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
