import { addItem, bill, checkout, closeShift, COURSES, DENOMINATIONS, drawer, findLine, lineDetails, newLineKey, pendingUnits, posOf, readDetails, routeStation, shiftFor, tableShift, unitPrice } from "../src/domain.js";
import { cellsOf, centerOf, footprint, freeSpot, sizeFor } from "../src/floorGeometry.js";
// Why stock changes by hand. Losses are counted as such in the reports.
export const LOSSES = ["Humbje", "Thyerje", "Skadim"];
export const STOCK_REASONS = [...LOSSES, "Korrigjim numërimi", "Konsum i brendshëm"];
// Variants and extras a product can be ordered with, each with the price it adds.
function readExtras(list) {
  if (!Array.isArray(list) || list.length > 20) fail("Shtesat janë të pavlefshme.");
  const seen = new Set();
  return list.map((x) => {
    const name = typeof x?.name === "string" ? x.name.trim() : "";
    if (!name || name.length > 40) fail("Emri i shtesës është i pavlefshëm.");
    if (seen.has(name.toLocaleLowerCase())) fail(`Shtesa "${name}" përsëritet.`);
    seen.add(name.toLocaleLowerCase());
    if (!Number.isSafeInteger(x.price) || x.price < 0 || x.price > 100000) fail("Çmimi i shtesës është i pavlefshëm.");
    return { name, price: x.price };
  });
}
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
// Optional guest-facing text (online menu): may be empty; undefined keeps the old value.
const menuText = (v, max, keep = "") => {
  if (v === undefined) return keep || "";
  if (typeof v !== "string" || v.trim().length > max) fail(`Teksti i menusë është i gjatë (deri ${max} shkronja).`);
  return v.trim();
};
const bool = (v) => {
  if (typeof v !== "boolean") fail("Vlerë e pavlefshme.");
  return v;
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
// A paid ticket stays on its station until marked "Gati": payment never takes work away
// from the kitchen. A void slip is moot once the whole order is cancelled (the original
// ticket's own cancellation slip covers it), so it just goes.
export const closeTickets = (tickets, tableId, patch) =>
  tickets.flatMap((k) =>
    k.table !== tableId || k.invoice || k.cancelledAt
      ? [k]
      : k.doneAt || (k.void && patch.cancelledAt)
        ? []
        : [{ ...k, ...patch }],
  );
const CLOSED_TICKET_TTL = 60 * 60_000;
// A paid ticket nobody marked "Gati" (a station without a screen) still leaves eventually.
const PAID_TICKET_TTL = 12 * 60 * 60_000;
// Tickets done or cancelled over an hour ago are dropped, so the table never grows
// without bound; a paid one only once its station is done with it (or after 12 hours).
export const pruneTickets = (tickets, invoices, now = Date.now()) =>
  tickets.filter((k) => {
    const closed = k.cancelledAt || (k.invoice && k.doneAt);
    if (closed) return now - new Date(closed) < CLOSED_TICKET_TTL;
    const paid = k.invoice && invoices.find((i) => i.id === k.invoice)?.date;
    return !paid || now - new Date(paid) < PAID_TICKET_TTL;
  });
export function applyCommand(state, type, payload, actor = null) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    fail("Kërkesë e pavlefshme.");
  const p = payload;
  const now = new Date().toISOString();
  let next,
    result = {};
  // The order's change history: one event per change, persisted with the command.
  // amount: what it was worth (Lek); duration: seconds (a station's preparation time).
  const log = (s, tableId, kind, detail, { invoice = null, amount = null, duration = null } = {}) => {
    const table = state.tables.find((t) => t.id === tableId);
    return {
      ...s,
      events: [
        ...(s.events || []),
        {
          table: tableId, kind, detail: detail.slice(0, 300), actor: actor?.name || null, invoice, date: now,
          amount, duration, posId: table ? posOf(state, table) : null,
        },
      ],
    };
  };
  // A unit made and thrown away: it leaves stock as a loss, with why.
  const loss = (s, line, reason) => ({
    ...s,
    products: s.products.map((x) => (x.id === line.id ? { ...x, stock: Math.max(0, x.stock - 1) } : x)),
    movements: [...s.movements, { product: line.name, qty: -1, reason, kind: "loss", actor: actor?.name || null, date: now }],
  });
  const deptOf = (productId) => state.products.find((x) => x.id === productId)?.department || "Tjetër";
  const stationName = (id) => (state.stations || []).find((x) => x.id === id)?.name;
  const station = (id) => {
    integer(id);
    const found = (state.stations || []).find((x) => x.id === id);
    if (!found) fail("Stacioni nuk ekziston.");
    return found;
  };
  // What a station sees of a line: the item and how it's to be made.
  const ticketLine = (l, qty) => ({
    id: l.id, key: l.key, name: l.name, qty,
    note: l.note || "", allergy: l.allergy || "",
    extras: (l.extras || []).map((x) => x.name), course: l.course || 0,
  });
  // A one-line slip for the station that has the line's work: a void, a correction or a
  // remake. It goes where the unit went, even if routing has changed since.
  const slip = (t, line, kind, qty, note = "") => {
    const department = deptOf(line.id);
    const carrier = openTickets(state.tickets, t.id)
      .filter((k) => (k.kind || "order") === "order" && !k.void && k.lines.some((l) => (l.key || `p${l.id}`) === line.key || (!l.key && l.id === line.id)))
      .at(-1);
    return {
      id: crypto.randomUUID(),
      table: t.id,
      invoice: null,
      round: carrier?.round ?? Math.max(1, ...openTickets(state.tickets, t.id).map((k) => k.round)),
      department,
      station: carrier ? carrier.station : routeStation(state, department, t.area)?.id ?? null,
      posId: carrier?.posId ?? posOf(state, t),
      transferTo: null,
      waiter: t.waiter,
      date: now,
      lines: [ticketLine(line, qty)],
      doneAt: null,
      cancelledAt: null,
      void: kind === "void",
      kind,
      note,
      allergy: t.allergy || "",
    };
  };
  const reasonOf = (v, what) => {
    const r = name(v ?? "x", 200);
    if (v === undefined || r.length < 3) fail(`Shkruani arsyen e ${what}.`);
    return r;
  };
  const describe = (l) =>
    [l.name, ...(l.extras || []).map((x) => `+ ${x.name}`), l.note && `“${l.note}”`, l.allergy && `ALERGJI: ${l.allergy}`]
      .filter(Boolean)
      .join(" ");
  const openTicket = () => {
    if (typeof p.id !== "string") fail("Fleta nuk ekziston.");
    const k = state.tickets.find((x) => x.id === p.id);
    if (!k) fail("Fleta nuk ekziston.");
    if (k.doneAt || k.cancelledAt) fail("Fleta është mbyllur tashmë.");
    return k;
  };
  const table = (id = p.tableId) => {
    integer(id);
    const t = state.tables.find((t) => t.id === id);
    if (!t) fail("Tavolina nuk ekziston.");
    if (!t.active) fail("Tavolina është joaktive.");
    // A waiter assigned to one till works only the tables of its areas.
    const own = actor?.role === "waiter" && state.waiters.find((w) => w.id === actor.waiterId)?.posId;
    if (own && posOf(state, t) !== own)
      fail(`Kjo tavolinë i përket kasës "${state.pointsOfSale.find((k) => k.id === posOf(state, t))?.name}".`);
    return t;
  };
  // The till a shift command is for; omitted means the first one (a single-till business).
  const pos = () => {
    if (p.posId === undefined) return state.pointsOfSale[0]?.id ?? fail("Krijoni një kasë.");
    integer(p.posId);
    if (!state.pointsOfSale.some((k) => k.id === p.posId)) fail("Kasa nuk ekziston.");
    return p.posId;
  };
  const activeWaiter = () => {
    integer(p.waiterId);
    if (!state.waiters.some((w) => w.id === p.waiterId && w.active))
      fail("Zgjidhni një kamarier aktiv.");
    return p.waiterId;
  };
  const guestOrder = () => {
    integer(p.id);
    return (state.guestOrders || []).find((g) => g.id === p.id) ?? fail("Kjo porosi nuk pret më: është vendosur tashmë.");
  };
  const decideGuest = (s, g, status, reason = "") => ({
    ...s,
    guestOrders: s.guestOrders.filter((x) => x.id !== g.id),
    guestDecided: [...(s.guestDecided || []), { id: g.id, status, reason, decidedBy: actor?.name || null }],
  });
  switch (type) {
    case "order.add": {
      table();
      integer(p.productId);
      activeWaiter();
      const { tableId, productId, waiterId, ...details } = p;
      next = addItem(state, tableId, productId, waiterId, details);
      const added = next.tables.find((x) => x.id === tableId).lines.find(
        (l) => l.id === productId && JSON.stringify(lineDetails(l)) === JSON.stringify(readDetails(state.products.find((x) => x.id === productId), details)),
      );
      next = log(next, tableId, "add", `+1 × ${describe(added)}`);
      break;
    }
    case "guest.accept": {
      // A guest's order from the online menu, confirmed by staff: its items join the
      // table at today's prices and go to the stations, as if the waiter had entered them.
      const g = guestOrder();
      const t = table(g.table);
      if (!tableShift(state, t)) fail("Turni është i mbyllur.");
      let waiter;
      if (actor?.role === "waiter") {
        if (t.waiter && t.waiter !== actor.waiterId) fail("Kjo tavolinë është e një kolegu: ai e pranon porosinë.");
        waiter = actor.waiterId;
      } else waiter = t.waiter ?? activeWaiter();
      next = state;
      try {
        for (const item of g.items)
          for (let n = 0; n < item.qty; n++) next = addItem(next, t.id, item.productId, waiter, { extras: item.extras, note: item.note });
      } catch (e) {
        fail(`${e.message} Refuzojeni porosinë ose shtojeni vetë pa këtë artikull.`);
      }
      const names = g.items.map((i) => `${i.qty} × ${state.products.find((x) => x.id === i.productId)?.name ?? "?"}`).join(", ");
      // Sent by the menu itself, nobody accepted it by hand: the history says so.
      const how = actor?.role === "system" ? "Porosi nga menuja online" : "Pranoi porosinë nga menuja online";
      next = log(next, t.id, "guest", `${how} (G-${g.id}): ${names}`);
      next = applyCommand(next, "order.send", { tableId: t.id }, actor).state;
      next = decideGuest(next, g, "accepted");
      break;
    }
    case "guest.seen": {
      // A waiter saw the order a guest sent straight to the stations.
      integer(p.id);
      if (!(state.guestAlerts || []).some((g) => g.id === p.id)) fail("Ky njoftim është parë tashmë.");
      next = { ...state, guestAlerts: state.guestAlerts.filter((g) => g.id !== p.id), guestSeen: [...(state.guestSeen || []), p.id] };
      break;
    }
    case "guest.reject": {
      const g = guestOrder();
      const t = table(g.table);
      if (actor?.role === "waiter" && t.waiter && t.waiter !== actor.waiterId) fail("Kjo tavolinë është e një kolegu.");
      const reason = p.reason === undefined ? "" : menuText(p.reason, 200, "");
      next = log(state, t.id, "guest", `Refuzoi porosinë nga menuja online (G-${g.id})${reason ? `: ${reason}` : ""}`);
      next = decideGuest(next, g, "rejected", reason);
      break;
    }
    case "order.remove": {
      const t = table();
      if (!tableShift(state, t)) fail("Turni është i mbyllur.");
      const line = findLine(t, p);
      if (!line) fail("Produkti nuk është në porosi.");
      if (actor?.role === "waiter" && (line.sent || 0) >= line.qty)
        fail("Ky artikull është dërguar tashmë në repart. Vetëm menaxheri mund ta heqë.");
      const lines = t.lines
        .map((l) =>
          l === line
            ? { ...l, qty: l.qty - 1, sent: Math.min(l.sent || 0, l.qty - 1), comp: Math.min(l.comp || 0, l.qty - 1) }
            : l,
        )
        .filter((l) => l.qty > 0);
      if (t.payments?.length && bill({ ...t, lines }).due < bill(t).paid)
        fail("Kjo llogari është paguar pjesërisht: pa këtë artikull, detyrimi bie nën shumën e paguar.");
      // Every unit of this line already reached its station: the one removed is being
      // made, so the station gets a void slip for it (unless the whole order is now gone,
      // which cancels the station's tickets outright). Why, and whether it was already
      // made — then it's a loss — are recorded.
      const voided = (line.sent || 0) >= line.qty;
      const reason = voided ? reasonOf(p.reason, "anulimit") : null;
      if (voided && p.prepared !== undefined && typeof p.prepared !== "boolean") fail("Vlerë e pavlefshme.");
      let tickets = lines.length ? state.tickets : closeTickets(state.tickets, t.id, { cancelledAt: now });
      const voidSlip = voided && lines.length ? slip(t, line, "void", 1, reason) : null;
      if (voidSlip) tickets = [...tickets, voidSlip];
      next = {
        ...state,
        tables: state.tables.map((x) => (x.id === t.id ? { ...x, lines } : x)),
        tickets,
      };
      // Already made: the unit is thrown away, so it leaves stock as a loss.
      if (voided && p.prepared === true) next = loss(next, line, `Anuluar pas përgatitjes (Tav. ${t.id}): ${reason}`);
      next = voided
        ? log(
            next,
            t.id,
            "void",
            `Anuloi 1 × ${describe(line)} (ishte dërguar te ${stationName(voidSlip?.station) || deptOf(line.id)})${p.prepared ? ", ishte përgatitur: humbje" : ""}: ${reason}`,
            { amount: line.price },
          )
        : log(next, t.id, "remove", `−1 × ${describe(line)}`);
      break;
    }
    case "order.edit": {
      // Change a line's details. Units not yet sent are simply corrected; units already
      // at the station need a reason, and the station gets a correction slip. one: true
      // takes a single unsent unit off onto its own line (two of the same, made differently).
      const t = table();
      if (!tableShift(state, t)) fail("Turni është i mbyllur.");
      if (actor?.role === "waiter" && t.waiter !== actor.waiterId) fail("Kjo tavolinë është e një kolegu.");
      const line = findLine(t, p);
      if (!line) fail("Produkti nuk është në porosi.");
      const product = state.products.find((x) => x.id === line.id);
      const d = readDetails(product, p, lineDetails(line));
      const price = unitPrice(product, d.extras);
      const unsent = line.qty - (line.sent || 0);
      let lines, changed, sentChange = false;
      if (p.one === true) {
        if (!unsent) fail("Të gjitha copët janë dërguar: ndryshimi bëhet për gjithë rreshtin.");
        if (line.qty < 2) fail("Rreshti ka vetëm një copë.");
        changed = { key: newLineKey(t.lines, line.id), id: line.id, name: line.name, price, qty: 1, sent: 0, comp: 0, ...d };
        lines = [
          ...t.lines.map((l) => (l === line ? { ...l, qty: l.qty - 1, comp: Math.min(l.comp || 0, l.qty - 1) } : l)),
          changed,
        ];
      } else {
        if (line.sent && d.course !== (line.course || 0)) fail("Kursi nuk ndryshohet pasi artikulli është dërguar.");
        if (!unsent && d.hold !== Boolean(line.hold)) fail("Artikulli është dërguar: s'ka çfarë të mbahet në pritje.");
        sentChange =
          (line.sent || 0) > 0 &&
          (d.note !== (line.note || "") || d.allergy !== (line.allergy || "") || JSON.stringify(d.extras) !== JSON.stringify(line.extras || []));
        changed = { ...line, ...d, price };
        lines = t.lines.map((l) => (l === line ? changed : l));
      }
      const after = { ...t, lines };
      if (t.payments?.length && bill(after).due < bill(t).paid) fail("Me këtë ndryshim, detyrimi bie nën shumën e paguar.");
      const reason = sentChange ? reasonOf(p.reason, "ndryshimit") : null;
      next = {
        ...state,
        tables: state.tables.map((x) => (x.id === t.id ? after : x)),
        tickets: sentChange ? [...state.tickets, slip(t, changed, "correction", line.sent, reason)] : state.tickets,
      };
      next = log(
        next,
        t.id,
        "edit",
        sentChange
          ? `Korrigjoi ${line.sent} × ${describe(line)} → ${describe(changed)} (njoftim te reparti): ${reason}`
          : `${p.one ? "Ndau 1 copë: " : ""}${describe(line)} → ${describe(changed)}${changed.hold ? " · në pritje" : ""}${changed.course ? ` · ${COURSES[changed.course]}` : ""}`,
      );
      break;
    }
    case "order.note": {
      // The order's own note and allergy. Once anything is at a station, changing them
      // needs a reason and every station holding its work gets a correction.
      const t = table();
      if (!t.lines.length) fail("Tavolina nuk ka porosi të hapur.");
      const textOf = (v, current) => {
        if (v === undefined) return current || "";
        if (v !== null && typeof v !== "string") fail("Shënimi është i pavlefshëm.");
        return (v || "").trim().slice(0, 200);
      };
      const note = textOf(p.note, t.note);
      const allergy = textOf(p.allergy, t.allergy);
      const sent = openTickets(state.tickets, t.id).filter((k) => (k.kind || "order") === "order");
      const reason = sent.length && (allergy !== (t.allergy || "") || note !== (t.note || "")) ? reasonOf(p.reason, "ndryshimit") : null;
      const after = { ...t, note, allergy };
      const notices = reason
        ? [...new Map(sent.map((k) => [k.station ?? k.department, k])).values()].map((k) => ({
            ...slip(after, { ...k.lines[0], key: k.lines[0].key || `p${k.lines[0].id}` }, "correction", 0, `${reason}${allergy ? ` · ALERGJI: ${allergy}` : ""}${note ? ` · ${note}` : ""}`),
            lines: [],
            station: k.station,
            department: k.department,
            posId: k.posId,
          }))
        : [];
      next = { ...state, tables: state.tables.map((x) => (x.id === t.id ? after : x)), tickets: [...state.tickets, ...notices] };
      next = log(next, t.id, "note", `Shënimi i porosisë: ${note || "—"}${allergy ? ` · ALERGJI: ${allergy}` : ""}${reason ? ` (njoftim te repartet): ${reason}` : ""}`);
      break;
    }
    case "order.fire": {
      // "Fillo kursin": the kitchen may start the next course; its items go out now.
      const t = table();
      integer(p.course, 2, 3);
      if (p.course <= (t.course || 1)) fail(`${COURSES[p.course]} ka filluar tashmë.`);
      next = { ...state, tables: state.tables.map((x) => (x.id === t.id ? { ...x, course: p.course } : x)) };
      const started = applyCommand(next, "order.send", { tableId: t.id }, actor);
      next = log(started.state, t.id, "fire", `Filloi kursin: ${COURSES[p.course]}`);
      result = started.result;
      break;
    }
    case "order.remake": {
      // Make it again (dropped, burnt, sent back): the station gets a remake slip, the
      // wasted unit leaves stock as a loss, the bill doesn't change.
      const t = table();
      const line = findLine(t, p);
      if (!line) fail("Produkti nuk është në porosi.");
      if (!line.sent) fail("Artikulli nuk është dërguar ende.");
      const reason = reasonOf(p.reason, "ripërgatitjes");
      const product = state.products.find((x) => x.id === line.id);
      const reserved = state.tables.flatMap((x) => x.lines).filter((l) => l.id === line.id).reduce((s, l) => s + l.qty, 0);
      if (product.stock - reserved < 1) fail(`Nuk ka stok për të ripërgatitur ${line.name}.`);
      next = { ...state, tickets: [...state.tickets, slip(t, line, "remake", 1, reason)] };
      next = loss(next, line, `Ripërgatitje (Tav. ${t.id}): ${reason}`);
      next = log(next, t.id, "remake", `Ripërgatitje 1 × ${describe(line)}: ${reason}`, { amount: line.price });
      break;
    }
    case "order.send": {
      const t = table();
      if (!tableShift(state, t)) fail("Turni është i mbyllur.");
      if (actor?.role === "waiter" && t.waiter !== actor.waiterId)
        fail("Kjo tavolinë është caktuar tek një kamarier tjetër. Merreni tavolinën për ta dërguar.");
      const pending = pendingUnits(t, p.all === true);
      if (!pending.length)
        fail(
          t.lines.some((l) => l.qty > (l.sent || 0))
            ? "Artikujt e padërguar janë në pritje ose në një kurs që s'ka filluar."
            : "Nuk ka artikuj të rinj për t'u dërguar.",
        );
      // One ticket per station for this round; a product with no department still
      // has to reach someone, so it goes out as "Tjetër".
      const byDept = new Map();
      for (const l of pending) {
        const dept =
          state.products.find((x) => x.id === l.id)?.department || "Tjetër";
        if (!byDept.has(dept)) byDept.set(dept, []);
        byDept.get(dept).push(ticketLine(l, l.qty - (l.sent || 0)));
      }
      const round = Math.max(0, ...openTickets(state.tickets, t.id).map((k) => k.round)) + 1;
      const date = now;
      // Destination and till as of now: later changes to zones or stations don't move it.
      const tickets = [...byDept].map(([department, lines]) => ({
        id: crypto.randomUUID(),
        table: t.id,
        invoice: null,
        round,
        department,
        station: routeStation(state, department, t.area)?.id ?? null,
        posId: posOf(state, t),
        transferTo: null,
        waiter: t.waiter,
        date,
        lines,
        doneAt: null,
        cancelledAt: null,
        kind: "order",
        note: t.note || "",
        allergy: t.allergy || "",
      }));
      next = {
        ...state,
        tables: state.tables.map((x) =>
          x.id === t.id ? { ...x, lines: x.lines.map((l) => (pending.includes(l) ? { ...l, sent: l.qty, hold: false } : l)) } : x,
        ),
        tickets: [...state.tickets, ...tickets],
      };
      next = log(
        next,
        t.id,
        "send",
        `Raundi ${round} → ` +
          tickets
            .map((k) => `${stationName(k.station) || k.department}: ${k.lines.map((l) => `${l.qty} × ${l.name}`).join(", ")}`)
            .join("; "),
      );
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
      // Which till's tickets and invoices it prints (null: every till without its own).
      let posId = null;
      if (p.posId !== undefined && p.posId !== null) {
        integer(p.posId);
        if (!state.pointsOfSale.some((k) => k.id === p.posId)) fail("Kasa nuk ekziston.");
        posId = p.posId;
      }
      const printer = { id: existing?.id || nextId(state.printers), name: printerName, host, port, width, departments, receipts, ascii, cutter, posId };
      // Per till, a department (and the invoices) prints on exactly one printer:
      // assigning it here takes it away from wherever it was before.
      const others = state.printers
        .filter((x) => x.id !== printer.id)
        .map((x) =>
          (x.posId ?? null) !== posId
            ? x
            : { ...x, departments: x.departments.filter((d) => !departments.includes(d)), receipts: receipts ? false : x.receipts },
        );
      next = { ...state, printers: [...others, printer].sort((a, b) => a.id - b.id) };
      break;
    }
    case "printer.delete": {
      integer(p.id);
      if (!state.printers.some((x) => x.id === p.id)) fail("Printeri nuk ekziston.");
      next = {
        ...state,
        printers: state.printers.filter((x) => x.id !== p.id),
        // Its stations fall back to a Repartet screen.
        stations: (state.stations || []).map((x) => (x.printerId === p.id ? { ...x, printerId: null } : x)),
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
      next = log(next, p.tableId, "assign", `Kaloi te ${state.waiters.find((w) => w.id === p.waiterId).name}`);
      break;
    case "ticket.done": {
      // The station finished (or acknowledged a void slip): it leaves the screen,
      // whether or not the table has paid.
      const k = openTicket();
      if (k.transferTo) fail("Fleta është në transferim: pranojeni ose anulojeni transferimin.");
      next = { ...state, tickets: state.tickets.map((x) => (x.id === k.id ? { ...x, doneAt: now } : x)) };
      // Preparation time, kept for the reports after the ticket itself is pruned.
      if (!k.void)
        next = log(next, k.table, "ready", `${stationName(k.station) || k.department} gati: raundi ${k.round}`, {
          duration: Math.max(0, Math.round((Date.parse(now) - Date.parse(k.date)) / 1000)),
        });
      break;
    }
    case "ticket.transfer": {
      // Hand a ticket to another station (the grill is down, the outside bar is swamped).
      // It stays with the current station until the other one accepts it, so nothing
      // falls between the two. Sending it to its own station withdraws the transfer.
      const k = openTicket();
      const to = station(p.stationId);
      const withdraw = to.id === k.station;
      if (!withdraw && !to.active) fail(`${to.name} është joaktiv.`);
      if (withdraw && !k.transferTo) fail("Fleta është tashmë te ky stacion.");
      next = {
        ...state,
        tickets: state.tickets.map((x) =>
          x.id === k.id
            ? { ...x, transferTo: withdraw ? null : to.id, transferBy: withdraw ? null : actor?.name || null, transferAt: withdraw ? null : now }
            : x,
        ),
      };
      const from = stationName(k.station) || k.department;
      next = log(
        next,
        k.table,
        "transfer",
        withdraw
          ? `Anuloi transferimin e fletës ${from} (raundi ${k.round})`
          : `Fleta ${from} (raundi ${k.round}) → ${to.name}, në pritje të pranimit`,
      );
      break;
    }
    case "ticket.accept": {
      const k = openTicket();
      if (!k.transferTo) fail("Kjo fletë nuk është në transferim.");
      const to = station(k.transferTo);
      next = {
        ...state,
        tickets: state.tickets.map((x) =>
          x.id === k.id ? { ...x, station: to.id, transferTo: null, transferBy: null, transferAt: null } : x,
        ),
      };
      next = log(next, k.table, "transfer", `${to.name} pranoi fletën ${stationName(k.station) || k.department} (raundi ${k.round})`);
      break;
    }
    case "station.save": {
      const stationNameValue = name(p.name, 40);
      const stations = state.stations || [];
      let existing;
      if (p.id !== undefined) existing = station(p.id);
      unique(stations, stationNameValue, existing?.id);
      const known = [...state.departments, "Tjetër"];
      if (!Array.isArray(p.departments) || !p.departments.length || p.departments.some((d) => !known.includes(d)))
        fail("Zgjidhni të paktën një repart që përgatit stacioni.");
      const zones = new Set(state.tables.map((t) => t.area));
      if (!Array.isArray(p.areas) || p.areas.some((a) => !zones.has(a))) fail("Zgjidhni zonat e stacionit.");
      let printerId = null;
      if (p.printerId !== undefined && p.printerId !== null) {
        integer(p.printerId);
        if (!state.printers.some((x) => x.id === p.printerId)) fail("Printeri nuk ekziston.");
        printerId = p.printerId;
      }
      const id = existing?.id || nextId(stations);
      let backupId = null;
      if (p.backupId !== undefined && p.backupId !== null) {
        backupId = station(p.backupId).id;
        if (backupId === id) fail("Stacioni nuk mund të jetë rezervë e vetes.");
        // No loops: following backups from the chosen one must never come back here.
        const seen = new Set([id]);
        for (let b = stations.find((x) => x.id === backupId); b; b = stations.find((x) => x.id === b.backupId)) {
          if (seen.has(b.id)) fail("Rezervat formojnë një rreth: zgjidhni një rezervë tjetër.");
          seen.add(b.id);
        }
      }
      const row = {
        id,
        name: stationNameValue,
        departments: [...new Set(p.departments)],
        areas: [...new Set(p.areas)],
        active: existing?.active ?? true,
        backupId,
        printerId,
        deviceSeenAt: existing?.deviceSeenAt ?? null,
      };
      next = {
        ...state,
        stations: existing ? stations.map((x) => (x.id === id ? row : x)) : [...stations, row],
      };
      break;
    }
    case "station.toggle": {
      // Temporarily off (oven broken, bar closed for the night): new tickets go to its
      // backup; tickets it already has stay until transferred or done.
      const st = station(p.id);
      next = { ...state, stations: state.stations.map((x) => (x.id === st.id ? { ...x, active: !x.active } : x)) };
      break;
    }
    case "station.delete": {
      const st = station(p.id);
      if (state.tickets.some((k) => k.station === st.id || k.transferTo === st.id))
        fail(`${st.name} ka fletë; çaktivizojeni në vend të fshirjes.`);
      const backupOf = state.stations.filter((x) => x.backupId === st.id);
      if (backupOf.length) fail(`${st.name} është rezervë e ${backupOf.map((x) => x.name).join(", ")}.`);
      next = { ...state, stations: state.stations.filter((x) => x.id !== st.id) };
      break;
    }
    case "order.cancel": {
      const t = table();
      if (!t.lines.length) fail("Tavolina nuk ka porosi të hapur.");
      if (t.payments?.length)
        fail("Kjo llogari ka pagesa të pjesshme: mbylleni llogarinë dhe, nëse duhet, bëni rimbursim.");
      const reason = name(p.reason, 200);
      if (reason.length < 3) fail("Shkruani arsyen e anulimit.");
      result = {
        cancelled: {
          tableId: t.id,
          lines: structuredClone(t.lines),
          reason,
          by: actor?.name || "manager",
          at: now,
        },
      };
      next = {
        ...state,
        tables: state.tables.map((x) =>
          x.id === t.id ? { ...x, lines: [], waiter: null, guests: null, discount: null, note: "", allergy: "", course: 1 } : x,
        ),
        tickets: closeTickets(state.tickets, t.id, { cancelledAt: now }),
      };
      const value = t.lines.reduce((s, l) => s + l.qty * l.price, 0);
      next = log(next, t.id, "cancel", `Anuloi porosinë (${value} Lek): ${reason}`, { amount: value });
      break;
    }
    case "order.pay": {
      const t = table();
      // A waiter closes their own table; picking up someone else's first goes
      // through order.assign ("Merre tavolinën"), which is itself self-only.
      if (actor?.role === "waiter" && t.waiter !== actor.waiterId)
        fail("Kjo tavolinë është caktuar tek një kamarier tjetër. Merreni tavolinën për ta mbyllur.");
      // payments: [{method, amount, tip}]. The older form {method, received} pays
      // everything that's left in one method.
      const remaining = bill(t).remaining;
      // A fully comped bill owes nothing: it closes without a payment.
      const payments = Array.isArray(p.payments)
        ? p.payments
        : remaining > 0 ? [{ method: p.method, amount: remaining }] : [];
      if (!payments.length && (remaining > 0 || p.units)) fail("Zgjidhni mënyrën e pagesës.");
      // Cash handed over must cover the cash part and its tip; the rest is change.
      const cashDue = payments.filter((x) => x.method === "Cash").reduce((s, x) => s + (x.amount || 0) + (x.tip || 0), 0);
      if (p.received !== undefined || (cashDue && !Array.isArray(p.payments))) {
        integer(p.received, 0, 100000000);
        if (p.received < cashDue) fail("Shuma e marrë nuk mbulon pagesën.");
      }
      const amount = payments.reduce((s, x) => s + (Number.isSafeInteger(x.amount) ? x.amount : 0), 0);
      const settles = Boolean(p.units) || amount >= remaining;
      // Paying never loses work: before an invoice, items not yet sent go to their stations.
      let base = state;
      if (settles && t.lines.some((l) => l.qty > (l.sent || 0))) {
        const sent = applyCommand(state, "order.send", { tableId: t.id, all: true }, actor);
        base = sent.state;
        result = { sentTickets: sent.result.tickets };
      }
      const paid = checkout(base, t.id, payments, { units: p.units || null, by: actor?.name || null, now });
      next = paid.state;
      const tip = payments.reduce((s, x) => s + (x.tip || 0), 0);
      const how = payments.map((x) => `${x.amount} Lek ${x.method === "Cash" ? "cash" : "kartë"}`).join(" + ") + (tip ? ` (+${tip} bakshish)` : "");
      if (!paid.invoice) {
        const left = bill(next.tables.find((x) => x.id === t.id)).remaining;
        next = log(next, t.id, "partial", `Pagesë e pjesshme: ${how} · mbeten ${left} Lek`, { amount });
        result = { ...result, partial: true, remaining: left };
        break;
      }
      const invoice = paid.invoice;
      const settled = !p.units;
      next = {
        ...next,
        // Not stored: tells the print queue to hold the cashier's copy until the
        // fiscalization (fired by the client right after) has added its NIVF/NSLF.
        invoices: next.invoices.map((i, n) => (n === 0 && p.fiscalize === true ? { ...i, fiscalRequested: true } : i)),
        // A split leaves the rest of the order (and its tickets) on the table.
        tickets: settled ? closeTickets(next.tickets, t.id, { invoice: invoice.id }) : next.tickets,
      };
      next = log(
        next,
        t.id,
        "pay",
        `${settled ? "Pagoi" : "Ndau dhe pagoi"} D-${invoice.id} · ${how}${settled ? "" : ` · ${invoice.lines.map((l) => `${l.qty} × ${l.name}`).join(", ")}`}`,
        { invoice: invoice.id, amount: invoice.total },
      );
      result = { ...result, invoiceId: invoice.id, remaining: settled ? 0 : bill(next.tables.find((x) => x.id === t.id)).remaining };
      break;
    }
    case "order.handover": {
      // The waiter hands the table to a colleague (end of their shift, a section swap).
      const t = table();
      if (!t.lines.length) fail("Tavolina nuk ka porosi të hapur.");
      if (actor?.role === "waiter" && t.waiter !== actor.waiterId) fail("Mund të dorëzoni vetëm tavolinat tuaja.");
      integer(p.waiterId);
      const to = state.waiters.find((w) => w.id === p.waiterId && w.active);
      if (!to) fail("Zgjidhni një kamarier aktiv.");
      if (to.id === t.waiter) fail(`Tavolina është tashmë e ${to.name}.`);
      if (to.posId && posOf(state, t) !== to.posId)
        fail(`${to.name} punon te kasa "${state.pointsOfSale.find((k) => k.id === to.posId)?.name}", jo te kjo tavolinë.`);
      next = { ...state, tables: state.tables.map((x) => (x.id === t.id ? { ...x, waiter: to.id } : x)) };
      next = log(next, t.id, "handover", `Dorëzoi tavolinën te ${to.name}`);
      break;
    }
    case "order.move": {
      // Move the order to another table; onto a table that has an order, it merges
      // the two bills (only when asked to: p.merge).
      const from = table();
      const to = table(p.toTableId);
      if (from.id === to.id) fail("Zgjidhni një tavolinë tjetër.");
      if (!from.lines.length) fail("Tavolina nuk ka porosi të hapur.");
      if (actor?.role === "waiter" && from.waiter !== actor.waiterId) fail("Mund të zhvendosni vetëm tavolinat tuaja.");
      // Between tills: the bill is collected at the till of the table it ends up on.
      // Money already taken stays in the first till's drawer, so a part-paid bill
      // doesn't cross tills.
      const fromPos = posOf(state, from), toPos = posOf(state, to);
      if (fromPos !== toPos) {
        const tillName = (id) => state.pointsOfSale.find((k) => k.id === id)?.name;
        if (from.payments?.length)
          fail(`Kjo llogari ka pagesa të pjesshme te kasa "${tillName(fromPos)}": mbylleni atje para se ta zhvendosni.`);
        if (!shiftFor(state, toPos)) fail(`Kasa "${tillName(toPos)}" nuk ka turn të hapur.`);
      }
      let merged;
      if (to.lines.length) {
        if (p.merge !== true) fail(`Tavolina ${to.id} ka porosi: konfirmoni bashkimin e llogarive.`);
        if (actor?.role === "waiter" && to.waiter !== actor.waiterId) fail("Bashkoni vetëm me tavolinat tuaja.");
        if (from.discount && to.discount) fail("Të dyja llogaritë kanë ulje: hiqeni njërën para bashkimit.");
        // Same product made the same way at the same price: one line; otherwise its own.
        const lines = to.lines.map((l) => ({ ...l }));
        for (const l of from.lines) {
          const same = lines.find(
            (x) => x.id === l.id && x.price === l.price && JSON.stringify(lineDetails(x)) === JSON.stringify(lineDetails(l)),
          );
          if (same) Object.assign(same, { qty: same.qty + l.qty, sent: (same.sent || 0) + (l.sent || 0), comp: (same.comp || 0) + (l.comp || 0) });
          else lines.push({ ...l, key: lines.some((x) => x.key === l.key) ? newLineKey(lines, l.id) : l.key });
        }
        merged = {
          ...to,
          lines,
          payments: [...(to.payments || []), ...(from.payments || [])],
          discount: to.discount || from.discount || null,
          guests: (to.guests || 0) + (from.guests || 0) || null,
          occupiedSince: [to.occupiedSince, from.occupiedSince].filter(Boolean).sort()[0] || null,
          note: [to.note, from.note].filter(Boolean).join(" · ").slice(0, 200),
          allergy: [to.allergy, from.allergy].filter(Boolean).join(" · ").slice(0, 200),
          course: Math.max(to.course || 1, from.course || 1),
        };
      } else
        merged = {
          ...to,
          lines: from.lines,
          waiter: from.waiter,
          payments: from.payments || [],
          discount: from.discount || null,
          guests: from.guests || null,
          occupiedSince: from.occupiedSince,
          note: from.note || "",
          allergy: from.allergy || "",
          course: from.course || 1,
        };
      next = {
        ...state,
        tables: state.tables.map((x) =>
          x.id === to.id
            ? merged
            : x.id === from.id
              ? { ...x, lines: [], payments: [], discount: null, guests: null, waiter: null, note: "", allergy: "", course: 1 }
              : x,
        ),
        // The stations deliver to the new table.
        tickets: state.tickets.map((k) => (k.table === from.id && !k.invoice && !k.cancelledAt ? { ...k, table: to.id } : k)),
      };
      const what = to.lines.length ? "Bashkoi llogarinë" : "Zhvendosi porosinë";
      next = log(next, from.id, "move", `${what} te Tavolina ${to.id}`);
      next = log(next, to.id, "move", `${what} nga Tavolina ${from.id} (${bill(from).due} Lek)`);
      break;
    }
    case "order.discount": {
      // The manager's, always with a reason. value 0 removes it.
      const t = table();
      if (!t.lines.length) fail("Tavolina nuk ka porosi të hapur.");
      if (p.kind !== "percent" && p.kind !== "amount") fail("Zgjidhni përqindje ose shumë.");
      const value = integer(p.value, 0, p.kind === "percent" ? 100 : 100000000);
      const discount = value ? { kind: p.kind, value, reason: name(p.reason, 120), by: actor?.name || null } : null;
      if (discount && discount.reason.length < 3) fail("Shkruani arsyen e uljes.");
      const after = { ...t, discount };
      if (bill(after).due < bill(t).paid) fail("Me këtë ulje, detyrimi bie nën shumën që është paguar tashmë.");
      next = { ...state, tables: state.tables.map((x) => (x.id === t.id ? after : x)) };
      next = log(
        next,
        t.id,
        "discount",
        discount ? `Ulje ${p.kind === "percent" ? `${value}%` : `${value} Lek`} (${bill(after).discount} Lek): ${discount.reason}` : "Hoqi uljen",
        { amount: bill(after).discount },
      );
      break;
    }
    case "order.comp": {
      // Comp (qerasje) one unit — or take it back: delta 1 / -1. Manager only, with a reason.
      const t = table();
      const line = findLine(t, p);
      if (!line) fail("Produkti nuk është në porosi.");
      if (p.delta !== 1 && p.delta !== -1) fail("Veprim i pavlefshëm.");
      const comp = (line.comp || 0) + p.delta;
      if (comp < 0 || comp > line.qty) fail(p.delta > 0 ? "Të gjitha copët janë qerasur." : "Asnjë copë nuk është qerasur.");
      const reason = p.delta > 0 ? name(p.reason, 120) : null;
      if (reason !== null && reason.length < 3) fail("Shkruani arsyen e qerasjes.");
      const after = { ...t, lines: t.lines.map((l) => (l === line ? { ...l, comp } : l)) };
      if (bill(after).due < bill(t).paid) fail("Kjo llogari është paguar pjesërisht: qerasja e çon detyrimin nën shumën e paguar.");
      next = { ...state, tables: state.tables.map((x) => (x.id === t.id ? after : x)) };
      next = log(next, t.id, "comp", p.delta > 0 ? `Qerasi 1 × ${line.name}: ${reason}` : `Hoqi qerasjen e 1 × ${line.name}`, {
        amount: p.delta * line.price,
      });
      break;
    }
    case "invoice.refund": {
      // Money back on a paid invoice: manager, reason, never more than it took. A cash
      // refund comes out of the drawer of its till's open shift. Stock isn't put back.
      integer(p.invoiceId);
      const invoice = state.invoices.find((i) => i.id === p.invoiceId);
      if (!invoice) fail("Fatura nuk ekziston.");
      if (!["Cash", "Kartë"].includes(p.method)) fail("Zgjidhni si kthehen paratë.");
      const refunded = (invoice.refunds || []).reduce((s, r) => s + r.amount, 0);
      const amount = integer(p.amount, 1, 100000000);
      if (amount > invoice.total - refunded) fail(`Nga kjo faturë mund të kthehen edhe ${invoice.total - refunded} Lek.`);
      const reason = name(p.reason, 200);
      if (reason.length < 3) fail("Shkruani arsyen e rimbursimit.");
      const till = [...state.shifts, ...state.openShifts].find((x) => x.id === invoice.shiftId)?.posId;
      const shift = shiftFor(state, till);
      if (p.method === "Cash" && !shift) fail("Për rimbursim cash duhet një turn i hapur te kasa e faturës.");
      if (p.method === "Cash" && amount > drawer(state, shift).expected) fail("Në arkë nuk ka aq cash.");
      const refund = { id: crypto.randomUUID(), invoiceId: invoice.id, amount, method: p.method, reason, by: actor?.name || null, date: now, shiftId: shift?.id ?? null };
      next = {
        ...state,
        invoices: state.invoices.map((i) => (i.id === invoice.id ? { ...i, refunds: [...(i.refunds || []), refund] } : i)),
        refunds: [...(state.refunds || []), refund],
      };
      next = log(next, invoice.table, "refund", `Rimbursoi ${amount} Lek ${p.method === "Cash" ? "cash" : "në kartë"} nga D-${invoice.id}: ${reason}`, {
        invoice: invoice.id,
        amount,
      });
      result = { refundId: refund.id };
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
      if (!state.categories.includes(category)) fail("Kategoria e menusë nuk ekziston.");
      // Department (which station prepares it) is optional — a manager can leave
      // existing products unrouted, or route them later once departments exist.
      let department = null;
      if (p.department !== undefined && p.department !== null && p.department !== "") {
        department = name(p.department, 40);
        if (!state.departments.includes(department)) fail("Reparti nuk ekziston.");
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
        minStock: existing?.minStock ?? 10,
        available: existing?.available ?? true,
        extras: p.extras === undefined ? existing?.extras || [] : readExtras(p.extras),
        // What the online menu shows. Left out of the request: kept as they were.
        nameEn: menuText(p.nameEn, 80, existing?.nameEn),
        description: menuText(p.description, 300, existing?.description),
        descriptionEn: menuText(p.descriptionEn, 300, existing?.descriptionEn),
        menuVisible: p.menuVisible === undefined ? existing?.menuVisible ?? true : bool(p.menuVisible),
        photoAt: existing?.photoAt ?? null,
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
        fail("Kjo kategori menuje ekziston.");
      next = { ...state, categories: [...state.categories, category] };
      break;
    }
    case "category.translate": {
      // The category's English name on the online menu ("" clears it).
      const category = name(p.name, 40);
      if (!state.categories.includes(category)) fail("Kategoria e menusë nuk ekziston.");
      const nameEn = menuText(p.nameEn, 40, "");
      const { [category]: _, ...rest } = state.categoryEn || {};
      next = { ...state, categoryEn: nameEn ? { ...rest, [category]: nameEn } : rest };
      break;
    }
    case "department.create": {
      const department = name(p.name, 40);
      if (
        state.departments.some(
          (d) => d.toLocaleLowerCase() === department.toLocaleLowerCase(),
        )
      )
        fail("Ky repart ekziston.");
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
            kind: "receive",
            actor: actor?.name || null,
            date: now,
          },
        ],
      };
      break;
    }
    case "stock.adjust": {
      // A correction or a loss, always with a reason: broken, expired, a recount.
      // Never automatic — a cancelled payment doesn't put a consumed product back.
      integer(p.productId);
      const product = state.products.find((x) => x.id === p.productId);
      if (!product) fail("Produkti nuk ekziston.");
      if (!Number.isSafeInteger(p.qty) || p.qty === 0 || Math.abs(p.qty) > 100000) fail("Vendosni sasinë e korrigjimit.");
      if (!STOCK_REASONS.includes(p.reason)) fail("Zgjidhni arsyen.");
      const note = p.note === undefined || p.note === null || String(p.note).trim() === "" ? "" : name(p.note, 120);
      if (product.stock + p.qty < 0) fail(`Në stok ka vetëm ${product.stock} copë ${product.name}.`);
      next = {
        ...state,
        products: state.products.map((x) => (x.id === product.id ? { ...x, stock: x.stock + p.qty } : x)),
        movements: [
          ...state.movements,
          {
            product: product.name,
            qty: p.qty,
            reason: note ? `${p.reason}: ${note}` : p.reason,
            kind: LOSSES.includes(p.reason) ? "loss" : "adjust",
            actor: actor?.name || null,
            date: now,
          },
        ],
      };
      break;
    }
    case "product.stockRules": {
      // Low-stock threshold, and "not available right now" (out of an ingredient, the
      // oven is off) without deleting the product or touching its stock.
      integer(p.productId);
      const product = state.products.find((x) => x.id === p.productId);
      if (!product) fail("Produkti nuk ekziston.");
      const minStock = p.minStock === undefined ? product.minStock : integer(p.minStock, 0, 100000);
      if (p.available !== undefined && typeof p.available !== "boolean") fail("Vlerë e pavlefshme.");
      const available = p.available ?? product.available;
      next = {
        ...state,
        products: state.products.map((x) => (x.id === product.id ? { ...x, minStock, available } : x)),
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
    case "waiter.pos": {
      integer(p.waiterId);
      if (!state.waiters.some((w) => w.id === p.waiterId)) fail("Kamarieri nuk ekziston.");
      const posId = p.posId === null ? null : pos();
      next = { ...state, waiters: state.waiters.map((w) => (w.id === p.waiterId ? { ...w, posId } : w)) };
      break;
    }
    case "pos.save": {
      const posName = name(p.name, 40);
      let existing;
      if (p.id !== undefined) {
        integer(p.id);
        existing = state.pointsOfSale.find((k) => k.id === p.id);
        if (!existing) fail("Kasa nuk ekziston.");
      }
      unique(state.pointsOfSale, posName, existing?.id);
      const known = new Set(state.tables.map((t) => t.area));
      if (!Array.isArray(p.areas) || p.areas.some((a) => !known.has(a))) fail("Zgjidhni zonat e kasës.");
      const areas = [...new Set(p.areas)];
      const till = { id: existing?.id || nextId(state.pointsOfSale), name: posName, areas };
      // An area belongs to one till: claiming it here takes it from the other.
      const others = state.pointsOfSale
        .filter((k) => k.id !== till.id)
        .map((k) => ({ ...k, areas: k.areas.filter((a) => !areas.includes(a)) }));
      const pointsOfSale = [...others, till].sort((a, b) => a.id - b.id);
      // Moving an area must not strand an open order on a till whose shift is closed
      // (or move it to another till's shift mid-order).
      for (const t of state.tables.filter((t) => t.lines.length))
        if (posOf(state, t) !== posOf({ ...state, pointsOfSale }, t))
          fail(`Tavolina ${t.id} ka porosi të hapur; mbylleni para se të ndryshoni zonat.`);
      next = { ...state, pointsOfSale };
      break;
    }
    case "pos.delete": {
      integer(p.id);
      const till = state.pointsOfSale.find((k) => k.id === p.id);
      if (!till) fail("Kasa nuk ekziston.");
      if (state.pointsOfSale.length === 1) fail("Duhet të paktën një kasë.");
      // Shifts reference their till forever; a till that ever sold stays.
      if (shiftFor(state, till.id) || state.shifts.some((s) => s.posId === till.id))
        fail("Kjo kasë ka turne; riemërtojeni në vend të fshirjes.");
      const pointsOfSale = state.pointsOfSale.filter((k) => k.id !== till.id);
      for (const t of state.tables.filter((t) => t.lines.length))
        if (posOf(state, t) !== posOf({ ...state, pointsOfSale }, t))
          fail(`Tavolina ${t.id} ka porosi të hapur.`);
      next = {
        ...state,
        pointsOfSale,
        waiters: state.waiters.map((w) => (w.posId === till.id ? { ...w, posId: null } : w)),
        printers: state.printers.map((x) => (x.posId === till.id ? { ...x, posId: null } : x)),
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
      const posId = pos();
      if (shiftFor(state, posId)) fail("Kjo kasë ka tashmë një turn të hapur.");
      integer(p.opening, 0, 100000000);
      next = {
        ...state,
        openShifts: [
          ...state.openShifts,
          {
            id: nextId([...state.shifts, ...state.openShifts]),
            posId,
            opened: new Date().toISOString(),
            opening: p.opening,
            openedBy: actor?.name || null,
            cashMovements: [],
          },
        ],
      };
      break;
    }
    case "shift.cash": {
      // Money put into or taken out of the drawer mid-shift (a supplier paid in cash,
      // takings moved to the safe), so the count at closing still adds up.
      const open = shiftFor(state, pos());
      if (!open) fail("Nuk ka turn të hapur.");
      if (p.kind !== "in" && p.kind !== "out") fail("Zgjidhni hyrje ose dalje.");
      const amount = integer(p.amount, 1, 100000000);
      const reason = name(p.reason, 120);
      if (p.kind === "out" && amount > drawer(state, open).expected)
        fail("Në arkë nuk ka aq cash sa po nxirrni.");
      const move = { id: crypto.randomUUID(), kind: p.kind, amount, reason, by: actor?.name || null, date: new Date().toISOString() };
      next = {
        ...state,
        openShifts: state.openShifts.map((s) =>
          s === open ? { ...s, cashMovements: [...(s.cashMovements || []), move] } : s,
        ),
      };
      break;
    }
    case "shift.close": {
      const posId = pos();
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
      next = closeShift(state, posId, p.counted, { note, countedDetail, by: actor?.name || null });
      break;
    }
    default:
      fail("Veprimi nuk njihet.");
  }
  // One pass over every path that can change a table's lines (order.add/remove/pay/
  // cancel), rather than stamping it separately in each case above.
  if (next.tables !== state.tables) {
    next = {
      ...next,
      tables: next.tables.map((t) => {
        const before = state.tables.find((x) => x.id === t.id);
        if (!before || before.lines.length === t.lines.length) return t;
        // An emptied table forgets its order's note, allergy and course.
        return t.lines.length
          ? { ...t, occupiedSince: t.occupiedSince ?? now }
          : { ...t, occupiedSince: null, note: "", allergy: "", course: 1 };
      }),
    };
  }
  if (next.tickets) next = { ...next, tickets: pruneTickets(next.tickets, next.invoices) };
  return { state: next, result };
}
