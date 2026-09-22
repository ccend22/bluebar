import { addItem, checkout, closeShift } from "../src/domain.js";
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
const TABLE_SHAPES = ["Rreth", "Katror", "Drejtkëndësh", "Bar"];
const shape = (v) => {
  if (v === undefined || v === null || v === "") return null;
  if (!TABLE_SHAPES.includes(v)) fail("Forma e tavolinës është e pavlefshme.");
  return v;
};
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
      if (!t.lines.some((l) => l.id === p.productId))
        fail("Produkti nuk është në porosi.");
      next = {
        ...state,
        tables: state.tables.map((t) =>
          t.id === p.tableId
            ? {
                ...t,
                lines: t.lines
                  .map((l) =>
                    l.id === p.productId ? { ...l, qty: l.qty - 1 } : l,
                  )
                  .filter((l) => l.qty > 0),
              }
            : t,
        ),
      };
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
      };
      break;
    }
    case "order.pay": {
      const t = table();
      if (p.method === "Cash") integer(p.received, 0, 100000000);
      if (
        p.method === "Cash" &&
        p.received < t.lines.reduce((s, l) => s + l.qty * l.price, 0)
      )
        fail("Shuma e marrë nuk mbulon pagesën.");
      next = checkout(state, p.tableId, p.method);
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
      const row = {
        id: existing?.id || nextId(state.tables),
        area,
        shape: shapeValue,
        active: existing?.active ?? true,
        waiter: existing?.waiter ?? null,
        lines: existing?.lines ?? [],
      };
      next = {
        ...state,
        tables: existing
          ? state.tables.map((x) => (x.id === existing.id ? row : x))
          : [...state.tables, row],
      };
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
    case "product.save": {
      const productName = name(p.name),
        price = integer(p.price, 1, 1000000),
        category = name(p.category, 40);
      if (!state.categories.includes(category)) fail("Kategoria nuk ekziston.");
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
        fail("Kategoria ekziston.");
      next = { ...state, categories: [...state.categories, category] };
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
        },
      };
      break;
    }
    case "shift.close":
      integer(p.counted, 0, 100000000);
      next = closeShift(state, p.counted);
      break;
    default:
      fail("Veprimi nuk njihet.");
  }
  return { state: next, result };
}
