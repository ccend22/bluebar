import { addItem, checkout, closeShift, DENOMINATIONS, drawer } from "../src/domain.js";
import { cellsOf, centerOf, footprint, freeSpot, sizeFor } from "../src/floorGeometry.js";
export class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}
const fail = (message) => {
  throw new AppError(message);
};
const integer = (v, min = 1, max = 2147483647) => {
  if (!Number.isSafeInteger(v) || v < min || v > max)
    fail("Vlerë numerike e pavlefshme.");
  return v;
};
const name = (v, max = 80) => {
  if (typeof v !== "string" || !v.trim() || v.trim().length > max)
    fail("Emri është i pavlefshëm.");
  return v.trim();
};
const nextId = (items) => Math.max(0, ...items.map((x) => x.id)) + 1;
// The print agent opens a raw TCP connection to this address from inside the venue,
// so only LAN addresses are accepted — never a public host.
// A USB printer on the print computer is "usb:" + its system print-queue name.
export const USB_QUEUE = /^usb:[A-Za-z0-9_.-]{1,60}$/;
const printerHost = (v) => {
  if (typeof v === "string" && USB_QUEUE.test(v.trim())) return v.trim();
  const host = typeof v === "string" ? v.trim().toLowerCase() : "";
  const ip = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)?.slice(1).map(Number);
  const lan =
    ip &&
    ip.every((n) => n <= 255) &&
    (ip[0] === 10 || ip[0] === 127 || (ip[0] === 172 && ip[1] >= 16 && ip[1] <= 31) || (ip[0] === 192 && ip[1] === 168));
  if (!lan && !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.(local|lan)$/.test(host))
    fail("Vendosni IP-në lokale të printerit, p.sh. 192.168.1.50.");
  return host;
};
// A new table lands on the first free block of cells (same geometry the floor plan
// uses), so tables added one after another fill the room instead of piling up.
function firstOpenSlot(tables, table) {
  const block = freeSpot(footprint(table), tables.map((t) => cellsOf(t)));
  return block ? centerOf(block) : { posX: 50, posY: 50 };
}
const TABLE_SHAPES = ["Rreth", "Katror", "Drejtkëndësh", "Bar", "Oval"];
const shape = (v) => {
  if (v === undefined || v === null || v === "") return null;
  if (!TABLE_SHAPES.includes(v)) fail("Forma e tavolinës është e pavlefshme.");
  return v;
};
const requireRange = (v, min, max, message) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) fail(message);
  return v;
};
const range = (v, min, max, fallback, message) =>
  v === undefined ? fallback : requireRange(v, min, max, message);
const pct = (v, fallback) => range(v, 0, 100, fallback, "Pozicioni i tavolinës është i pavlefshëm.");
const dim = (v, fallback) => range(v, 4, 60, fallback, "Madhësia e tavolinës është e pavlefshme.");
const rotation = (v, fallback) =>
  v === undefined ? fallback : requireRange(((v % 360) + 360) % 360, 0, 359, "Rrotullimi i tavolinës është i pavlefshëm.");
const seats = (v, fallback) => (v === undefined ? fallback : integer(v, 1, 12));
const requirePct = (v) => requireRange(v, 0, 100, "Pozicioni i tavolinës është i pavlefshëm.");
const requireDim = (v) => requireRange(v, 4, 60, "Madhësia e tavolinës është e pavlefshme.");
const unique = (items, value, except) => {
  if (
    items.some(
      (x) =>
        x.id !== except &&
        x.name.toLocaleLowerCase() === value.toLocaleLowerCase(),
    )
  )
    fail("Ky emër ekziston tashmë.");
};
// A table's current order's tickets: not yet closed by payment or cancellation.
const openTickets = (tickets, tableId) =>
  tickets.filter((k) => k.table === tableId && !k.invoice && !k.cancelledAt);
// Closing an order marks its tickets paid (invoice) or cancelled. They leave the
// stations' screens at once, but stay stored a while (see pruneTickets) so a queued
// print job or a station's cancellation slip can still find them.
export const closeTickets = (tickets, tableId, patch) =>
  tickets.flatMap((k) =>
    k.table !== tableId || k.invoice || k.cancelledAt ? [k] : k.doneAt ? [] : [{ ...k, ...patch }],
  );
const CLOSED_TICKET_TTL = 60 * 60_000;
// Tickets closed over an hour ago (paid, cancelled, or marked done before "Gati" was
// removed) are dropped, so the table never grows without bound.
export const pruneTickets = (tickets, invoices, now = Date.now()) =>
  tickets.filter((k) => {
    const closed = k.cancelledAt || k.doneAt || (k.invoice && (invoices.find((i) => i.id === k.invoice)?.date ?? 0));
    return !closed || now - new Date(closed) < CLOSED_TICKET_TTL;
  });
export function applyCommand(state, type, payload, actor = null) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    fail("Kërkesë e pavlefshme.");
  const p = payload;
  let next,
    result = {};
  const table = () => {
    integer(p.tableId);
    const t = state.tables.find((t) => t.id === p.tableId);
    if (!t) fail("Tavolina nuk ekziston.");
    if (!t.active) fail("Tavolina është joaktive.");
    return t;
  };
  const activeWaiter = () => {
    integer(p.waiterId);
    if (!state.waiters.some((w) => w.id === p.waiterId && w.active))
      fail("Zgjidhni një kamarier aktiv.");
    return p.waiterId;
  };
  switch (type) {
    case "order.add":
      table();
      integer(p.productId);
      activeWaiter();
      next = addItem(state, p.tableId, p.productId, p.waiterId);
      break;
    case "order.remove": {
      if (!state.shift) fail("Turni është i mbyllur.");
      const t = table();
      integer(p.productId);
      const line = t.lines.find((l) => l.id === p.productId);
      if (!line) fail("Produkti nuk është në porosi.");
      if (actor?.role === "waiter" && (line.sent || 0) >= line.qty)
        fail("Ky artikull është dërguar tashmë në repart. Vetëm menaxheri mund ta heqë.");
      const lines = t.lines
        .map((l) =>
          l.id === p.productId
            ? { ...l, qty: l.qty - 1, sent: Math.min(l.sent || 0, l.qty - 1) }
            : l,
        )
        .filter((l) => l.qty > 0);
      next = {
        ...state,
        tables: state.tables.map((x) => (x.id === t.id ? { ...x, lines } : x)),
        tickets: lines.length ? state.tickets : closeTickets(state.tickets, t.id, { cancelledAt: new Date().toISOString() }),
      };
      break;
    }
    case "order.send": {
      if (!state.shift) fail("Turni është i mbyllur.");
      const t = table();
      if (actor?.role === "waiter" && t.waiter !== actor.waiterId)
        fail("Kjo tavolinë është caktuar tek një kamarier tjetër. Merreni tavolinën për ta dërguar.");
      const pending = t.lines.filter((l) => l.qty > (l.sent || 0));
      if (!pending.length) fail("Nuk ka artikuj të rinj për t'u dërguar.");
      // One ticket per station for this round; a product with no department still
      // has to reach someone, so it goes out as "Tjetër".
      const byDept = new Map();
      for (const l of pending) {
        const dept =
          state.products.find((x) => x.id === l.id)?.department || "Tjetër";
        if (!byDept.has(dept)) byDept.set(dept, []);
        byDept.get(dept).push({ id: l.id, name: l.name, qty: l.qty - (l.sent || 0) });
      }
      const round = Math.max(0, ...openTickets(state.tickets, t.id).map((k) => k.round)) + 1;
      const date = new Date().toISOString();
      const tickets = [...byDept].map(([department, lines]) => ({
        id: crypto.randomUUID(),
        table: t.id,
        invoice: null,
        round,
        department,
        waiter: t.waiter,
        date,
        lines,
        doneAt: null,
        cancelledAt: null,
      }));
      next = {
        ...state,
        tables: state.tables.map((x) =>
          x.id === t.id ? { ...x, lines: x.lines.map((l) => ({ ...l, sent: l.qty })) } : x,
        ),
        tickets: [...state.tickets, ...tickets],
      };
      result = { round, tickets };
      break;
    }
    case "printer.save": {
      const printerName = name(p.name, 40);
      const host = printerHost(p.host);
      const port = p.port === undefined ? 9100 : integer(p.port, 1, 65535);
      const width = p.width === undefined ? (p.receipts === true ? 56 : 48) : p.width;
      if (![32, 42, 48, 56].includes(width)) fail("Gjerësia e letrës është e pavlefshme.");
      const known = [...state.departments, "Tjetër"];
      if (!Array.isArray(p.departments) || p.departments.some((d) => !known.includes(d)))
        fail("Zgjidhni repartet e printerit.");
      const departments = [...new Set(p.departments)];
      const receipts = p.receipts === true;
      if (!departments.length && !receipts) fail("Zgjidhni të paktën një repart ose faturat.");
      let existing;
      if (p.id !== undefined) {
        integer(p.id);
        existing = state.printers.find((x) => x.id === p.id);
        if (!existing) fail("Printeri nuk ekziston.");
      }
      const ascii = p.ascii === true;
      const cutter = p.cutter !== false;
      const printer = { id: existing?.id || nextId(state.printers), name: printerName, host, port, width, departments, receipts, ascii, cutter };
      // A department (and the cashier's invoices) prints on exactly one printer:
      // assigning it here takes it away from wherever it was before.
      const others = state.printers
        .filter((x) => x.id !== printer.id)
        .map((x) => ({
          ...x,
          departments: x.departments.filter((d) => !departments.includes(d)),
          receipts: receipts ? false : x.receipts,
        }));
      next = { ...state, printers: [...others, printer].sort((a, b) => a.id - b.id) };
      break;
    }
    case "printer.delete": {
      integer(p.id);
      if (!state.printers.some((x) => x.id === p.id)) fail("Printeri nuk ekziston.");
      next = { ...state, printers: state.printers.filter((x) => x.id !== p.id) };
      break;
    }
    case "order.assign":
      table();
      activeWaiter();
      next = {
        ...state,
        tables: state.tables.map((t) =>
          t.id === p.tableId ? { ...t, waiter: p.waiterId } : t,
        ),
      };
      break;
    case "order.cancel": {
      const t = table();
      if (!t.lines.length) fail("Tavolina nuk ka porosi të hapur.");
      const reason = name(p.reason, 200);
      if (reason.length < 3) fail("Shkruani arsyen e anulimit.");
      result = {
        cancelled: {
          tableId: t.id,
          lines: structuredClone(t.lines),
          reason,
          by: actor?.name || "manager",
          at: new Date().toISOString(),
        },
      };
      next = {
        ...state,
        tables: state.tables.map((x) =>
          x.id === t.id ? { ...x, lines: [], waiter: null } : x,
        ),
        tickets: closeTickets(state.tickets, t.id, { cancelledAt: new Date().toISOString() }),
      };
      break;
    }
    case "order.pay": {
      const t = table();
      // A waiter closes their own table; picking up someone else's first goes
      // through order.assign ("Merre tavolinën"), which is itself self-only.
      if (actor?.role === "waiter" && t.waiter !== actor.waiterId)
        fail("Kjo tavolinë është caktuar tek një kamarier tjetër. Merreni tavolinën për ta mbyllur.");
      if (p.method === "Cash") integer(p.received, 0, 100000000);
      if (
        p.method === "Cash" &&
        p.received < t.lines.reduce((s, l) => s + l.qty * l.price, 0)
      )
        fail("Shuma e marrë nuk mbulon pagesën.");
      next = checkout(state, p.tableId, p.method);
      next = {
        ...next,
        // Not stored: tells the print queue to hold the cashier's copy until the
        // fiscalization (fired by the client right after) has added its NIVF/NSLF.
        invoices: next.invoices.map((i, n) => (n === 0 && p.fiscalize === true ? { ...i, fiscalRequested: true } : i)),
        tickets: closeTickets(state.tickets, p.tableId, { invoice: next.invoices[0].id }),
      };
      result = { invoiceId: next.invoices[0].id };
      break;
    }
    case "table.save": {
      const area = name(p.area, 40),
        shapeValue = shape(p.shape);
      let existing;
      if (p.id !== undefined) {
        integer(p.id);
        existing = state.tables.find((x) => x.id === p.id);
        if (!existing) fail("Tavolina nuk ekziston.");
      }
      // A new table starts as one cell (a bar: one cell wide, counter-thin); the
      // manager can grow it up to a few cells for a big party on the floor plan.
      const { width: defaultWidth, height: defaultHeight } = sizeFor(shapeValue, 1, 1);
      const slot = existing
        ? null
        : firstOpenSlot(
            state.tables.filter((t) => t.active),
            { shape: shapeValue, width: p.width ?? defaultWidth, height: p.height ?? defaultHeight, rotation: 0 },
          );
      const row = {
        id: existing?.id || nextId(state.tables),
        area,
        shape: shapeValue,
        active: existing?.active ?? true,
        waiter: existing?.waiter ?? null,
        lines: existing?.lines ?? [],
        posX: pct(p.posX, existing?.posX ?? slot?.posX ?? 50),
        posY: pct(p.posY, existing?.posY ?? slot?.posY ?? 50),
        width: dim(p.width, existing?.width ?? defaultWidth),
        height: dim(p.height, existing?.height ?? defaultHeight),
        rotation: rotation(p.rotation, existing?.rotation ?? 0),
        seats: seats(p.seats, existing?.seats ?? 4),
        occupiedSince: existing?.occupiedSince ?? null,
      };
      next = {
        ...state,
        tables: existing
          ? state.tables.map((x) => (x.id === existing.id ? row : x))
          : [...state.tables, row],
      };
      break;
    }
    case "tables.save": {
      // Several table.save changes (new tables, edits, positions) confirmed at once:
      // all or nothing, each item validated exactly like a single table.save.
      if (!Array.isArray(p.tables) || !p.tables.length || p.tables.length > 100)
        fail("Nuk ka ndryshime për t'u ruajtur.");
      next = p.tables.reduce((current, item) => applyCommand(current, "table.save", item, actor).state, state);
      break;
    }
    case "table.toggle": {
      integer(p.id);
      const t = state.tables.find((x) => x.id === p.id);
      if (!t) fail("Tavolina nuk ekziston.");
      if (t.active && t.lines.length)
        fail("Nuk mund të çaktivizoni një tavolinë me porosi të hapura.");
      next = {
        ...state,
        tables: state.tables.map((x) =>
          x.id === t.id ? { ...x, active: !x.active } : x,
        ),
      };
      break;
    }
    case "table.delete": {
      integer(p.id);
      const t = state.tables.find((x) => x.id === p.id);
      if (!t) fail("Tavolina nuk ekziston.");
      if (t.lines.length) fail("Nuk mund të fshini një tavolinë me porosi të hapura.");
      // dining_tables is referenced by invoices/order_lines history with no cascade
      // (see 003_table_management.sql), so a table that has ever taken an order stays
      // soft-removed via table.toggle instead; only a never-used table can be deleted.
      if (state.invoices.some((inv) => inv.table === p.id) || state.tickets.some((k) => k.table === p.id))
        fail("Kjo tavolinë ka histori faturash; çaktivizojeni në vend të fshirjes.");
      next = { ...state, tables: state.tables.filter((x) => x.id !== p.id) };
      break;
    }
    case "table.layout": {
      if (!Array.isArray(p.tables) || !p.tables.length || p.tables.length > 200)
        fail("Vendosni pozicionet e tavolinave.");
      const patches = new Map();
      for (const t of p.tables) {
        integer(t.id);
        if (!state.tables.some((x) => x.id === t.id)) fail("Tavolina nuk ekziston.");
        patches.set(t.id, {
          posX: requirePct(t.posX),
          posY: requirePct(t.posY),
          width: requireDim(t.width),
          height: requireDim(t.height),
          rotation: rotation(t.rotation, 0),
        });
      }
      next = {
        ...state,
        tables: state.tables.map((x) =>
          patches.has(x.id) ? { ...x, ...patches.get(x.id) } : x,
        ),
      };
      break;
    }
    case "product.save": {
      const productName = name(p.name),
        price = integer(p.price, 1, 1000000),
        category = name(p.category, 40);
      if (!state.categories.includes(category)) fail("Nënkategoria nuk ekziston.");
      // Department (which station prepares it) is optional — a manager can leave
      // existing products unrouted, or route them later once departments exist.
      let department = null;
      if (p.department !== undefined && p.department !== null && p.department !== "") {
        department = name(p.department, 40);
        if (!state.departments.includes(department)) fail("Kategoria nuk ekziston.");
      }
      let existing;
      if (p.id !== undefined) {
        integer(p.id);
        existing = state.products.find((x) => x.id === p.id);
        if (!existing) fail("Produkti nuk ekziston.");
      }
      unique(state.products, productName, existing?.id);
      const product = {
        id: existing?.id || nextId(state.products),
        name: productName,
        price,
        category,
        department: department ?? existing?.department ?? null,
        stock: existing?.stock || 0,
      };
      next = {
        ...state,
        products: existing
          ? state.products.map((x) => (x.id === existing.id ? product : x))
          : [...state.products, product],
      };
      break;
    }
    case "category.create": {
      const category = name(p.name, 40);
      if (
        state.categories.some(
          (c) => c.toLocaleLowerCase() === category.toLocaleLowerCase(),
        )
      )
        fail("Nënkategoria ekziston.");
      next = { ...state, categories: [...state.categories, category] };
      break;
    }
    case "department.create": {
      const department = name(p.name, 40);
      if (
        state.departments.some(
          (d) => d.toLocaleLowerCase() === department.toLocaleLowerCase(),
        )
      )
        fail("Kategoria ekziston.");
      next = { ...state, departments: [...state.departments, department] };
      break;
    }
    case "stock.receive": {
      integer(p.productId);
      const qty = integer(p.qty, 1, 100000),
        product = state.products.find((x) => x.id === p.productId);
      if (!product) fail("Produkti nuk ekziston.");
      integer(product.stock + qty, 0);
      next = {
        ...state,
        products: state.products.map((x) =>
          x.id === p.productId ? { ...x, stock: x.stock + qty } : x,
        ),
        movements: [
          ...state.movements,
          {
            product: product.name,
            qty,
            reason: "Hyrje manuale",
            date: new Date().toISOString(),
          },
        ],
      };
      break;
    }
    case "waiter.create": {
      const waiterName = name(p.name);
      unique(state.waiters, waiterName);
      next = {
        ...state,
        waiters: [
          ...state.waiters,
          { id: nextId(state.waiters), name: waiterName, active: true },
        ],
      };
      break;
    }
    case "waiter.toggle": {
      integer(p.waiterId);
      const waiter = state.waiters.find((w) => w.id === p.waiterId);
      if (!waiter) fail("Kamarieri nuk ekziston.");
      if (
        waiter.active &&
        (state.waiters.filter((w) => w.active).length === 1 ||
          state.tables.some((t) => t.lines.length && t.waiter === waiter.id))
      )
        fail(
          "Profili i fundit aktiv ose një profil me porosi të hapura nuk mund të çaktivizohet.",
        );
      next = {
        ...state,
        waiters: state.waiters.map((w) =>
          w.id === waiter.id ? { ...w, active: !w.active } : w,
        ),
      };
      break;
    }
    case "shift.open": {
      if (state.shift) fail("Një turn është tashmë i hapur.");
      integer(p.opening, 0, 100000000);
      next = {
        ...state,
        shift: {
          id: nextId(state.shifts),
          opened: new Date().toISOString(),
          opening: p.opening,
          openedBy: actor?.name || null,
          cashMovements: [],
        },
      };
      break;
    }
    case "shift.cash": {
      // Money put into or taken out of the drawer mid-shift (a supplier paid in cash,
      // takings moved to the safe), so the count at closing still adds up.
      if (!state.shift) fail("Nuk ka turn të hapur.");
      if (p.kind !== "in" && p.kind !== "out") fail("Zgjidhni hyrje ose dalje.");
      const amount = integer(p.amount, 1, 100000000);
      const reason = name(p.reason, 120);
      if (p.kind === "out" && amount > drawer(state).expected)
        fail("Në arkë nuk ka aq cash sa po nxirrni.");
      next = {
        ...state,
        shift: {
          ...state.shift,
          cashMovements: [
            ...(state.shift.cashMovements || []),
            { id: crypto.randomUUID(), kind: p.kind, amount, reason, by: actor?.name || null, date: new Date().toISOString() },
          ],
        },
      };
      break;
    }
    case "shift.close": {
      integer(p.counted, 0, 100000000);
      // A count by notes and coins must add up to the total it claims.
      let countedDetail = null;
      if (p.denominations !== undefined) {
        if (!p.denominations || typeof p.denominations !== "object" || Array.isArray(p.denominations))
          fail("Numërimi sipas prerjeve është i pavlefshëm.");
        countedDetail = {};
        for (const [key, qty] of Object.entries(p.denominations)) {
          if (!DENOMINATIONS.includes(Number(key))) fail("Prerje e panjohur.");
          if (integer(qty, 0, 100000)) countedDetail[key] = qty;
        }
        const sum = Object.entries(countedDetail).reduce((s, [k, q]) => s + Number(k) * q, 0);
        if (sum !== p.counted) fail("Shuma e prerjeve nuk përputhet me totalin.");
      }
      const note = p.note === undefined || p.note === null || String(p.note).trim() === "" ? null : name(p.note, 300);
      next = closeShift(state, p.counted, { note, countedDetail, by: actor?.name || null });
      break;
    }
    default:
      fail("Veprimi nuk njihet.");
  }
  // One pass over every path that can change a table's lines (order.add/remove/pay/
  // cancel), rather than stamping it separately in each case above.
  if (next.tables !== state.tables) {
    const now = new Date().toISOString();
    next = {
      ...next,
      tables: next.tables.map((t) => {
        const before = state.tables.find((x) => x.id === t.id);
        if (!before || before.lines.length === t.lines.length) return t;
        return { ...t, occupiedSince: t.lines.length ? t.occupiedSince ?? now : null };
      }),
    };
  }
  if (next.tickets) next = { ...next, tickets: pruneTickets(next.tickets, next.invoices) };
  return { state: next, result };
}
