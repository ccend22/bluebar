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
    departments: [],
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
    tickets: [],
    printers: [],
    movements: [],
    shifts: [],
    pointsOfSale: [{ id: 1, name: "Kasa kryesore", areas: [] }],
    stations: [],
    openShifts: [{ id: 1, posId: 1, opened: new Date().toISOString(), opening: 5000 }],
  };
}
// The till (point of sale) a table belongs to: the one that claims its area, else the
// first till — so a business with a single till never has to configure areas.
export const posOf = (state, table) =>
  (state.pointsOfSale.find((k) => k.areas.includes(table.area)) ?? state.pointsOfSale[0])?.id ?? null;
export const shiftFor = (state, posId) => state.openShifts.find((s) => s.posId === posId) || null;
export const tableShift = (state, table) => shiftFor(state, posOf(state, table));
// The till a station ticket / an invoice belongs to: the one stored when it was sent
// (older tickets: its table's), its shift's.
export const ticketPos = (state, ticket) => {
  if (ticket.posId) return ticket.posId;
  const table = state.tables.find((t) => t.id === ticket.table);
  return table ? posOf(state, table) : state.pointsOfSale[0]?.id ?? null;
};
// A station's first active backup, following the chain (and stopping on a loop).
const backupOf = (stations, station) => {
  const seen = new Set([station.id]);
  for (let b = stations.find((x) => x.id === station.backupId); b && !seen.has(b.id); b = stations.find((x) => x.id === b.backupId)) {
    if (b.active) return b;
    seen.add(b.id);
  }
  return null;
};
// Where a department's ticket for a zone is prepared: the active station for exactly that
// zone, else that station's backup, else the station for every zone (or its backup). If
// every candidate is off with no backup, the ticket still goes to its own station (the
// configuration check flags that) rather than nowhere. null: no station prepares it —
// with no stations at all, tickets route by department as before.
export function routeStation(state, department, area) {
  const stations = state.stations || [];
  const covers = stations.filter((s) => s.departments.includes(department));
  const tiers = [covers.filter((s) => s.areas.includes(area)), covers.filter((s) => !s.areas.length)];
  for (const tier of tiers) {
    const live = tier.find((s) => s.active);
    if (live) return live;
    for (const s of tier) {
      const backup = backupOf(stations, s);
      if (backup) return backup;
    }
  }
  return tiers[0][0] || tiers[1][0] || null;
}
const AGENT_ONLINE_MS = 2 * 60_000;
// Configuration problems, worst first. Only what applies: a business with one till and
// no stations sees just the product checks. agent: GET /api/print/status (optional).
export function configIssues(state, agent = null, now = Date.now()) {
  const issues = [];
  const error = (group, text) => issues.push({ level: "error", group, text });
  const warn = (group, text) => issues.push({ level: "warn", group, text });
  const tables = state.tables.filter((t) => t.active);
  const zones = [...new Set(tables.map((t) => t.area))];
  const tills = state.pointsOfSale;
  const stations = state.stations || [];
  const name = (s) => `"${s.name}"`;

  // Tills: each serves its zones; zones no till claims fall to the first one.
  if (tills.length > 1)
    for (const k of tills) {
      const served = tables.filter((t) => posOf(state, t) === k.id);
      if (!served.length) error("Kasat", `Kasa ${name(k)} nuk ka asnjë tavolinë: zgjidhni zonat që shërben.`);
      for (const a of k.areas.filter((a) => !zones.includes(a)))
        warn("Kasat", `Kasa ${name(k)} ka zonën "${a}", por asnjë tavolinë aktive nuk është aty.`);
    }
  // Staff: a waiter tied to a till must have tables to work.
  for (const w of state.waiters.filter((w) => w.active && w.posId)) {
    const k = tills.find((x) => x.id === w.posId);
    if (!tables.some((t) => posOf(state, t) === w.posId))
      error("Stafi", `${w.name} punon vetëm te ${k ? name(k) : "një kasë që s'ekziston"}, por aty s'ka tavolina.`);
  }
  // Products: where does each one's ticket go?
  for (const p of state.products.filter((p) => !p.department && state.departments.length))
    warn("Produktet", `"${p.name}" nuk ka repart përgatitjeje: fleta e tij del si "Tjetër".`);
  if (stations.length) {
    const used = [...new Set(state.products.map((p) => p.department || "Tjetër"))];
    for (const d of used)
      for (const z of zones) {
        const s = routeStation(state, d, z);
        const example = state.products.find((p) => (p.department || "Tjetër") === d)?.name;
        if (!s) error("Produktet", `${d} në zonën "${z}" nuk ka stacion (p.sh. ${example}).`);
        else if (!s.active) error("Stacionet", `${d} në zonën "${z}" shkon te ${name(s)}, që është joaktiv dhe pa rezervë aktive.`);
      }
  }
  // Stations: active ones need a working printer or a Repartet screen.
  const agentUp = agent?.lastSeen && now - new Date(agent.lastSeen) < AGENT_ONLINE_MS;
  for (const s of stations) {
    const open = state.tickets.filter((k) => k.station === s.id && !k.doneAt && !k.cancelledAt).length;
    if (!s.active) {
      if (open) warn("Stacionet", `${name(s)} është joaktiv dhe ka ${open} fletë të hapura: transferojini.`);
      continue;
    }
    const printer = state.printers.find((p) => p.id === s.printerId);
    const printerOk = printer && agentUp && !(agent.failing || []).includes(printer.id);
    const screenOk = s.deviceSeenAt && now - new Date(s.deviceSeenAt) < AGENT_ONLINE_MS;
    if (!printerOk && !screenOk)
      error(
        "Stacionet",
        printer
          ? `${name(s)}: printeri "${printer.name}" nuk përgjigjet${agentUp ? "" : " (kompjuteri i printimit është jashtë linje)"} dhe asnjë ekran nuk e shfaq.`
          : `${name(s)} nuk ka printer dhe asnjë ekran te Repartet nuk e ka zgjedhur.`,
      );
    if (!s.departments.length) warn("Stacionet", `${name(s)} nuk përgatit asnjë repart.`);
    for (const d of s.departments.filter((d) => d !== "Tjetër" && !state.departments.includes(d)))
      warn("Stacionet", `${name(s)} ka repartin "${d}", që nuk ekziston më.`);
    for (const a of s.areas.filter((a) => !zones.includes(a)))
      warn("Stacionet", `${name(s)} ka zonën "${a}", por asnjë tavolinë aktive nuk është aty.`);
  }
  // Rules: one station per department and zone at the same level, sound backups.
  for (const d of [...state.departments, "Tjetër"]) {
    const covers = stations.filter((s) => s.active && s.departments.includes(d));
    for (const z of zones) {
      const same = covers.filter((s) => s.areas.includes(z));
      if (same.length > 1)
        warn("Rregullat", `${d} në "${z}": ${same.map(name).join(" dhe ")} e marrin të dy; fletët shkojnë te ${name(same[0])}.`);
    }
    const everywhere = covers.filter((s) => !s.areas.length);
    if (everywhere.length > 1)
      warn("Rregullat", `${d} në të gjitha zonat: ${everywhere.map(name).join(" dhe ")}; fletët shkojnë te ${name(everywhere[0])}.`);
  }
  for (const s of stations.filter((s) => s.backupId)) {
    const b = stations.find((x) => x.id === s.backupId);
    if (!b) warn("Rregullat", `Rezerva e ${name(s)} nuk ekziston më.`);
    else if (!s.departments.every((d) => b.departments.includes(d)))
      warn("Rregullat", `Rezerva ${name(b)} nuk përgatit gjithçka që përgatit ${name(s)}.`);
  }
  return issues.sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
}
export const invoicePos = (state, invoice) =>
  [...state.shifts, ...state.openShifts].find((s) => s.id === invoice.shiftId)?.posId ?? state.pointsOfSale[0]?.id ?? null;
// The printer for a till's department ticket (or, without a department, its invoices):
// the till's own, else one that serves every till.
export const printerFor = (printers, posId, department = null) => {
  const covers = (p) => (department ? p.departments.includes(department) : p.receipts);
  return printers.find((p) => covers(p) && p.posId === posId) || printers.find((p) => covers(p) && p.posId == null) || null;
};
// A line's details: note, allergy, chosen extras, course, on hold. Two units with the same
// details share a line; different details make a separate line of the same product.
export const COURSES = ["Pa kurs", "Antipastë", "Kryesore", "Ëmbëlsirë"];
export const lineDetails = (l) => ({
  note: l.note || "",
  allergy: l.allergy || "",
  extras: l.extras || [],
  course: l.course || 0,
  hold: Boolean(l.hold),
});
const sameDetails = (a, b) => JSON.stringify(lineDetails(a)) === JSON.stringify(lineDetails(b));
// A free key for a new line of this product at this table: p<id>, then p<id>-2, -3...
export function newLineKey(lines, productId) {
  const taken = new Set(lines.map((l) => l.key));
  if (!taken.has(`p${productId}`)) return `p${productId}`;
  for (let n = 2; ; n++) if (!taken.has(`p${productId}-${n}`)) return `p${productId}-${n}`;
}
// Extras by name, as the product offers them (unknown names are refused), and the price
// of one unit with them.
export function resolveExtras(product, names = []) {
  if (!Array.isArray(names) || names.some((n) => typeof n !== "string")) throw Error("Shtesat janë të pavlefshme.");
  const offered = product.extras || [];
  if (names.some((n) => !offered.some((x) => x.name === n))) throw Error(`${product.name} nuk ka këtë shtesë.`);
  return offered.filter((x) => names.includes(x.name));
}
export const unitPrice = (product, extras) => product.price + extras.reduce((s, x) => s + x.price, 0);
const text = (v, max, label) => {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string" || v.trim().length > max) throw Error(`${label} është shumë i gjatë.`);
  return v.trim();
};
// Validated details from a request: what a new or edited line will carry.
export function readDetails(product, d = {}, base = {}) {
  const course = d.course === undefined ? base.course || 0 : d.course;
  if (!Number.isInteger(course) || course < 0 || course > 3) throw Error("Kursi është i pavlefshëm.");
  return {
    note: d.note === undefined ? base.note || "" : text(d.note, 200, "Shënimi"),
    allergy: d.allergy === undefined ? base.allergy || "" : text(d.allergy, 200, "Alergjia"),
    extras: d.extras === undefined ? base.extras || [] : resolveExtras(product, d.extras),
    course,
    hold: d.hold === undefined ? Boolean(base.hold) : d.hold === true,
  };
}
export function addItem(state, tableId, productId, waiter, details = {}) {
  const table = state.tables.find((t) => t.id === tableId);
  if (!table?.active) throw Error("Tavolina nuk ekziston ose është joaktive.");
  if (!tableShift(state, table)) throw Error("Hapni turnin për të marrë porosi.");
  if (!state.waiters.some((w) => w.id === waiter && w.active))
    throw Error("Zgjidhni një kamarier aktiv.");
  const product = state.products.find((p) => p.id === productId);
  if (product && product.available === false) throw Error(`${product.name} nuk është në dispozicion tani.`);
  const reserved = state.tables
    .flatMap((t) => t.lines)
    .filter((l) => l.id === productId)
    .reduce((s, l) => s + l.qty, 0);
  // A product that doesn't track stock (an espresso, a dish made to order) is always orderable.
  if (!product || (product.trackStock !== false && reserved >= product.stock))
    throw Error("Nuk ka stok të disponueshëm për këtë produkt.");
  const d = readDetails(product, details);
  const price = unitPrice(product, d.extras);
  const same = table.lines.find((l) => l.id === productId && l.price === price && sameDetails(l, d));
  return {
    ...state,
    tables: state.tables.map((t) =>
      t.id !== tableId
        ? t
        : {
            ...t,
            waiter,
            lines: same
              ? t.lines.map((l) => (l === same ? { ...l, qty: l.qty + 1 } : l))
              : [
                  ...t.lines,
                  { key: newLineKey(t.lines, productId), id: product.id, name: product.name, price, qty: 1, sent: 0, comp: 0, ...d },
                ],
          },
    ),
  };
}
// The line a request names: by its key, or (older clients) the product's first line.
export const findLine = (table, { lineKey, productId }) =>
  lineKey !== undefined ? table.lines.find((l) => l.key === lineKey) : table.lines.find((l) => l.id === productId);
// What "Dërgo" sends now: unsent units not on hold, of no course or a course already
// started. all: everything unsent (paying never leaves work unsent).
export const pendingUnits = (table, all = false) =>
  table.lines.filter((l) => l.qty > (l.sent || 0) && (all || (!l.hold && (!l.course || l.course <= (table.course || 1)))));
// What a table's bill comes to: items, minus comped units, minus the discount = due;
// minus what was already paid = remaining. The one place every screen and the server
// read it from, so the amount owed is never computed two ways.
export function bill(table) {
  const lines = table.lines || [];
  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const comps = lines.reduce((s, l) => s + (l.comp || 0) * l.price, 0);
  const base = subtotal - comps;
  const d = table.discount;
  const discount = !d ? 0 : d.kind === "percent" ? Math.round((base * d.value) / 100) : Math.min(d.value, base);
  const due = base - discount;
  const payments = table.payments || [];
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  return { subtotal, comps, base, discount, due, paid, remaining: due - paid, tips: payments.reduce((s, p) => s + (p.tip || 0), 0) };
}
const METHODS = ["Cash", "Kartë"];
// payments: [{method, amount, tip}]. units (optional): [{productId, qty}] — pay for just
// those units now, on their own invoice (splitting the bill by items). Without units:
// a payment below what's left stays on the bill as a partial payment; one that covers
// it settles the bill into an invoice carrying every payment taken on it.
export function checkout(state, tableId, payments, { units = null, by = null, now = new Date().toISOString() } = {}) {
  const table = state.tables.find((t) => t.id === tableId);
  if (!table) throw Error("Porosia është bosh.");
  const shift = tableShift(state, table);
  if (!shift) throw Error("Turni është i mbyllur.");
  if (!table.lines.length) throw Error("Porosia është bosh.");
  if (!Array.isArray(payments) || payments.length > 4) throw Error("Pagesa është e pavlefshme.");
  for (const p of payments) {
    if (!METHODS.includes(p.method)) throw Error("Mënyrë pagese e pavlefshme.");
    if (!Number.isSafeInteger(p.amount) || p.amount < 1 || p.amount > 100000000) throw Error("Shuma e pagesës është e pavlefshme.");
    if (p.tip !== undefined && (!Number.isSafeInteger(p.tip) || p.tip < 0 || p.tip > 1000000)) throw Error("Bakshishi është i pavlefshëm.");
  }
  const amount = payments.reduce((s, p) => s + p.amount, 0);
  const b = bill(table);

  // The lines this payment settles: some units (a split), or the whole bill.
  let lines, owed, left;
  if (units) {
    if (table.payments?.length) throw Error("Kjo llogari ka pagesa të pjesshme: paguani mbetjen, jo sipas artikujve.");
    if (table.discount?.kind === "amount") throw Error("Me ulje në shumë, llogaria paguhet e plotë, jo sipas artikujve.");
    if (!Array.isArray(units) || !units.length) throw Error("Zgjidhni artikujt që paguhen.");
    lines = units.map((u) => {
      const line = findLine(table, u);
      if (!line || !Number.isSafeInteger(u.qty) || u.qty < 1 || u.qty > line.qty - (line.comp || 0))
        throw Error("Artikujt e zgjedhur nuk janë në llogari.");
      return { key: line.key, id: line.id, name: line.name, price: line.price, qty: u.qty, comp: 0, extras: line.extras || [] };
    });
    if (new Set(lines.map((l) => l.key)).size !== lines.length) throw Error("Artikujt e zgjedhur nuk janë në llogari.");
    const part = bill({ lines, discount: table.discount });
    owed = part.due;
    left = table.lines
      .map((l) => {
        const taken = lines.find((x) => x.key === l.key)?.qty || 0;
        const qty = l.qty - taken;
        return { ...l, qty, sent: Math.min(l.sent || 0, qty), comp: Math.min(l.comp || 0, qty) };
      })
      .filter((l) => l.qty > 0);
    if (!left.length) throw Error("Për të gjithë llogarinë përdorni pagesën e plotë.");
    if (amount !== owed) throw Error(`Artikujt e zgjedhur kushtojnë ${owed} Lek.`);
  } else {
    if (amount > b.remaining) throw Error(`Mbeten për t'u paguar vetëm ${b.remaining} Lek.`);
    if (amount < b.remaining) {
      // A partial payment: recorded on the bill, already in this shift's till.
      const taken = payments.map((p) => ({ id: crypto.randomUUID(), method: p.method, amount: p.amount, tip: p.tip || 0, by, date: now, shiftId: shift.id }));
      return {
        state: { ...state, tables: state.tables.map((t) => (t.id === tableId ? { ...t, payments: [...(t.payments || []), ...taken] } : t)) },
        invoice: null,
      };
    }
    lines = table.lines.map(({ key, id, name, price, qty, comp, extras }) => ({ key, id, name, price, qty, comp: comp || 0, extras: extras || [] }));
    owed = b.due;
    left = [];
  }

  // Stock per product: two lines of the same product draw on the same stock.
  for (const p of state.products) {
    if (p.trackStock === false) continue;
    const need = lines.filter((l) => l.id === p.id).reduce((s, l) => s + l.qty, 0);
    if (need > p.stock) throw Error("Stok i pamjaftueshëm.");
  }
  const all = [...(units ? [] : table.payments || []), ...payments.map((p) => ({ ...p, tip: p.tip || 0 }))];
  const by_ = (m, key) => all.filter((p) => p.method === m).reduce((s, p) => s + p[key], 0);
  const cash = by_("Cash", "amount");
  const card = by_("Kartë", "amount");
  const part = bill({ lines, discount: table.discount });
  const invoice = {
    id: Math.max(0, ...state.invoices.map((i) => i.id)) + 1,
    table: tableId,
    waiter: table.waiter,
    lines,
    subtotal: part.subtotal,
    comps: part.comps,
    discount: units ? part.discount : b.discount,
    discountReason: (units ? part.discount : b.discount) ? table.discount?.reason || null : null,
    total: owed,
    method: cash && card ? "Përzier" : card ? "Kartë" : "Cash",
    cash,
    card,
    tipCash: by_("Cash", "tip"),
    tipCard: by_("Kartë", "tip"),
    guests: table.guests || null,
    date: now,
    shiftId: shift.id,
    status: "Paguar",
    refunds: [],
  };
  return {
    state: {
      ...state,
      invoices: [invoice, ...state.invoices],
      products: state.products.map((p) => (p.trackStock === false ? p : { ...p, stock: p.stock - lines.filter((l) => l.id === p.id).reduce((s, l) => s + l.qty, 0) })),
      // A settled bill frees the table; a split leaves the rest of the bill on it.
      tables: state.tables.map((t) =>
        t.id !== tableId
          ? t
          : units
            ? { ...t, lines: left }
            : { ...t, lines: [], payments: [], discount: null, guests: null, note: "", allergy: "", course: 1 },
      ),
      movements: [
        ...state.movements,
        ...lines.filter((l) => state.products.find((p) => p.id === l.id)?.trackStock !== false)
          .map((l) => ({ product: l.name, qty: -l.qty, reason: `Fatura D-${invoice.id}`, kind: "sale", date: now })),
      ],
    },
    invoice,
  };
}
// Lek notes and coins, largest first — what's actually in a till.
export const DENOMINATIONS = [5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 1];
// An open shift's money: sales so far and the cash that should be in its drawer —
// the float, plus cash sales, plus money put in, minus money taken out.
// Sales are invoices; collections are every payment taken (including partial payments on
// bills still open); tips are the staff's, apart from sales but physically in the till
// when paid in cash; cash refunds leave the till.
export function drawer(state, shift) {
  if (!shift) return null;
  const invoices = state.invoices.filter((i) => i.shiftId === shift.id);
  const partial = state.tables.flatMap((t) => t.payments || []).filter((p) => p.shiftId === shift.id);
  const sum = (list, key = "amount") => list.reduce((s, x) => s + (x[key] || 0), 0);
  const cash = sum(invoices, "cash") + sum(partial.filter((p) => p.method === "Cash"));
  const card = sum(invoices, "card") + sum(partial.filter((p) => p.method === "Kartë"));
  const tipsCash = sum(invoices, "tipCash") + sum(partial.filter((p) => p.method === "Cash"), "tip");
  const tipsCard = sum(invoices, "tipCard") + sum(partial.filter((p) => p.method === "Kartë"), "tip");
  const refunds = (state.refunds || []).filter((r) => r.shiftId === shift.id);
  const refundsCash = sum(refunds.filter((r) => r.method === "Cash"));
  const refundsCard = sum(refunds.filter((r) => r.method === "Kartë"));
  const moves = shift.cashMovements || [];
  const cashIn = sum(moves.filter((m) => m.kind === "in"));
  const cashOut = sum(moves.filter((m) => m.kind === "out"));
  return {
    opening: shift.opening,
    cash,
    card,
    tipsCash,
    tipsCard,
    refundsCash,
    refundsCard,
    cashIn,
    cashOut,
    expected: shift.opening + cash + tipsCash + cashIn - cashOut - refundsCash,
    count: invoices.length,
    sales: sum(invoices, "total"),
    total: cash + card,
  };
}
export function closeShift(state, posId, counted, { note = null, countedDetail = null, by = null } = {}) {
  const open = shiftFor(state, posId);
  if (!open) throw Error("Nuk ka turn të hapur.");
  if (state.tables.some((t) => t.lines.length && posOf(state, t) === posId))
    throw Error("Mbyllni porositë e hapura përpara turnit.");
  if (!Number.isFinite(counted) || counted < 0)
    throw Error("Vendosni shumën e numëruar.");
  const d = drawer(state, open);
  const { cashMovements, ...shift } = open;
  return {
    ...state,
    openShifts: state.openShifts.filter((s) => s !== open),
    shifts: [
      {
        ...shift,
        closed: new Date().toISOString(),
        closedBy: by,
        counted,
        countedDetail,
        expected: d.expected,
        difference: counted - d.expected,
        note,
        sales: { count: d.count, total: d.sales, cash: d.cash, card: d.card },
      },
      ...state.shifts,
    ],
  };
}
