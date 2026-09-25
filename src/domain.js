export const money = (n) =>
  new Intl.NumberFormat("sq-AL", { maximumFractionDigits: 0 }).format(n) +
  " Lek";
export const total = (lines) =>
  lines.reduce((sum, p) => sum + p.price * p.qty, 0);
export function initialState() {
  return {
    products: [
      { id: 1, name: "Espresso", category: "Kafe", price: 100, stock: 120 },
      { id: 2, name: "Cappuccino", category: "Kafe", price: 180, stock: 45 },
      { id: 3, name: "Ujë natyral", category: "Pije", price: 80, stock: 64 },
      {
        id: 4,
        name: "Lëng portokalli",
        category: "Pije",
        price: 250,
        stock: 24,
      },
      { id: 5, name: "Birrë Korça", category: "Birra", price: 250, stock: 36 },
      { id: 6, name: "Birrë Peroni", category: "Birra", price: 300, stock: 8 },
      {
        id: 7,
        name: "Club sandwich",
        category: "Ushqim",
        price: 450,
        stock: 15,
      },
      { id: 8, name: "Tost", category: "Ushqim", price: 200, stock: 20 },
    ],
    categories: ["Kafe", "Pije", "Birra", "Ushqim"],
    waiters: [
      { id: 1, name: "Ardit Hoxha", active: true },
      { id: 2, name: "Elira Dervishi", active: true },
    ],
    tables: Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      area: i < 8 ? "Salla" : "Tarraca",
      shape: null,
      active: true,
      lines: [],
      waiter: 1,
      posX: 12 + (i % 5) * 19,
      posY: 15 + Math.floor(i / 5) * 22,
      width: 12,
      height: 12,
      rotation: 0,
      seats: 4,
      occupiedSince: null,
    })),
    invoices: [],
    movements: [],
    shifts: [],
    shift: { id: 1, opened: new Date().toISOString(), opening: 5000 },
  };
}
export function addItem(state, tableId, productId, waiter) {
  if (!state.shift) throw Error("Hapni turnin për të marrë porosi.");
  if (!state.tables.find((t) => t.id === tableId)?.active)
    throw Error("Tavolina nuk ekziston ose është joaktive.");
  if (!state.waiters.some((w) => w.id === waiter && w.active))
    throw Error("Zgjidhni një kamarier aktiv.");
  const product = state.products.find((p) => p.id === productId);
  const reserved = state.tables
    .flatMap((t) => t.lines)
    .filter((l) => l.id === productId)
    .reduce((s, l) => s + l.qty, 0);
  if (!product || reserved >= product.stock)
    throw Error("Nuk ka stok të disponueshëm për këtë produkt.");
  return {
    ...state,
    tables: state.tables.map((t) =>
      t.id !== tableId
        ? t
        : {
            ...t,
            waiter,
            lines: t.lines.some((l) => l.id === productId)
              ? t.lines.map((l) =>
                  l.id === productId ? { ...l, qty: l.qty + 1 } : l,
                )
              : [
                  ...t.lines,
                  {
                    id: product.id,
                    name: product.name,
                    price: product.price,
                    qty: 1,
                  },
                ],
          },
    ),
  };
}
export function checkout(state, tableId, method) {
  if (!state.shift) throw Error("Turni është i mbyllur.");
  if (!["Cash", "Kartë"].includes(method))
    throw Error("Mënyrë pagese e pavlefshme.");
  const table = state.tables.find((t) => t.id === tableId);
  if (!table?.lines.length) throw Error("Porosia është bosh.");
  for (const line of table.lines)
    if (state.products.find((p) => p.id === line.id).stock < line.qty)
      throw Error("Stok i pamjaftueshëm.");
  const invoice = {
    id: Math.max(0, ...state.invoices.map((i) => i.id)) + 1,
    table: tableId,
    waiter: table.waiter,
    lines: structuredClone(table.lines),
    total: total(table.lines),
    method,
    date: new Date().toISOString(),
    shiftId: state.shift.id,
    status: "Paguar",
  };
  return {
    ...state,
    invoices: [invoice, ...state.invoices],
    products: state.products.map((p) => ({
      ...p,
      stock: p.stock - (table.lines.find((l) => l.id === p.id)?.qty || 0),
    })),
    tables: state.tables.map((t) =>
      t.id === tableId ? { ...t, lines: [] } : t,
    ),
    movements: [
      ...state.movements,
      ...table.lines.map((l) => ({
        product: l.name,
        qty: -l.qty,
        reason: `Fatura D-${invoice.id}`,
        date: invoice.date,
      })),
    ],
  };
}
export function closeShift(state, counted) {
  if (!state.shift) throw Error("Nuk ka turn të hapur.");
  if (state.tables.some((t) => t.lines.length))
    throw Error("Mbyllni porositë e hapura përpara turnit.");
  if (!Number.isFinite(counted) || counted < 0)
    throw Error("Vendosni shumën e numëruar.");
  const expected =
    state.shift.opening +
    state.invoices
      .filter((i) => i.shiftId === state.shift.id && i.method === "Cash")
      .reduce((s, i) => s + i.total, 0);
  return {
    ...state,
    shift: null,
    shifts: [
      {
        ...state.shift,
        closed: new Date().toISOString(),
        counted,
        expected,
        difference: counted - expected,
      },
      ...state.shifts,
    ],
  };
}
