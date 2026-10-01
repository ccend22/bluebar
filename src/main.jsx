import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { money, total } from "./domain.js";
import { useDatabase } from "./useDatabase.js";
import { Login } from "./Login.jsx";
import { BusinessNetwork } from "./BusinessNetwork.jsx";
import { AccountSettings, LoginModeSettings, ManagerLoginSettings } from "./LoginModeSettings.jsx";
import { Fiscalization } from "./Fiscalization.jsx";
import { PAPERS, paperWidth, printFitted, setPaperWidth } from "./printPaper.js";
import { NetworkPrinters } from "./NetworkPrinters.jsx";
import { WaiterPatternEditor } from "./PatternPad.jsx";
import { FloorPlan } from "./FloorPlan.jsx";
import { arrange, collisions, sizeFor, spanOf } from "./floorGeometry.js";
import { ChoiceField } from "./ChoiceField.jsx";
import { Reports } from "./Reports.jsx";
import { Orders } from "./Orders.jsx";
import { Stations, useStationPrinting } from "./Stations.jsx";
import { TableOrder } from "./TableOrder.jsx";
import { ShiftReport, Shifts } from "./Shifts.jsx";
import { launch, useInstall, useOnline } from "./pwa.js";
import { fetchSession, fiscalizeInvoice, logout, reprintDocument, setUnauthorizedHandler, setWaiterPin } from "./api.js";
import {
  Icon,
  Search,
  Empty,
  Badge,
  Field,
  SectionHeading,
  TableSymbol,
  TableShapePicker,
  DepartmentTag,
} from "./components.jsx";
import "./style.css";

// On a phone the manager's nav is a bottom tab bar: these stay as tabs, the rest
// open from "Më shumë".
const MOBILE_TABS = ["Tavolinat", "Porositë", "Faturat", "Turnet"];
const pages = [
  {
    name: "Tavolinat",
    icon: "tables",
    description:
      "Salla juaj, në një vështrim. Zgjidhni një tavolinë për të nisur.",
  },
  {
    name: "Porositë",
    icon: "list",
    description: "Porositë e hapura, si listë, gati për t'u mbyllur.",
  },
  {
    name: "Repartet",
    icon: "coffee",
    description: "Fletët e çdo reparti — bar, ëmbëltore, restorant — gati për t'u përgatitur.",
  },
  {
    name: "Faturat",
    icon: "receipt",
    description: "Çdo pagesë e regjistruar, çdo faturë lehtësisht e gjendshme.",
  },
  {
    name: "Inventari",
    icon: "stock",
    description: "Kontrolloni gjendjen dhe mbani stokun gati për shërbim.",
  },
  {
    name: "Produktet",
    icon: "menu",
    description: "Një menu e organizuar, nga kategoria te çmimi.",
  },
  {
    name: "Kamarierët",
    icon: "people",
    description: "Ekipi, tavolinat dhe gjendja e secilit profil.",
  },
  {
    name: "Turnet",
    icon: "clock",
    description: "Nga fondi fillestar te numërimi përfundimtar i arkës.",
  },
  {
    name: "Raportet",
    icon: "chart",
    description: "Të ardhurat, produktet dhe kamarierët më të mirë.",
  },
  {
    name: "Cilësimet",
    icon: "settings",
    description: "Fiskalizimi, rrjeti i lokalit, hyrja e stafit dhe printerët.",
  },
];
const matches = (text, query) =>
  text.toLocaleLowerCase("sq").includes(query.trim().toLocaleLowerCase("sq"));
const date = (value) => {
  const d = new Date(value);
  return [d.getDate(), d.getMonth() + 1, d.getFullYear()]
    .map((v, i) => (i < 2 ? String(v).padStart(2, "0") : v))
    .join(".");
};
const longDate = (value) => {
  const d = new Date(value);
  return `${d.getDate()} ${["janar", "shkurt", "mars", "prill", "maj", "qershor", "korrik", "gusht", "shtator", "tetor", "nëntor", "dhjetor"][d.getMonth()]} ${d.getFullYear()}`;
};
const time = (value) =>
  new Date(value).toLocaleTimeString("sq-AL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
// products: optional — only passed by the manager-facing Faturat preview, never the
// customer's printed copy. When present, groups lines by the product's current
// department (bar/kuzhinë/ëmbëltore/...) so staff can see who prepared what; a line
// whose product has no department, or was deleted since, falls into "Tjetër".
function Receipt({ invoice, venueName, waiterName, products }) {
  // preBill: a still-open table's order, printed before payment exists — no invoice
  // number, no fiscal block, no payment method yet (see printOrder() in App).
  const preBill = invoice.preBill;
  const fiscalized = !preBill && invoice.fiscalStatus === "fiskalizuar" && invoice.fiscalIic;
  const groups = products && (() => {
    const byDept = new Map();
    for (const l of invoice.lines) {
      const dept = products.find((p) => p.id === l.id)?.department || "Tjetër";
      if (!byDept.has(dept)) byDept.set(dept, []);
      byDept.get(dept).push(l);
    }
    return [...byDept.entries()];
  })();
  return (
    <>
      <div className="receipt-brand">
        {venueName || "BlueBar"}<span>BAR & KAFE</span>
      </div>
      <p>
        {preBill
          ? "PARA-FATURË · JO PËR PAGESË"
          : fiscalized
            ? "FATURË E FISKALIZUAR"
            : "KOPJE DEMO · JO FATURË FISKALE"}
      </p>
      <div className="receipt-meta">
        {!preBill && <span>Fatura D-{invoice.id}</span>}
        <span>Tavolina {String(invoice.table).padStart(2, "0")}</span>
      </div>
      <p>
        {date(invoice.date)} · {time(invoice.date)}
        {waiterName ? ` · ${waiterName}` : ""}
      </p>
      <hr />
      {groups
        ? groups.map(([dept, lines]) => (
            <div className="receipt-department" key={dept}>
              <p className="receipt-department-title">{dept.toUpperCase()}</p>
              {lines.map((l) => (
                <div className="receipt-line" key={l.id}>
                  <span>
                    {l.qty} × {l.name}
                    <small>{money(l.price)} / copë</small>
                  </span>
                  <b>{money(l.qty * l.price)}</b>
                </div>
              ))}
            </div>
          ))
        : invoice.lines.map((l) => (
            <div className="receipt-line" key={l.id}>
              <span>
                {l.qty} × {l.name}
                <small>{money(l.price)} / copë</small>
              </span>
              <b>{money(l.qty * l.price)}</b>
            </div>
          ))}
      <hr />
      <div className="receipt-total">
        <b>TOTALI</b>
        <strong>{money(invoice.total)}</strong>
      </div>
      {!preBill && <p>Pagesa: {invoice.method}</p>}
      {fiscalized && (
        <>
          <hr />
          <p className="receipt-fiscal">NIVF: {invoice.fiscalIic}</p>
          <p className="receipt-fiscal">NSLF: {invoice.fiscalFic}</p>
          {invoice.fiscalVerificationUrl && (
            <p className="receipt-fiscal-url">{invoice.fiscalVerificationUrl}</p>
          )}
        </>
      )}
      <p>Faleminderit për vizitën!</p>
    </>
  );
}
// What one "Dërgo" round sent to one station: no prices, big quantities — it's a
// work order for the bar/kitchen, not a bill. The full invoice comes at payment.
// Exact amount, then the next 500 / 1,000 / 5,000 up — the notes a customer hands over.
const amount = (n) => new Intl.NumberFormat("sq-AL", { maximumFractionDigits: 0 }).format(n);
const quickCash = (t) =>
  [...new Set([t, ...[500, 1000, 5000].map((n) => Math.ceil(t / n) * n)])].slice(0, 4);
function StationTicket({ ticket, waiterName }) {
  return (
    <>
      <div className="receipt-brand">
        {ticket.department.toUpperCase()}
        <span>{ticket.cancelledAt ? "ANULUAR · MOS E PËRGATITNI" : "POROSI PËR REPARTIN"}</span>
      </div>
      <div className="receipt-meta">
        <span>Tavolina {String(ticket.table).padStart(2, "0")}</span>
        <span>Raundi {ticket.round}</span>
      </div>
      <p>
        {date(ticket.date)} · {time(ticket.date)}
        {waiterName ? ` · ${waiterName}` : ""}
      </p>
      <hr />
      {ticket.lines.map((l) => (
        <div className="receipt-line station-line" key={l.id}>
          <span>
            <b>{l.qty} ×</b> {l.name}
          </span>
        </div>
      ))}
      <hr />
    </>
  );
}
function App({ user, onLogout, onUserChange }) {
  const database = useDatabase();
  const online = useOnline();
  const installOffer = useInstall();
  const { state } = database;
  const [page, setPage] = useState("Tavolinat"),
    [selected, setSelected] = useState(null),
    [area, setArea] = useState("Të gjitha"),
    [status, setStatus] = useState("Të gjitha"),
    [category, setCategory] = useState("Të gjitha"),
    [query, setQuery] = useState("");
  const [notice, setNotice] = useState(null),
    [pinFor, setPinFor] = useState(null),
    [patternFor, setPatternFor] = useState(null),
    [waiter, setWaiter] = useState(
      () => user.waiterId ?? state.waiters.find((w) => w.active)?.id,
    );
  const role = user.role === "manager" ? "Menaxher" : "Kamarier";
  const [receipt, setReceipt] = useState(null),
    [payment, setPayment] = useState(null),
    [received, setReceived] = useState(""),
    [editor, setEditor] = useState(null),
    [paymentFilter, setPaymentFilter] = useState("Të gjitha"),
    [stockFilter, setStockFilter] = useState("Të gjitha"),
    [manageTables, setManageTables] = useState(false),
    [report, setReport] = useState(null),
    [cancelling, setCancelling] = useState(false),
    [deleteConfirmId, setDeleteConfirmId] = useState(null),
    [floorEditing, setFloorEditing] = useState(false),
    [floorSelected, setFloorSelected] = useState(null),
    [floorSaving, setFloorSaving] = useState(false),
    // Table management works on an unsaved draft — new tables, edited area/shape/seats,
    // moved/resized tables — shown live everywhere and saved with one "Konfirmo".
    [tableEdits, setTableEdits] = useState({}),
    [tableLayout, setTableLayout] = useState({}),
    [tablesAdded, setTablesAdded] = useState([]),
    [newTable, setNewTable] = useState({ area: "", shape: "Drejtkëndësh", seats: 4 }),
    [orderMode, setOrderMode] = useState("summary"),
    [fiscalizeChoice, setFiscalizeChoice] = useState(false),
    [ticketPrint, setTicketPrint] = useState(null),
    [deptFilter, setDeptFilter] = useState("Të gjitha"),
    [moreOpen, setMoreOpen] = useState(false),
    [paper, setPaper] = useState(paperWidth);
  const dialog = useRef(null),
    dialogTrigger = useRef(null),
    heading = useRef(null),
    orderHeading = useRef(null);
  useEffect(() => {
    // Waiter sessions stay locked to their own id; only managers pick who an order belongs to.
    if (user.waiterId == null && !state.waiters.some((w) => w.id === waiter && w.active))
      setWaiter(state.waiters.find((w) => w.active)?.id);
  }, [state.waiters, waiter, user.waiterId]);
  useEffect(() => {
    document.title = `BlueBar · ${page}`;
  }, [page]);
  useEffect(() => {
    if (!payment) return;
    if (!dialog.current?.open) {
      dialogTrigger.current = document.activeElement;
      dialog.current?.showModal();
    }
  }, [payment]);
  useEffect(() => {
    if (selected !== null && window.matchMedia("(max-width: 760px), (max-height: 500px) and (pointer: coarse)").matches) {
      orderHeading.current?.focus({ preventScroll: true });
      orderHeading.current
        ?.closest(".order")
        ?.scrollIntoView({ block: "start" });
    }
  }, [selected]);
  const notify = (text, tone = "success") => setNotice({ text, tone });
  const update = async (type, payload, message) => {
    try {
      const data = await database.execute(type, payload);
      message ? notify(message) : setNotice(null);
      return data;
    } catch (e) {
      notify(e.message, "error");
      return false;
    }
  };
  const nav = (p) => {
    if (!leaveTableDraft()) return;
    setPage(p);
    setSelected(null);
    setQuery("");
    setCategory("Të gjitha");
    setDeptFilter("Të gjitha");
    setNotice(null);
    setEditor(null);
    setReceipt(null);
    setTicketPrint(null);
    setManageTables(false);
    setReport(null);
    setFloorEditing(false);
    setFloorSelected(null);
    setOrderMode("summary");
    setTimeout(() => heading.current?.focus(), 0);
  };
  const tableFields = (t) => ({ area: t.area, shape: t.shape || "Drejtkëndësh", seats: t.seats });
  const draftCount = {
    added: tablesAdded.length,
    edited: Object.keys(tableEdits).length,
    moved: Object.keys(tableLayout).filter((id) => !tableEdits[id]).length,
  };
  const draftDirty = draftCount.added + draftCount.edited + draftCount.moved > 0;
  const discardTableDraft = () => {
    setTableEdits({});
    setTableLayout({});
    setTablesAdded([]);
    setEditor(null);
  };
  // false = the manager chose to stay and keep their unsaved tables.
  const leaveTableDraft = () => {
    if (draftDirty && !window.confirm("Ndryshimet e tavolinave nuk janë ruajtur. T'i hedh poshtë?")) return false;
    discardTableDraft();
    return true;
  };
  // Only differences from the saved table are kept, so undoing a change by hand
  // (clicking the old shape again) leaves nothing pending.
  const editTable = (id, patch) =>
    setTableEdits((edits) => {
      const saved = tableFields(state.tables.find((t) => t.id === id));
      const merged = { ...saved, ...edits[id], ...patch };
      const { [id]: _, ...rest } = edits;
      return Object.keys(saved).every((k) => saved[k] === merged[k]) ? rest : { ...edits, [id]: merged };
    });
  const changeFloorLayout = (id, patch) =>
    setTableLayout((layout) => {
      const t = state.tables.find((x) => x.id === id);
      return {
        ...layout,
        [id]: { posX: t.posX, posY: t.posY, width: t.width, height: t.height, rotation: t.rotation, ...layout[id], ...patch },
      };
    });
  const addDraftTable = () => {
    const area = newTable.area.trim();
    if (!area) return notify("Vendosni zonën e tavolinës.", "error");
    setTablesAdded((added) => [...added, { key: crypto.randomUUID(), ...newTable, area }]);
  };
  async function saveTableDraft() {
    if (Object.values(tableEdits).some((e) => !e.area.trim()))
      return notify("Çdo tavolinë duhet të ketë një zonë.", "error");
    const ids = [...new Set([...Object.keys(tableEdits), ...Object.keys(tableLayout)])].map(Number);
    const tables = [
      ...ids
        .map((id) => state.tables.find((t) => t.id === id))
        .filter(Boolean)
        .map((t) => {
          const fields = { ...tableFields(t), ...tableEdits[t.id] };
          return { id: t.id, ...fields, area: fields.area.trim(), ...tableLayout[t.id] };
        }),
      ...tablesAdded.map(({ area, shape, seats }) => ({ area, shape, seats })),
    ];
    const parts = [
      draftCount.added && `${draftCount.added} ${draftCount.added === 1 ? "tavolinë e re" : "tavolina të reja"}`,
      draftCount.edited && `${draftCount.edited} ${draftCount.edited === 1 ? "e ndryshuar" : "të ndryshuara"}`,
      draftCount.moved && `${draftCount.moved} ${draftCount.moved === 1 ? "e zhvendosur" : "të zhvendosura"}`,
    ].filter(Boolean);
    setFloorSaving(true);
    if (await update("tables.save", { tables }, `U ruajt: ${parts.join(" · ")}.`)) {
      discardTableDraft();
      setFloorSelected(null);
    }
    setFloorSaving(false);
  }
  const selectTable = (t) => {
    setCancelling(false);
    setSelected(t.id);
    setOrderMode(t.lines.length ? "summary" : "add");
    setQuery("");
    setCategory("Të gjitha");
    setNotice(null);
  };
  // The Porositë (Orders) list is a second entry point into the same order/payment
  // flow the floor plan already has — jump to it instead of rebuilding it.
  const openOrderTable = (t) => {
    setPage("Tavolinat");
    selectTable(t);
  };
  const closeOrderTable = (t, method) => {
    setSelected(t.id);
    startPayment(method);
  };
  // Deactivated tables ("Menaxho tavolinat") drop off the floor but stay listed there for reactivation.
  const activeTables = state.tables.filter((t) => t.active),
    areas = [
      "Të gjitha",
      ...[...new Set(activeTables.map((t) => t.area))].sort((a, b) =>
        a.localeCompare(b, "sq"),
      ),
    ];
  // The floor plan shows the unsaved draft (shape, size, position) as if it were saved.
  const floorTables = activeTables.map((t) => ({ ...t, ...tableEdits[t.id], ...tableLayout[t.id] }));
  // Tables (by id) that claim a cell another table also claims.
  const floorClashes = [...new Set(collisions(floorTables).flat())];
  const table = activeTables.find((t) => t.id === selected),
    occupied = activeTables.filter((t) => t.lines.length).length;
  const available = (p) =>
    p.stock -
    state.tables
      .flatMap((t) => t.lines)
      .filter((l) => l.id === p.id)
      .reduce((sum, l) => sum + l.qty, 0);
  const filteredProducts = state.products.filter(
    (p) =>
      matches(p.name, query) &&
      (category === "Të gjitha" || p.category === category),
  );
  const filteredInvoices = state.invoices.filter(
    (i) =>
      matches(`D-${i.id}`, query) &&
      (paymentFilter === "Të gjitha" || i.method === paymentFilter),
  );
  const menuProducts = filteredProducts.filter(
    (p) =>
      deptFilter === "Të gjitha" ||
      (deptFilter === "Pa kategori" ? !p.department : p.department === deptFilter),
  );
  const unrouted = state.products.filter((p) => !p.department).length;
  const filteredStock = state.products.filter(
    (p) =>
      matches(`${p.name} ${p.category}`, query) &&
      (stockFilter === "Të gjitha" || p.stock <= 10),
  );
  const lowStock = state.products.filter((p) => p.stock <= 10).length;
  const pendingUnits = (t) => t.lines.reduce((s, l) => s + l.qty - (l.sent || 0), 0);
  const print = (invoice) => {
    setTicketPrint(null);
    setReceipt(invoice);
    setTimeout(printFitted, 100);
  };
  // One print job, one page per station — on a thermal printer each ticket is cut
  // separately, so the kitchen slip and the bar slip come out apart.
  const printTickets = (tickets) => {
    setTicketPrint(tickets);
    setTimeout(printFitted, 100);
  };
  // The waiter's device doesn't print: each department's own device (Repartet →
  // "Printeri i kësaj pajisjeje") prints its own ticket. "Printo fletët" on the
  // notice is the fallback for a venue without station devices.
  const sendOrder = async (t) => {
    const data = await update("order.send", { tableId: t.id });
    if (data)
      setNotice({
        text: `U dërgua te: ${data.result.tickets.map((k) => k.department).join(", ")}.`,
        tone: "success",
        tickets: data.result.tickets,
      });
  };
  // Departments / invoices a LAN printer covers go through the print agent; the rest
  // still print from this browser.
  const networked = state.printers.flatMap((p) => p.departments);
  const cashierPrinter = state.printers.find((p) => p.receipts);
  const [stationDepartments, toggleStation] = useStationPrinting(
    state.tickets,
    database.ready,
    printTickets,
    networked,
  );
  const reprintTickets = async (tickets) => {
    const local = tickets.filter((k) => !networked.includes(k.department));
    try {
      for (const k of tickets.filter((k) => networked.includes(k.department)))
        await reprintDocument("ticket", k.id);
      if (local.length) printTickets(local);
      else notify("Fleta u dërgua te printeri i repartit.");
    } catch (e) {
      notify(e.message, "error");
    }
  };
  const reprintInvoice = async (invoice) => {
    if (!cashierPrinter) return print(invoice);
    try {
      await reprintDocument("invoice", invoice.id);
      notify(`Fatura D-${invoice.id} u dërgua te ${cashierPrinter.name}.`);
    } catch (e) {
      notify(e.message, "error");
    }
  };
  useEffect(() => {
    const clear = () => setTicketPrint(null);
    window.addEventListener("afterprint", clear);
    return () => window.removeEventListener("afterprint", clear);
  }, []);
  useEffect(() => {
    // A kitchen screen can't wait the default 10s poll for new tickets.
    if (page !== "Repartet") return;
    const timer = setInterval(() => database.refresh(), 4000);
    return () => clearInterval(timer);
  }, [page]);
  // Porositë's "Printo faturën": a pre-bill for a still-open table, before any
  // payment/invoice exists — see Receipt's preBill handling above.
  const printOrder = (t) => {
    print({
      preBill: true,
      id: t.id,
      table: t.id,
      waiter: t.waiter,
      date: new Date().toISOString(),
      lines: t.lines,
      total: total(t.lines),
    });
  };
  const startPayment = (method) => {
    setReceived("");
    setPayment(method);
  };
  const pressReceivedKey = (key) => {
    setReceived((current) => {
      if (key === "clear") return "";
      if (key === "back") return current.slice(0, -1);
      const next = `${current}${key}`.replace(/^0+(?=\d)/, "");
      return Number(next) <= 100000000 ? next : current;
    });
  };
  const cancelPayment = () => {
    dialog.current?.close();
    setPayment(null);
    dialogTrigger.current?.focus({ preventScroll: true });
  };
  async function pay(e) {
    e.preventDefault();
    if (payment !== "Cash" && payment !== "Kartë") return;
    if (payment === "Cash" && Number(received) < total(table.lines)) return;
    // Two submit buttons share this form; which one fired the submit decides
    // whether the sale also gets fiscalized right away or is left for later
    // (from Faturat's "Fiskalizo Faturën").
    const autoFiscalize = Boolean(state.fiscal?.enabled) && e.nativeEvent.submitter?.value !== "skip-fiscalize";
    const command = {
      tableId: selected,
      method: payment,
      fiscalize: autoFiscalize,
      ...(payment === "Cash" ? { received: Number(received) } : {}),
    };
    cancelPayment();
    const data = await update("order.pay", command);
    if (data) {
      const invoice = data.state.invoices.find(
        (i) => i.id === data.result.invoiceId,
      );
      setReceipt(invoice);
      setSelected(null);
      notify(
        `Pagesa u regjistrua. Fatura D-${invoice.id} · ${money(invoice.total)}` +
          (cashierPrinter ? ` · po printohet te ${cashierPrinter.name}` : ""),
      );
      // The full invoice prints on its own. With a cashier network printer the server
      // already queued it (held until the NIVF arrives when fiscalizing); otherwise
      // this browser prints it — after fiscalization, so the copy carries the codes.
      const printHere = (inv) => !cashierPrinter && print(inv);
      // Best-effort and non-blocking: the sale is already done. A real tax-authority
      // round trip can take a few seconds, so this updates the receipt once it resolves
      // rather than making the customer wait before the payment even looks finished.
      if (autoFiscalize)
        fiscalizeInvoice(invoice.id)
          .then((data) => {
            const fiscalized = data.state.invoices.find((i) => i.id === invoice.id) || invoice;
            setReceipt((current) => (current?.id === invoice.id ? fiscalized : current));
            database.refresh();
            printHere(fiscalized);
          })
          .catch(() => printHere(invoice));
      else printHere(invoice);
    }
  }
  async function saveProduct(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget),
      name = form.get("name").trim(),
      price = Number(form.get("price"));
    if (!name || !Number.isSafeInteger(price) || price <= 0)
      return notify("Vendosni një emër dhe një çmim të vlefshëm.", "error");
    // Without a department the product's tickets can't reach any station.
    if (state.departments.length && !form.get("department"))
      return notify("Zgjidhni kategorinë: ku përgatitet produkti (bar, kuzhinë…).", "error");
    if (
      state.products.some(
        (p) =>
          p.id !== editor.id && p.name.toLowerCase() === name.toLowerCase(),
      )
    )
      return notify("Një produkt me këtë emër ekziston.", "error");
    if (
      await update(
        "product.save",
        {
          ...(editor.id ? { id: editor.id } : {}),
          name,
          price,
          category: form.get("category"),
          department: form.get("department") || undefined,
        },
        editor.id
          ? "Produkti u përditësua. Porositë ekzistuese ruajnë çmimin e tyre."
          : "Produkti u shtua. Shtoni gjendjen fillestare te Inventari.",
      )
    )
      setEditor(null);
  }
  // The shift report goes to the cashier's network printer when there is one.
  const printShiftReport = async (r) => {
    if (!cashierPrinter) return printFitted();
    try {
      await reprintDocument("shift", r.shift.id);
      notify(`Raporti u dërgua te ${cashierPrinter.name}.`);
    } catch (e) {
      notify(e.message, "error");
    }
  };
  if (database.loading || !database.ready)
    return (
      <main className="database-setup">
        <span className="brand">BlueBar</span>
        <h1>
          {database.loading
            ? "Po lidhemi me databazën…"
            : "Lidhja me databazën"}
        </h1>
        <p>{database.error || "Po ngarkohen të dhënat nga serveri."}</p>
        {!database.loading && (
          <>
            <p>
              Konfiguroni lidhjen në server dhe ekzekutoni migrimet. Të dhënat e
              mëparshme lokale mbeten të paprekura.
            </p>
            <button className="primary" onClick={database.refresh}>
              Provo përsëri
            </button>
          </>
        )}
      </main>
    );
  return (
    <>
      {database.pending && !database.busy && !database.syncingOrders && (
        <div className="database-overlay">
          <section className="panel" role="status">
            <h2>Veprimi kërkon verifikim</h2>
            <p>Përgjigjja e mëparshme mungon. Verifikojeni përpara se të vazhdoni; veprimi nuk do të dyfishohet.</p>
              <button
                className="primary"
                onClick={async () => {
                  try {
                    const data = await database.execute(null, null, true);
                    if (data.result?.invoiceId) {
                      setReceipt(
                        data.state.invoices.find(
                          (i) => i.id === data.result.invoiceId,
                        ),
                      );
                      setSelected(null);
                    }
                    notify("Veprimi u verifikua dhe të dhënat u rifreskuan.");
                  } catch (e) {
                    notify(e.message, "error");
                  }
                }}
              >
                Verifiko veprimin
              </button>
          </section>
        </div>
      )}
      <a className="skip-link" href="#main">
        Kalo te përmbajtja
      </a>
      <div
        className={`app ${page === "Tavolinat" && !manageTables ? "floor-app" : ""}`}
        inert={!!database.pending && !database.busy && !database.syncingOrders}
      >
        <aside className="sidebar">
          <a className="brand" href="#main" onClick={() => nav("Tavolinat")}>
            <span className="brandmark">b.</span>BlueBar
          </a>
          <div className="workspace-label">
            <span className="venue-dot" />
            {user.venue?.name || "BlueBar"}
          </div>
          <nav aria-label="Navigimi kryesor">
            {pages
              .filter((p) => role === "Menaxher" || ["Tavolinat", "Porositë", "Repartet"].includes(p.name))
              .map((p) => (
                <button
                  key={p.name}
                  className={role === "Menaxher" && !MOBILE_TABS.includes(p.name) ? "nav-extra" : undefined}
                  aria-current={page === p.name ? "page" : undefined}
                  onClick={() => {
                    setMoreOpen(false);
                    nav(p.name);
                  }}
                >
                  <Icon name={p.icon} />
                  <span>{p.name}</span>
                  {p.name === "Inventari" && lowStock > 0 && (
                    <span className="nav-count">{lowStock}</span>
                  )}
                </button>
              ))}
            {role === "Menaxher" && (
              <button
                className="nav-more"
                aria-expanded={moreOpen}
                aria-current={!MOBILE_TABS.includes(page) ? "page" : undefined}
                onClick={() => setMoreOpen((open) => !open)}
              >
                <Icon name="more" />
                <span>{MOBILE_TABS.includes(page) ? "Më shumë" : page}</span>
                {lowStock > 0 && <span className="nav-count">{lowStock}</span>}
              </button>
            )}
          </nav>
          {moreOpen && (
            <div className="nav-sheet-layer" onClick={() => setMoreOpen(false)} onKeyDown={(e) => e.key === "Escape" && setMoreOpen(false)}>
              <div className="nav-sheet" role="menu" aria-label="Më shumë faqe" onClick={(e) => e.stopPropagation()}>
                {pages
                  .filter((p) => !MOBILE_TABS.includes(p.name))
                  .map((p) => (
                    <button
                      key={p.name}
                      role="menuitem"
                      autoFocus={p.name === pages.find((x) => !MOBILE_TABS.includes(x.name)).name}
                      aria-current={page === p.name ? "page" : undefined}
                      onClick={() => {
                        setMoreOpen(false);
                        nav(p.name);
                      }}
                    >
                      <Icon name={p.icon} />
                      <span>{p.name}</span>
                      {p.name === "Inventari" && lowStock > 0 && <span className="nav-count">{lowStock}</span>}
                    </button>
                  ))}
                <div className="nav-sheet-user">
                  <span className="avatar">{user.name[0]}</span>
                  <div>
                    <strong>{user.name}</strong>
                    <small>{user.venue?.name || "BlueBar"}</small>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="sidebar-note">
            <Icon name="info" size={18} />
            <p>
              {database.provider}
              <small>
                {database.error
                  ? "Lidhja kërkon kontroll."
                  : "Të dhënat ruhen në databazë."}
              </small>
            </p>
          </div>
          <div className="sidebar-bottom">
            <span className="avatar">{user.name[0]}</span>
            <div>
              <strong>{user.name}</strong>
              <small>{role}</small>
            </div>
            <span className="session-dot" />
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div className="breadcrumb">
              Hapësira e punës <Icon name="arrow" size={14} />
              <strong>{page}</strong>
            </div>
            <div className="topbar-brand" aria-hidden="true">
              <span className="brandmark">b.</span>
              <span>{user.venue?.name || "BlueBar"}</span>
            </div>
            <div className="header-actions">
              <span className="save-status" role="status" aria-live="polite">
                {database.saving ? "Po ruhet…" : ""}
              </span>
              {!online && (
                <span className="shift-status offline" role="status">
                  <span className="dot" />
                  Pa internet
                </span>
              )}
              <span className={`shift-status ${state.shift ? "" : "closed"}`}>
                <span className="dot" />
                {state.shift ? "Turn i hapur" : "Turn i mbyllur"}
              </span>
              <span className="role">
                <span>{user.name}</span>
                <button onClick={onLogout} disabled={database.saving}>Dil</button>
              </span>
            </div>
          </header>
          <div className="demo">
            <Icon name="info" size={15} />
            <span>
              {user.venue?.name || "BlueBar"} ·{" "}
              {state.fiscal?.enabled
                ? `Fiskalizim aktiv${state.fiscal.mode === "test" ? " (test)" : ""}.`
                : "Pa fiskalizim."}
            </span>
            <Badge>{database.error ? "PA LIDHJE" : "DATABASE"}</Badge>
          </div>
          <main id="main">
            <fieldset className="workspace-controls" disabled={database.busy} aria-busy={database.busy} aria-label="Hapësira e punës">
            <div className="title-row">
              <div>
                <h1 ref={heading} tabIndex={-1}>
                  {page}
                </h1>
                <p>{pages.find((p) => p.name === page).description}</p>
              </div>
              <div className="title-actions">
                {page === "Produktet" ? (
                  <button className="primary" onClick={() => setEditor({})}>
                    <Icon name="plus" size={18} />
                    Shto produkt
                  </button>
                ) : page === "Tavolinat" && role === "Menaxher" ? (
                  manageTables ? (
                    <button
                      onClick={() => {
                        if (!leaveTableDraft()) return;
                        setFloorEditing(false);
                        setFloorSelected(null);
                        setManageTables(false);
                        setSelected(null);
                      }}
                    >
                      <Icon name="tables" size={18} />
                      Shiko sallën
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setManageTables(true);
                        setSelected(null);
                        setEditor(null);
                      }}
                    >
                      <Icon name="edit" size={18} />
                      Menaxho sallën
                    </button>
                  )
                ) : (
                  <span className="date">
                    <Icon name="clock" size={16} />
                    {longDate(new Date())}
                  </span>
                )}
              </div>
            </div>
            {!online && (
              <div className="notice warning" role="status">
                <Icon name="info" />
                <span>
                  Pa lidhje me internetin. Porositë dhe pagesat nuk ruhen derisa të rikthehet lidhja.
                </span>
              </div>
            )}
            {installOffer && (
              <div className="notice install-offer">
                <img src="/icons/icon-192.png" alt="" width="32" height="32" />
                <span>
                  {installOffer.kind === "prompt"
                    ? "Instaloni BlueBar si aplikacion: hapet me një prekje, në ekran të plotë."
                    : "Instaloni BlueBar: prekni Shpërndaj, pastaj “Shto në ekranin bazë”."}
                </span>
                {installOffer.kind === "prompt" && (
                  <button className="primary" onClick={installOffer.install}>
                    Instalo
                  </button>
                )}
                <button className="icon-button" onClick={installOffer.dismiss} aria-label="Mbyll ofertën e instalimit">
                  <Icon name="close" size={18} />
                </button>
              </div>
            )}
            {database.error && !database.pending && (
              <div className="notice error" role="alert">
                <Icon name="info" />
                <span>{database.error}</span>
                <button onClick={database.refresh}>Rilidh</button>
              </div>
            )}
            {notice && (
              <div
                className={`notice ${notice.tone}`}
                role={notice.tone === "error" ? "alert" : "status"}
              >
                <Icon
                  name={notice.tone === "error" ? "info" : "check"}
                  size={18}
                />
                <span>{notice.text}</span>
                {(page === "Tavolinat" || page === "Porositë") &&
                  receipt &&
                  !notice.tickets &&
                  notice.tone === "success" && (
                    <button onClick={() => reprintInvoice(receipt)}>
                      <Icon name="print" size={16} />
                      Printo faturën
                    </button>
                  )}
                {notice.tickets?.some((k) => !networked.includes(k.department)) && (
                    <button onClick={() => printTickets(notice.tickets.filter((k) => !networked.includes(k.department)))}>
                      <Icon name="print" size={16} />
                      Printo fletët
                    </button>
                  )}
                {page === "Turnet" && report && notice.tone === "success" && (
                  <button onClick={() => printShiftReport(report)}>
                    <Icon name="print" size={16} />
                    Printo raportin
                  </button>
                )}
                <button
                  className="icon-button"
                  onClick={() => setNotice(null)}
                  aria-label="Mbyll njoftimin"
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
            )}

            {page === "Tavolinat" &&
              (manageTables ? (
                <div className="management-layout table-management-layout">
                  <section className="panel table-management-panel">
                    <SectionHeading
                      title="Tavolinat e lokalit"
                      description={`${state.tables.length} tavolina · ${activeTables.length} aktive`}
                    >
                      <div className="floor-edit-actions">
                        {floorEditing ? (
                          <button onClick={() => (setFloorEditing(false), setFloorSelected(null))}>
                            <Icon name="tables" size={17} />
                            Lista e tavolinave
                          </button>
                        ) : (
                          <button onClick={() => setFloorEditing(true)} disabled={!activeTables.length}>
                            <Icon name="location" size={17} />
                            Vendos tavolinat në sallë
                          </button>
                        )}
                        <button className="primary" onClick={() => setEditor({})}>
                          <Icon name="plus" size={18} />
                          Shto tavolina
                        </button>
                      </div>
                    </SectionHeading>
                    {floorEditing ? (
                      <div className="floor-management">
                        {floorClashes.length > 0 ? (
                          <div className="notice warning floor-clash">
                            <Icon name="info" size={16} />
                            <span>
                              {floorClashes.length} tavolina mbivendosen: {floorClashes.map((id) => String(id).padStart(2, "0")).join(", ")}.
                            </span>
                            <button
                              onClick={() => {
                                for (const [id, patch] of Object.entries(arrange(floorTables)))
                                  changeFloorLayout(Number(id), patch);
                              }}
                            >
                              Rregullo automatikisht
                            </button>
                          </div>
                        ) : (
                          <p className="floor-edit-hint">
                            <Icon name="info" size={16} />
                            Tërhiqni tavolinat në një kuti të lirë. Zgjidhni një tavolinë për ta rrotulluar ose zmadhuar; kutia e kuqe tregon që vendi është i zënë.
                          </p>
                        )}
                        <FloorPlan
                          tables={floorTables}
                          editing
                          selected={floorSelected}
                          onSelectTable={(t) => setFloorSelected(t?.id ?? null)}
                          onLayoutChange={changeFloorLayout}
                        />
                        {floorSelected && (
                          <div className="floor-selected-tools">
                            <span>Tavolina {String(floorSelected).padStart(2, "0")} · {floorTables.find((t) => t.id === floorSelected)?.shape}</span>
                            <button onClick={() => setEditor({ id: floorSelected })}>
                              Ndrysho formën dhe vendet
                            </button>
                          </div>
                        )}
                      </div>
                    ) : state.tables.length || tablesAdded.length ? (
                      <div className="table-admin-grid">
                        {[...state.tables]
                          .sort((a, b) => a.id - b.id)
                          .map((saved) => ({ ...saved, ...tableEdits[saved.id] }))
                          .map((t) => (
                            <article
                              className={`table-admin-card ${t.active ? "" : "inactive"} ${editor?.id === t.id ? "editing" : ""} ${tableEdits[t.id] ? "drafted" : ""}`}
                              key={t.id}
                            >
                              <div className="table-admin-head">
                                <div>
                                  <small>Tavolina</small>
                                  <strong>{String(t.id).padStart(2, "0")}</strong>
                                </div>
                                {tableEdits[t.id] ? (
                                  <Badge tone="amber">E ndryshuar</Badge>
                                ) : (
                                  <Badge tone={t.active ? "green" : ""}>
                                    {t.active ? "Aktive" : "Joaktive"}
                                  </Badge>
                                )}
                              </div>
                              <div className="table-admin-visual">
                                <TableSymbol shape={t.shape} />
                                <span className="sr-only">
                                  Forma {t.shape || "Drejtkëndësh"}
                                </span>
                              </div>
                              <div className="table-admin-zone">
                                <Icon name="location" size={15} />
                                <span>
                                  {t.area} · {t.seats} vende
                                </span>
                              </div>
                              <div className="table-admin-actions">
                                <button
                                  aria-label={`Ndrysho tavolinën ${t.id}`}
                                  onClick={() => setEditor({ id: t.id })}
                                >
                                  <Icon name="edit" size={17} />
                                  Ndrysho
                                </button>
                                <button
                                  className="subtle-button"
                                  disabled={t.active && t.lines.length > 0}
                                  aria-describedby={
                                    t.active && t.lines.length > 0
                                      ? `table-help-${t.id}`
                                      : undefined
                                  }
                                  onClick={() =>
                                    update(
                                      "table.toggle",
                                      { id: t.id },
                                      t.active
                                        ? "Tavolina u çaktivizua."
                                        : "Tavolina u aktivizua.",
                                    )
                                  }
                                >
                                  <Icon name="power" size={17} />
                                  {t.active ? "Çaktivizo" : "Aktivizo"}
                                </button>
                              </div>
                              {t.active && t.lines.length > 0 && (
                                <small
                                  className="table-admin-help"
                                  id={`table-help-${t.id}`}
                                >
                                  Ka porosi të hapura
                                </small>
                              )}
                              {(() => {
                                const hasHistory = state.invoices.some((inv) => inv.table === t.id);
                                const blocked = t.lines.length > 0 || hasHistory;
                                if (deleteConfirmId === t.id)
                                  return (
                                    <div className="table-admin-actions">
                                      <button className="text-button" onClick={() => setDeleteConfirmId(null)}>
                                        Anulo
                                      </button>
                                      <button
                                        className="danger-button"
                                        onClick={async () => {
                                          if (await update("table.delete", { id: t.id }, "Tavolina u fshi."))
                                            setDeleteConfirmId(null);
                                        }}
                                      >
                                        Fshi përfundimisht
                                      </button>
                                    </div>
                                  );
                                // An open order is already explained above (for the
                                // toggle button); only the history case needs its own note.
                                return (
                                  <>
                                    <button
                                      className="text-button table-admin-delete"
                                      disabled={blocked}
                                      aria-describedby={
                                        t.lines.length > 0
                                          ? `table-help-${t.id}`
                                          : hasHistory
                                            ? `table-delete-help-${t.id}`
                                            : undefined
                                      }
                                      onClick={() => setDeleteConfirmId(t.id)}
                                    >
                                      Fshi tavolinën
                                    </button>
                                    {hasHistory && t.lines.length === 0 && (
                                      <small className="table-admin-help" id={`table-delete-help-${t.id}`}>
                                        Ka histori faturash; përdorni çaktivizimin
                                      </small>
                                    )}
                                  </>
                                );
                              })()}
                            </article>
                          ))}
                        {tablesAdded.map((t, n) => (
                          <article className="table-admin-card drafted new" key={t.key}>
                            <div className="table-admin-head">
                              <div>
                                <small>Tavolinë e re</small>
                                <strong>+{n + 1}</strong>
                              </div>
                              <Badge tone="amber">E re</Badge>
                            </div>
                            <div className="table-admin-visual">
                              <TableSymbol shape={t.shape} />
                            </div>
                            <div className="table-admin-zone">
                              <Icon name="location" size={15} />
                              <span>
                                {t.area} · {t.seats} vende
                              </span>
                            </div>
                            <div className="table-admin-actions">
                              <button
                                className="subtle-button"
                                aria-label={`Hiq tavolinën e re ${n + 1}`}
                                onClick={() => setTablesAdded((added) => added.filter((x) => x.key !== t.key))}
                              >
                                <Icon name="close" size={17} />
                                Hiq
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <Empty icon="tables" title="Ende pa tavolina">
                        Shtoni tavolinën e parë për të nisur sallën.
                      </Empty>
                    )}
                    {draftDirty && (
                      <div className="draft-bar" role="status">
                        <span>
                          <b>Pa ruajtur:</b>{" "}
                          {[
                            draftCount.added && `${draftCount.added} ${draftCount.added === 1 ? "e re" : "të reja"}`,
                            draftCount.edited && `${draftCount.edited} ${draftCount.edited === 1 ? "e ndryshuar" : "të ndryshuara"}`,
                            draftCount.moved && `${draftCount.moved} ${draftCount.moved === 1 ? "e zhvendosur" : "të zhvendosura"}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        <button onClick={discardTableDraft} disabled={floorSaving}>
                          Anulo
                        </button>
                        <button className="primary" onClick={saveTableDraft} disabled={floorSaving}>
                          <Icon name="check" size={17} />
                          {floorSaving ? "Po ruhet…" : "Konfirmo"}
                        </button>
                      </div>
                    )}
                  </section>
                  <aside className="management-aside">
                    {editor && (() => {
                      const editing = editor.id && state.tables.find((t) => t.id === editor.id);
                      const values = editing ? { ...tableFields(editing), ...tableEdits[editing.id] } : newTable;
                      const change = (patch) => {
                        if (!editing) return setNewTable((v) => ({ ...v, ...patch }));
                        editTable(editing.id, patch);
                        // A bar only reads as a counter when it's wide: give the preview
                        // (and the save) bar proportions, and square it again when leaving Bar.
                        // Same cells, new proportions — so a shape change can never collide.
                        const current = { ...editing, ...tableEdits[editing.id], ...tableLayout[editing.id] };
                        if (patch.shape && (patch.shape === "Bar") !== (current.shape === "Bar")) {
                          const { cols, rows } = spanOf(current);
                          changeFloorLayout(editing.id, sizeFor(patch.shape, cols, rows));
                        }
                      };
                      return (
                        <section className="panel editor-panel">
                          <SectionHeading
                            title={editing ? `Tavolina ${String(editing.id).padStart(2, "0")}` : "Tavolina të reja"}
                            description={
                              editing
                                ? "Ndryshimi shfaqet menjëherë; ruhet kur shtypni Konfirmo."
                                : "Shtoni sa të doni, pastaj Konfirmo një herë."
                            }
                          >
                            <button className="icon-button" onClick={() => setEditor(null)} aria-label="Mbyll formularin e tavolinës">
                              <Icon name="close" size={18} />
                            </button>
                          </SectionHeading>
                          <form
                            key={editor.id || "new"}
                            className="stack-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              editing ? setEditor(null) : addDraftTable();
                            }}
                          >
                            <Field
                              label="Zona"
                              name="area"
                              list="table-areas"
                              value={values.area}
                              onChange={(e) => change({ area: e.target.value })}
                              placeholder="p.sh. Salla"
                              maxLength={40}
                              autoFocus={!editing}
                            />
                            <datalist id="table-areas">
                              {[...new Set(state.tables.map((t) => t.area))].map((a) => (
                                <option key={a} value={a} />
                              ))}
                            </datalist>
                            <TableShapePicker value={values.shape} onChange={(shape) => change({ shape })} />
                            <div className="field">
                              <span>Numri i vendeve</span>
                              <div className="quantity seats-stepper">
                                <button type="button" aria-label="Një vend më pak" disabled={values.seats <= 1} onClick={() => change({ seats: values.seats - 1 })}>
                                  −
                                </button>
                                <span>{values.seats}</span>
                                <button type="button" aria-label="Një vend më shumë" disabled={values.seats >= 12} onClick={() => change({ seats: values.seats + 1 })}>
                                  +
                                </button>
                              </div>
                            </div>
                            {editing ? (
                              <div className="actions">
                                {(tableEdits[editing.id] || tableLayout[editing.id]) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTableEdits(({ [editing.id]: _, ...rest }) => rest);
                                      setTableLayout(({ [editing.id]: _, ...rest }) => rest);
                                    }}
                                  >
                                    Rikthe
                                  </button>
                                )}
                                <button className="primary">Mbaro</button>
                              </div>
                            ) : (
                              <button className="primary">
                                <Icon name="plus" size={17} />
                                Shto tavolinën{tablesAdded.length ? ` (${tablesAdded.length} gati)` : ""}
                              </button>
                            )}
                          </form>
                        </section>
                      );
                    })()}
                    <div className="info-note">
                      <Icon name="tables" />
                      <div>
                        <strong>Çaktivizim, jo fshirje</strong>
                        <p>
                          Një tavolinë me fatura të lidhura nuk fshihet kurrë;
                          çaktivizimi e heq nga salla pa prekur historikun.
                        </p>
                      </div>
                    </div>
                  </aside>
                </div>
              ) : (
                <>
                {!state.shift && (
                  <div className="notice warning">
                    <Icon name="clock" />
                    <span>
                      Turni është i mbyllur. Hapni një turn për të marrë porosi.
                    </span>
                    {role === "Menaxher" && (
                      <button onClick={() => nav("Turnet")}>
                        Hap turnin
                        <Icon name="arrow" size={15} />
                      </button>
                    )}
                  </div>
                )}
                <div className="floor-summary">
                  <div>
                    <span className="status-marker available" />
                    <strong>{activeTables.length - occupied}</strong> të lira
                  </div>
                  <div>
                    <span className="status-marker occupied" />
                    <strong>{occupied}</strong> të zëna
                  </div>
                  <div className="open-total">
                    <span>Totali i porosive të hapura</span>
                    <strong>
                      {money(
                        activeTables.reduce((s, t) => s + total(t.lines), 0),
                      )}
                    </strong>
                  </div>
                </div>
                <div className={`floor-layout ${table ? "has-order" : ""}`}>
                  <section
                    className={`floor ${table ? "mobile-hidden" : ""}`}
                    aria-label="Tavolinat e lokalit"
                  >
                      <div className="toolbar floor-toolbar">
                        <div className="tabs" aria-label="Filtro zonën">
                          {areas.map((a) => (
                            <button
                              key={a}
                              aria-pressed={area === a}
                              onClick={() => setArea(a)}
                            >
                              {a}
                              {a !== "Të gjitha" && (
                                <span>
                                  {
                                    activeTables.filter((t) => t.area === a)
                                      .length
                                  }
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                        <ChoiceField
                          compact
                          label="Gjendja"
                          options={["Të gjitha", "Të lira", "Të zëna"].map((item) => ({ value: item, label: item }))}
                          value={status}
                          onChange={setStatus}
                        />
                      </div>
                    {role === "Menaxher" && floorClashes.length > 0 && (
                      <div className="notice warning floor-clash">
                        <Icon name="info" size={16} />
                        <span>Disa tavolina mbivendosen në sallë.</span>
                        <button
                          onClick={() => {
                            setManageTables(true);
                            setFloorEditing(true);
                            setSelected(null);
                          }}
                        >
                          Rregullo sallën
                        </button>
                      </div>
                    )}
                    {(() => {
                      const visible = activeTables.filter(
                        (t) =>
                          (area === "Të gjitha" || t.area === area) &&
                          (status === "Të gjitha" ||
                            Boolean(t.lines.length) === (status === "Të zëna")),
                      );
                      return visible.length ? (
                        <FloorPlan
                          tables={visible}
                          editing={false}
                          selected={selected}
                          onSelectTable={(t) => t && selectTable(t)}
                        />
                      ) : (
                        <Empty
                          icon="tables"
                          title={state.tables.length ? "Nuk ka tavolina në këtë filtër" : "Shtoni tavolinën e parë"}
                          action={
                            !state.tables.length ? (role === "Menaxher" && <button className="primary" onClick={() => { setManageTables(true); setEditor({}); }}>Shto tavolinë</button>) : <button
                              onClick={() => {
                                setArea("Të gjitha");
                                setStatus("Të gjitha");
                              }}
                            >
                              Shfaq të gjitha
                            </button>
                          }
                        >
                          {state.tables.length ? "Provoni një zonë ose gjendje tjetër." : "Biznesi juaj është gati. Konfiguroni sallën, produktet dhe stafin përpara hapjes së turnit."}
                        </Empty>
                      );
                    })()}
                  </section>
                  {table ? (
                    <TableOrder
                      table={table}
                      state={state}
                      role={role}
                      user={user}
                      waiter={waiter}
                      onWaiterChange={(next) => {
                        setWaiter(next);
                        update("order.assign", { tableId: selected, waiterId: next });
                      }}
                      mode={orderMode}
                      setMode={setOrderMode}
                      query={query}
                      setQuery={setQuery}
                      category={category}
                      setCategory={setCategory}
                      products={filteredProducts}
                      available={available}
                      update={update}
                      onClose={() => setSelected(null)}
                      onSend={sendOrder}
                      onPay={() => startPayment("Zgjidh")}
                      onPrintBill={printOrder}
                      cancelling={cancelling}
                      setCancelling={setCancelling}
                      headingRef={orderHeading}
                    />
                  ) : (
                    <aside className="floor-guide">
                      <div className="guide-symbol">
                        <TableSymbol />
                      </div>
                      <h2>
                        Çdo shërbim nis
                        <br />
                        nga një tavolinë.
                      </h2>
                      <p>
                        Zgjidhni tavolinën, shtoni produktet dhe mbyllni pagesën
                        kur klienti është gati.
                      </p>
                      <div className="guide-step">
                        <Icon name="tables" />
                        <span>
                          Zgjidhni tavolinën<small>Salla ose tarraca</small>
                        </span>
                      </div>
                      <div className="guide-step">
                        <Icon name="menu" />
                        <span>
                          Regjistroni porosinë
                          <small>Produktet dhe sasitë</small>
                        </span>
                      </div>
                      <div className="guide-step">
                        <Icon name="receipt" />
                        <span>
                          Paguani dhe printoni
                          <small>Cash ose kartë</small>
                        </span>
                      </div>
                      <div className="guide-footer">
                        <span className="dot" />
                        Pa hapa të panevojshëm.
                      </div>
                    </aside>
                  )}
                </div>
                </>
              ))}

            {page === "Porositë" && (
              <Orders
                state={state}
                selected={selected}
                onSelect={setSelected}
                onModify={openOrderTable}
                onClose={closeOrderTable}
                onPrint={printOrder}
                onSend={sendOrder}
                onReprintTicket={(ticket) => reprintTickets([ticket])}
                time={time}
              />
            )}

            {page === "Repartet" && (
              <Stations
                state={state}
                stationDepartments={stationDepartments}
                onToggleStation={toggleStation}
                onPrint={reprintTickets}
                time={time}
              />
            )}

            {page === "Faturat" && (
              <div
                className={`invoice-layout ${receipt ? "with-preview" : ""}`}
              >
                <section className="panel">
                  <SectionHeading
                    title="Regjistri i faturave"
                    description={`${state.invoices.length} fatura të regjistruara në databazë`}
                  >
                    <Badge tone="green">
                      {money(state.invoices.reduce((s, i) => s + i.total, 0))}
                    </Badge>
                  </SectionHeading>
                  <div className="toolbar">
                    <Search
                      label="Kërko faturë"
                      placeholder="Kërko numrin, p.sh. D-1"
                      value={query}
                      onChange={setQuery}
                    />
                    <ChoiceField
                      label="Mënyra e pagesës"
                      options={["Të gjitha", "Cash", "Kartë"].map((item) => ({ value: item, label: item }))}
                      value={paymentFilter}
                      onChange={setPaymentFilter}
                    />
                  </div>
                  {filteredInvoices.length ? (
                    <div className="table-scroll">
                      <table className="responsive-table invoice-table">
                        <thead>
                          <tr>
                            <th>Fatura</th>
                            <th>Tavolina</th>
                            <th>Data / ora</th>
                            <th>Pagesa</th>
                            <th className="numeric">Totali</th>
                            <th>
                              <span className="sr-only">Veprimet</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredInvoices.map((i) => (
                            <tr key={i.id} onClick={(e) => !e.target.closest("button") && (setReceipt(i), setFiscalizeChoice(false))}>
                              <td data-label="Fatura">
                                <strong>D-{i.id}</strong>
                                <small className="positive">Paguar</small>
                                {i.fiscalStatus === "fiskalizuar" && (
                                  <small className="positive">Fiskalizuar</small>
                                )}
                                {i.fiscalStatus === "dështoi" && (
                                  <small className="warning-text">Dështoi</small>
                                )}
                              </td>
                              <td data-label="Tavolina">
                                {String(i.table).padStart(2, "0")}
                              </td>
                              <td data-label="Data / ora">
                                {date(i.date)}
                                <small>{time(i.date)}</small>
                              </td>
                              <td data-label="Pagesa">
                                <span className="with-icon">
                                  <Icon
                                    name={i.method === "Cash" ? "cash" : "card"}
                                    size={16}
                                  />
                                  {i.method}
                                </span>
                              </td>
                              <td data-label="Totali" className="numeric">
                                <strong>{money(i.total)}</strong>
                              </td>
                              <td className="row-actions">
                                <button
                                  className="subtle-button"
                                  aria-label={`Shiko faturën D-${i.id}`}
                                  onClick={() => (setReceipt(i), setFiscalizeChoice(false))}
                                >
                                  Shiko
                                  <Icon name="arrow" size={15} />
                                </button>
                                <button
                                  className="icon-button"
                                  aria-label={`Printo faturën D-${i.id}`}
                                  onClick={() => reprintInvoice(i)}
                                >
                                  <Icon name="print" size={18} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty
                      icon="receipt"
                      title={
                        state.invoices.length
                          ? "Nuk u gjet asnjë faturë"
                          : "Fatura e parë fillon te tavolina"
                      }
                      action={
                        <button
                          onClick={() =>
                            state.invoices.length
                              ? (setQuery(""), setPaymentFilter("Të gjitha"))
                              : nav("Tavolinat")
                          }
                        >
                          {state.invoices.length
                            ? "Pastro filtrat"
                            : "Shko te tavolinat"}
                          <Icon name="arrow" size={15} />
                        </button>
                      }
                    >
                      {state.invoices.length
                        ? "Provoni një numër ose mënyrë tjetër pagese."
                        : "Pagesat e përfunduara do të shfaqen këtu, gati për rishikim dhe printim."}
                    </Empty>
                  )}
                  <div className="panel-footnote">
                    <Icon name="info" size={16} />
                    Faturat e paguara ruajnë çmimet e regjistruara në momentin e
                    porosisë.
                  </div>
                </section>
                {receipt && (
                  <aside className="receipt-preview">
                    <div className="preview-heading">
                      <h2>Detajet e faturës</h2>
                    </div>
                    <article className="receipt-paper">
                      <Receipt invoice={receipt} venueName={user.venue?.name} waiterName={state.waiters.find((w) => w.id === receipt.waiter)?.name} products={state.products} />
                    </article>
                    <div className="receipt-actions">
                      {receipt.fiscalStatus === "fiskalizuar" ? (
                        <div className="receipt-action-status positive">
                          <Icon name="check" size={16} />
                          Fatura është fiskalizuar
                        </div>
                      ) : fiscalizeChoice ? (
                        <div className="fiscalize-choice">
                          <span>Si të raportohet te BlueBill?</span>
                          <div className="payment-methods">
                            {["Cash", "Kartë"].map((method) => (
                              <button
                                key={method}
                                onClick={async () => {
                                  setFiscalizeChoice(false);
                                  try {
                                    const updated = await fiscalizeInvoice(receipt.id, method);
                                    // The response already carries the fresh invoice — read
                                    // it straight from there rather than from `state`, which
                                    // a same-tick database.refresh() wouldn't have updated yet.
                                    const invoice = updated.state.invoices.find((i) => i.id === receipt.id);
                                    setReceipt((current) => (current?.id === receipt.id ? invoice : current));
                                    database.refresh();
                                    notify(`Fatura D-${receipt.id} u fiskalizua si ${method}.`);
                                  } catch (e) {
                                    notify(e.message, "error");
                                  }
                                }}
                              >
                                <Icon name={method === "Cash" ? "cash" : "card"} size={16} />
                                {method}
                              </button>
                            ))}
                          </div>
                          <button className="text-button full-width" onClick={() => setFiscalizeChoice(false)}>
                            Anulo
                          </button>
                        </div>
                      ) : !state.fiscal?.enabled ? null : (
                        <button className="primary full-width" onClick={() => setFiscalizeChoice(true)}>
                          <Icon name="receipt" size={18} />
                          {receipt.fiscalStatus === "dështoi" ? "Fiskalizo Faturën · Riprovo" : "Fiskalizo Faturën"}
                        </button>
                      )}
                      <button className="full-width" onClick={() => reprintInvoice(receipt)}>
                        <Icon name="print" size={18} />
                        Printo
                      </button>
                      <button
                        className="text-button full-width"
                        onClick={() => (setReceipt(null), setFiscalizeChoice(false))}
                      >
                        Mbyll
                      </button>
                    </div>
                    <div className="paper-choice">
                      <span>Letra e printerit</span>
                      <div className="tabs" aria-label="Gjerësia e letrës">
                        {PAPERS.map((mm) => (
                          <button key={mm} aria-pressed={paper === mm} onClick={() => (setPaperWidth(mm), setPaper(mm))}>
                            {mm} mm
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="helper">
                      Fatura printohet e plotë, në gjatësinë e vet. Kjo pajisje e mban mend letrën.
                    </p>
                  </aside>
                )}
              </div>
            )}

            {page === "Inventari" && (
              <>
                <section className="panel">
                  <SectionHeading
                    title="Gjendja e stokut"
                    description="Njësi të shitshme · rezervimet përfshijnë porositë e hapura"
                  >
                    <Badge tone={lowStock ? "amber" : "green"}>
                      {lowStock} produkte me stok të ulët
                    </Badge>
                  </SectionHeading>
                  <div className="toolbar">
                    <Search
                      label="Kërko në inventar"
                      placeholder="Kërko produkt ose nënkategori…"
                      value={query}
                      onChange={setQuery}
                    />
                    <div className="tabs">
                      {["Të gjitha", "Stok i ulët"].map((v) => (
                        <button
                          key={v}
                          aria-pressed={stockFilter === v}
                          onClick={() => setStockFilter(v)}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  {filteredStock.length ? (
                    <div className="table-scroll">
                      <table className="responsive-table stock-table">
                        <thead>
                          <tr>
                            <th>Produkti</th>
                            <th>Nënkategoria</th>
                            <th>Gjendja</th>
                            <th>E disponueshme</th>
                            <th>Hyrje stoku</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredStock.map((p) => (
                            <tr key={p.id}>
                              <td data-label="Produkti">
                                <strong>{p.name}</strong>
                              </td>
                              <td data-label="Nënkategoria">{p.category}</td>
                              <td data-label="Gjendja">
                                <Badge
                                  tone={
                                    p.stock === 0
                                      ? "red"
                                      : p.stock <= 10
                                        ? "amber"
                                        : "green"
                                  }
                                >
                                  {p.stock} copë
                                  {p.stock <= 10
                                    ? " · " +
                                      (p.stock === 0
                                        ? "Pa stok"
                                        : "Stok i ulët")
                                    : ""}
                                </Badge>
                              </td>
                              <td data-label="E disponueshme">
                                {available(p)} copë
                                <small>
                                  {p.stock - available(p)} të rezervuara
                                </small>
                              </td>
                              <td
                                className="stock-entry"
                                data-label="Hyrje stoku"
                              >
                                <form
                                  className="inline-form"
                                  onSubmit={async (e) => {
                                    const formElement = e.currentTarget;
                                    e.preventDefault();
                                    const f = new FormData(e.currentTarget),
                                      qty = Number(f.get("qty"));
                                    if (!Number.isSafeInteger(qty) || qty <= 0)
                                      return;
                                    if (
                                      await update(
                                        "stock.receive",
                                        { productId: p.id, qty },
                                        `${qty} copë u shtuan për ${p.name}.`,
                                      )
                                    )
                                      formElement.reset();
                                  }}
                                >
                                  <input
                                    aria-label={`Sasia për ${p.name}`}
                                    name="qty"
                                    type="number"
                                    min="1"
                                    max="100000"
                                    step="1"
                                    required
                                    placeholder="Sasia"
                                  />
                                  <button
                                    aria-label={`Shto stok për ${p.name}`}
                                  >
                                    <Icon name="plus" size={16} />
                                    Shto
                                  </button>
                                </form>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty
                      icon="stock"
                      title={state.products.length ? "Nuk ka produkte në këtë filtër" : "Ende pa inventar"}
                      action={
                        !state.products.length ? <button onClick={() => nav("Produktet")}>Shko te produktet</button> : <button
                          onClick={() => {
                            setQuery("");
                            setStockFilter("Të gjitha");
                          }}
                        >
                          Pastro filtrat
                        </button>
                      }
                    >
                      {state.products.length ? "Kërkoni një produkt tjetër ose shfaqni gjithë stokun." : "Shtoni produktet në menu, pastaj regjistroni sasitë e stokut këtu."}
                    </Empty>
                  )}
                </section>
                <section className="panel">
                  <SectionHeading
                    title="Lëvizjet e fundit"
                    description="Hyrjet manuale dhe daljet nga shitjet"
                  />
                  <div className="movement-list">
                    {state.movements.length ? (
                      state.movements
                        .slice(-10)
                        .reverse()
                        .map((m, i) => (
                          <div className="movement-row" key={i}>
                            <span
                              className={`movement-icon ${m.qty > 0 ? "positive" : "negative"}`}
                            >
                              <Icon
                                name={m.qty > 0 ? "plus" : "receipt"}
                                size={18}
                              />
                            </span>
                            <div>
                              <strong>{m.product}</strong>
                              <small>{m.reason}</small>
                            </div>
                            <span className="movement-date">
                              {m.date
                                ? `${date(m.date)} · ${time(m.date)}`
                                : "Regjistrim demo"}
                            </span>
                            <b className={m.qty > 0 ? "positive" : ""}>
                              {m.qty > 0 ? "+" : ""}
                              {m.qty} <small>copë</small>
                            </b>
                          </div>
                        ))
                    ) : (
                      <Empty icon="stock" title="Ende pa lëvizje">
                        Shtoni stok ose përfundoni një pagesë për të regjistruar
                        lëvizjen e parë.
                      </Empty>
                    )}
                  </div>
                </section>
              </>
            )}

            {page === "Produktet" && (
              <div className="management-layout">
                <section className="panel">
                  <SectionHeading
                    title="Menuja e lokalit"
                    description={`${state.products.length} produkte · ${state.departments.length} kategori`}
                  />
                  <div className="toolbar">
                    <Search
                      label="Kërko në menu"
                      placeholder="Kërko një produkt…"
                      value={query}
                      onChange={setQuery}
                    />
                    <ChoiceField
                      label="Kategoria"
                      options={["Të gjitha", ...state.departments, "Pa kategori"].map((item) => ({ value: item, label: item }))}
                      value={deptFilter}
                      onChange={setDeptFilter}
                    />
                    <ChoiceField
                      label="Nënkategoria"
                      options={["Të gjitha", ...state.categories].map((item) => ({ value: item, label: item }))}
                      value={category}
                      onChange={setCategory}
                    />
                  </div>
                  {unrouted > 0 && deptFilter !== "Pa kategori" && (
                    <div className="notice warning">
                      <span>
                        {unrouted} {unrouted === 1 ? "produkt nuk ka" : "produkte nuk kanë"} kategori. Kur porositen, fleta e tyre nuk del në asnjë printer.
                      </span>
                      <button onClick={() => setDeptFilter("Pa kategori")}>Shfaqi</button>
                    </div>
                  )}
                  {menuProducts.length ? (
                    <div className="table-scroll">
                      <table className="responsive-table product-table">
                        <thead>
                          <tr>
                            <th>Produkti</th>
                            <th>Kategoria</th>
                            <th>Nënkategoria</th>
                            <th className="numeric">Çmimi</th>
                            <th>
                              <span className="sr-only">Veprimet</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {menuProducts.map((p) => (
                            <tr key={p.id}>
                              <td data-label="Produkti">
                                <strong>{p.name}</strong>
                                <small>{p.stock} copë në stok</small>
                              </td>
                              <td data-label="Kategoria">
                                {p.department ? (
                                  <DepartmentTag name={p.department} />
                                ) : (
                                  <small className="warning-text">Pa kategori</small>
                                )}
                              </td>
                              <td data-label="Nënkategoria">
                                <Badge>{p.category}</Badge>
                              </td>
                              <td data-label="Çmimi" className="numeric">
                                <strong>{money(p.price)}</strong>
                              </td>
                              <td className="row-actions">
                                <button
                                  className="icon-button"
                                  aria-label={`Ndrysho ${p.name}`}
                                  onClick={() => setEditor({ ...p })}
                                >
                                  <Icon name="edit" size={18} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty
                      icon="menu"
                      title={state.products.length ? "Nuk u gjet asnjë produkt" : "Menuja juaj nis këtu"}
                      action={state.products.length > 0 &&
                        <button
                          onClick={() => {
                            setQuery("");
                            setCategory("Të gjitha");
                            setDeptFilter("Të gjitha");
                          }}
                        >
                          Pastro filtrat
                        </button>
                      }
                    >
                      {state.products.length ? "Provoni një emër tjetër ose ndryshoni filtrat." : "Krijoni kategoritë dhe nënkategoritë anash, pastaj shtoni produktet dhe çmimet."}
                    </Empty>
                  )}
                </section>
                <aside className="management-aside">
                  {editor && (
                    <section className="panel editor-panel">
                      <SectionHeading
                        title={editor.id ? "Ndrysho produktin" : "Produkt i ri"}
                      >
                        <button
                          className="icon-button"
                          onClick={() => setEditor(null)}
                          aria-label="Mbyll formularin e produktit"
                        >
                          <Icon name="close" size={18} />
                        </button>
                      </SectionHeading>
                      <form
                        key={editor.id || "new"}
                        className="stack-form"
                        onSubmit={saveProduct}
                      >
                        <Field
                          label="Emri i produktit"
                          name="name"
                          defaultValue={editor.name || ""}
                          placeholder="p.sh. Macchiato"
                          maxLength={80}
                          required
                          autoFocus
                        />
                        <ChoiceField
                          label="Kategoria"
                          name="department"
                          defaultValue={editor.department || ""}
                          options={[
                            { value: "", label: state.departments.length ? "— Zgjidhni kategorinë —" : "— Asnjë —" },
                            ...state.departments.map((item) => ({ value: item, label: item })),
                          ]}
                        />
                        <ChoiceField
                          label="Nënkategoria"
                          name="category"
                          defaultValue={editor.category || state.categories[0]}
                          options={state.categories.map((item) => ({ value: item, label: item }))}
                        />
                        <Field
                          label="Çmimi (Lek)"
                          name="price"
                          type="number"
                          defaultValue={editor.price || ""}
                          min="1"
                          max="1000000"
                          step="1"
                          placeholder="0"
                          required
                        />
                        <p className="helper">
                          {editor.id
                            ? "Çmimi i ri zbatohet për produktet e shtuara në porosi të reja."
                            : "Produkti nis me stok zero. Hyrjet regjistrohen te Inventari."}
                        </p>
                        <button className="primary">
                          {editor.id ? "Ruaj ndryshimet" : "Shto produkt"}
                        </button>
                      </form>
                    </section>
                  )}
                  <section className="panel">
                    <SectionHeading
                      title="Kategoritë"
                      description="Ku përgatitet porosia: bar, kuzhinë, ëmbëltore. Çdo kategori mund të ketë printerin e vet."
                    />
                    <div className="category-list">
                      {state.departments.map((d) => (
                        <span key={d} className="department-chip">
                          <span>{d}</span>
                          <Badge>
                            {state.products.filter((p) => p.department === d).length}
                          </Badge>
                        </span>
                      ))}
                    </div>
                    <form
                      className="stack-form category-form"
                      onSubmit={async (e) => {
                        const formElement = e.currentTarget;
                        e.preventDefault();
                        const name = new FormData(e.currentTarget)
                          .get("department")
                          .trim();
                        if (!name)
                          return notify("Vendosni emrin e kategorisë.", "error");
                        if (
                          state.departments.some(
                            (d) => d.toLowerCase() === name.toLowerCase(),
                          )
                        )
                          return notify("Kjo kategori ekziston tashmë.", "error");
                        if (
                          await update(
                            "department.create",
                            { name },
                            "Kategoria u shtua.",
                          )
                        )
                          formElement.reset();
                      }}
                    >
                      <Field
                        label="Kategori e re"
                        name="department"
                        placeholder="p.sh. Grill"
                        maxLength={40}
                        required
                      />
                      <button>
                        <Icon name="plus" size={16} />
                        Shto kategori
                      </button>
                    </form>
                  </section>
                  <section className="panel">
                    <SectionHeading
                      title="Nënkategoritë"
                      description="Grupet e menusë që sheh kamarieri: kafe, pije, birra…"
                    />
                    <div className="category-list">
                      {state.categories.map((c) => (
                        <button
                          key={c}
                          onClick={() =>
                            setCategory(category === c ? "Të gjitha" : c)
                          }
                          aria-pressed={category === c}
                        >
                          <span>{c}</span>
                          <Badge>
                            {
                              state.products.filter((p) => p.category === c)
                                .length
                            }
                          </Badge>
                        </button>
                      ))}
                    </div>
                    <form
                      className="stack-form category-form"
                      onSubmit={async (e) => {
                        const formElement = e.currentTarget;
                        e.preventDefault();
                        const name = new FormData(e.currentTarget)
                          .get("category")
                          .trim();
                        if (!name)
                          return notify(
                            "Vendosni emrin e nënkategorisë.",
                            "error",
                          );
                        if (
                          state.categories.some(
                            (c) => c.toLowerCase() === name.toLowerCase(),
                          )
                        )
                          return notify(
                            "Kjo nënkategori ekziston tashmë.",
                            "error",
                          );
                        if (
                          await update(
                            "category.create",
                            { name },
                            "Nënkategoria u shtua.",
                          )
                        )
                          formElement.reset();
                      }}
                    >
                      <Field
                        label="Nënkategori e re"
                        name="category"
                        placeholder="p.sh. Kokteje"
                        maxLength={40}
                        required
                      />
                      <button>
                        <Icon name="plus" size={16} />
                        Shto nënkategori
                      </button>
                    </form>
                  </section>
                </aside>
              </div>
            )}

            {page === "Kamarierët" && (
              <div className="management-layout">
                <section className="panel">
                  <SectionHeading
                    title="Ekipi i shërbimit"
                    description={`${state.waiters.filter((w) => w.active).length} aktivë · ${state.waiters.length} profile gjithsej`}
                  />
                  <div className="toolbar">
                    <Search
                      label="Kërko kamarier"
                      placeholder="Kërko me emër…"
                      value={query}
                      onChange={setQuery}
                    />
                  </div>
                  <div className="staff-list">
                    {state.waiters
                      .filter((w) => matches(w.name, query))
                      .map((w) => {
                        const assigned = state.tables.filter(
                            (t) => t.lines.length && t.waiter === w.id,
                          ),
                          last =
                            state.waiters.filter((x) => x.active).length ===
                              1 && w.active;
                        return (
                          <div className="staff-row" key={w.id}>
                            <div className="staff-person">
                              <span
                                className={`avatar ${w.active ? "" : "inactive"}`}
                              >
                                {w.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .slice(0, 2)
                                  .join("")}
                              </span>
                              <div>
                                <strong>{w.name}</strong>
                                <small>
                                  {w.hasPin && w.hasPattern ? "Kamarier · PIN dhe pattern"
                                    : w.hasPin ? "Kamarier · Hyn me PIN"
                                    : w.hasPattern ? "Kamarier · Hyn me pattern"
                                    : "Kamarier · Pa hyrje"}
                                </small>
                              </div>
                            </div>
                            <div className="staff-work">
                              <Badge tone={w.active ? "green" : ""}>
                                {w.active ? "Aktiv" : "Joaktiv"}
                              </Badge>
                              <small>
                                {assigned.length
                                  ? `${assigned.length} tavolina · ${money(assigned.reduce((s, t) => s + total(t.lines), 0))}`
                                  : "Pa porosi të hapura"}
                              </small>
                            </div>
                            <div className="staff-action">
                              <button
                                disabled={assigned.length > 0 || last}
                                aria-describedby={`waiter-help-${w.id}`}
                                onClick={() => {
                                  if (waiter === w.id)
                                    setWaiter(
                                      state.waiters.find(
                                        (x) => x.active && x.id !== w.id,
                                      )?.id || w.id,
                                    );
                                  update(
                                    "waiter.toggle",
                                    { waiterId: w.id },
                                    w.active
                                      ? "Profili u çaktivizua."
                                      : "Profili u aktivizua.",
                                  );
                                }}
                              >
                                {w.active ? "Çaktivizo" : "Aktivizo"}
                              </button>
                              <small id={`waiter-help-${w.id}`}>
                                {assigned.length
                                  ? "Ka porosi të hapura"
                                  : last
                                    ? "Të paktën një profil aktiv"
                                    : ""}
                              </small>
                            </div>
                            <div className="staff-pin">
                              {pinFor === w.id ? (
                                <form
                                  className="inline-form"
                                  onSubmit={async (e) => {
                                    e.preventDefault();
                                    try {
                                      await setWaiterPin(
                                        w.id,
                                        new FormData(e.currentTarget).get("pin"),
                                      );
                                      await database.refresh();
                                      setPinFor(null);
                                      notify("PIN-i u ruajt.");
                                    } catch (err) {
                                      notify(err.message, "error");
                                    }
                                  }}
                                >
                                  <input
                                    name="pin"
                                    aria-label={`PIN i ri për ${w.name}`}
                                    type="password"
                                    inputMode="numeric"
                                    pattern="[0-9]{6}"
                                    maxLength={6}
                                    placeholder="6 shifra"
                                    autoComplete="off"
                                    required
                                    autoFocus
                                  />
                                  <button className="primary">Ruaj</button>
                                  <button type="button" onClick={() => setPinFor(null)}>
                                    Anulo
                                  </button>
                                </form>
                              ) : (
                                <button onClick={() => { setPatternFor(null); setPinFor(w.id); }}>
                                  {w.hasPin ? "Ndrysho PIN" : "Vendos PIN"}
                                </button>
                              )}
                              <button type="button" onClick={() => { setPinFor(null); setPatternFor(patternFor === w.id ? null : w.id); }}>
                                {w.hasPattern ? "Ndrysho pattern" : "Vendos pattern"}
                              </button>
                            </div>
                            {patternFor === w.id && <WaiterPatternEditor key={w.id} waiter={w} onCancel={() => setPatternFor(null)} onSaved={async () => { await database.refresh(); setPatternFor(null); notify("Pattern-i u ruajt."); }} />}
                          </div>
                        );
                      })}
                  </div>
                  {!state.waiters.some((w) => matches(w.name, query)) && (
                    <Empty icon="people" title={state.waiters.length ? "Nuk u gjet asnjë kamarier" : "Ndërtoni ekipin tuaj"}>
                      {state.waiters.length ? "Provoni një emër tjetër." : "Shtoni kamarierin e parë, vendosni PIN-in dhe lejoni rrjetin e lokalit."}
                    </Empty>
                  )}
                </section>
                <aside className="management-aside">
                  <section className="panel">
                    <SectionHeading
                      title="Shto në ekip"
                      description="Krijoni një profil për të caktuar porositë."
                    />
                    <form
                      className="stack-form"
                      onSubmit={async (e) => {
                        const formElement = e.currentTarget;
                        e.preventDefault();
                        const name = new FormData(e.currentTarget)
                          .get("name")
                          .trim();
                        if (!name)
                          return notify(
                            "Vendosni emrin dhe mbiemrin.",
                            "error",
                          );
                        if (
                          state.waiters.some(
                            (w) => w.name.toLowerCase() === name.toLowerCase(),
                          )
                        )
                          return notify(
                            "Një profil me këtë emër ekziston.",
                            "error",
                          );
                        if (
                          await update(
                            "waiter.create",
                            { name },
                            `${name} u shtua në ekip.`,
                          )
                        )
                          formElement.reset();
                      }}
                    >
                      <Field
                        label="Emri dhe mbiemri"
                        name="name"
                        placeholder="p.sh. Ardit Hoxha"
                        maxLength={80}
                        required
                      />
                      <button className="primary">
                        <Icon name="plus" size={17} />
                        Shto kamarier
                      </button>
                    </form>
                  </section>
                  <div className="info-note">
                    <Icon name="info" />
                    <div>
                      <strong>Hyrja e kamarierit</strong>
                      <p>
                        Vendosni PIN ose pattern për çdo kamarier. Mënyrën e hyrjes e zgjidhni te Cilësimet.
                        Pas 5 përpjekjeve të gabuara llogaria bllokohet për 15
                        minuta; vendosja e një PIN-i ose pattern-i të ri e zhbllokon. Kamarierët
                        hyjnë vetëm nga rrjeti i lokalit.
                      </p>
                    </div>
                  </div>
                </aside>
              </div>
            )}

            {page === "Turnet" && (
              <Shifts
                state={state}
                user={user}
                update={update}
                notify={notify}
                nav={nav}
                report={report}
                setReport={setReport}
                onPrintReport={printShiftReport}
              />
            )}
            {page === "Raportet" && <Reports state={state} />}
            {page === "Cilësimet" && (
              <div className="settings-grid">
                <div className="settings-column">
                  <Fiscalization onChange={() => database.refresh()} />
                  <BusinessNetwork venue={user.venue} />
                  <LoginModeSettings venue={user.venue} waiters={state.waiters} />
                  <ManagerLoginSettings venue={user.venue} name={user.name} />
                  <AccountSettings name={user.name} onChange={onUserChange} />
                </div>
                <div className="settings-column">
                  <NetworkPrinters state={state} update={update} notify={notify} />
                </div>
              </div>
            )}
          </fieldset>
          </main>
          <footer>
            <strong>BlueBar</strong>
            <span>Në ritmin e lokalit tuaj.</span>
            <span>{user.venue?.name || "BlueBar"}</span>
          </footer>
        </div>
      </div>
      <dialog
        ref={dialog}
        className="payment-dialog"
        onCancel={(e) => {
          e.preventDefault();
          cancelPayment();
        }}
        aria-labelledby="payment-title"
      >
        {payment && table && (
          <form onSubmit={pay}>
            <div className="dialog-heading">
              <span className="dialog-icon">
                <Icon name={payment === "Cash" ? "cash" : "card"} size={25} />
              </span>
              <button
                type="button"
                className="icon-button"
                onClick={cancelPayment}
                aria-label="Anulo pagesën"
              >
                <Icon name="close" />
              </button>
            </div>
            <h2 id="payment-title">Paguaj</h2>
            <p>
              Tavolina {String(table.id).padStart(2, "0")} · Zgjidhni mënyrën e pagesës
            </p>
            <div className="payment-amount">
              <span>Për t’u paguar</span>
              {payment === "Cash" ? (
                <button
                  type="button"
                  className="payment-amount-fill"
                  onClick={() => setReceived(String(total(table.lines)))}
                  aria-label={`Vendos shumën e saktë, ${money(total(table.lines))}`}
                >
                  {money(total(table.lines))}
                </button>
              ) : (
                <strong>{money(total(table.lines))}</strong>
              )}
            </div>
            <div className="payment-methods" role="group" aria-label="Mënyra e pagesës">
              <button type="button" aria-pressed={payment === "Cash"} onClick={() => setPayment("Cash")}><Icon name="cash" size={18} /> Cash</button>
              <button type="button" aria-pressed={payment === "Kartë"} onClick={() => setPayment("Kartë")}><Icon name="card" size={18} /> Kartë</button>
            </div>
            {payment === "Cash" ? (
              <>
                <Field
                  label="Shuma e marrë (Lek)"
                  name="received"
                  type="number"
                  inputMode="numeric"
                  min={total(table.lines)}
                  max="100000000"
                  step="1"
                  required
                  value={received}
                  onChange={(e) => setReceived(e.target.value)}
                  placeholder={String(total(table.lines))}
                />
                <div className="cash-quick" role="group" aria-label="Shuma të shpejta">
                  {quickCash(total(table.lines)).map((v) => (
                    <button
                      type="button"
                      key={v}
                      aria-pressed={Number(received) === v}
                      onClick={() => setReceived(String(v))}
                    >
                      {v === total(table.lines) ? "Saktë" : amount(v)}
                    </button>
                  ))}
                </div>
                <div className="cash-keypad" role="group" aria-label="Shuma e marrë">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"].map((key) => (
                    <button
                      key={key}
                      type="button"
                      disabled={key === "clear" || key === "back" ? !received : false}
                      aria-label={key === "clear" ? "Pastro shumën" : key === "back" ? "Fshi shifrën e fundit" : `Shifra ${key}`}
                      onClick={() => pressReceivedKey(key)}
                    >
                      {key === "clear" ? "Pastro" : key === "back" ? <Icon name="backspace" size={20} /> : key}
                    </button>
                  ))}
                </div>
                <div className="change-due">
                  <span>Kusuri</span>
                  <strong>
                    {money(Math.max(0, Number(received) - total(table.lines)))}
                  </strong>
                </div>
              </>
            ) : payment === "Kartë" ? (
              <div className="info-note">
                <Icon name="info" size={18} />
                <p>
                  Konfirmoni vetëm pasi pagesa të jetë kryer në terminalin e
                  kartës.
                </p>
              </div>
            ) : null}
            <p className="helper">Pagesa mbyll porosinë dhe liron tavolinën. Pas konfirmimit mund të printoni faturën.</p>
            <div className="dialog-actions">
              <button type="button" onClick={cancelPayment}>
                Kthehu
              </button>
              <button
                value="skip-fiscalize"
                className={state.fiscal?.enabled ? undefined : "primary"}
                disabled={
                  payment === "Zgjidh" ||
                  (payment === "Cash" &&
                    (received === "" || Number(received) < total(table.lines)))
                }
              >
                <Icon name="check" size={17} />
                Konfirmo
              </button>
              {state.fiscal?.enabled && (
                <button
                  className="primary"
                  value="fiscalize"
                  disabled={
                    payment === "Zgjidh" ||
                    (payment === "Cash" &&
                      (received === "" || Number(received) < total(table.lines)))
                  }
                >
                  <Icon name="check" size={17} />
                  Konfirmo dhe fiskalizo
                </button>
              )}
            </div>
          </form>
        )}
      </dialog>
      {ticketPrint &&
        ticketPrint.map((ticket) => (
          <article className="receipt print-only station-ticket" key={ticket.id}>
            <StationTicket
              ticket={ticket}
              waiterName={state.waiters.find((w) => w.id === ticket.waiter)?.name}
            />
          </article>
        ))}
      {receipt && !ticketPrint && (
        <article className="receipt print-only invoice-print">
          <Receipt invoice={receipt} venueName={user.venue?.name} waiterName={state.waiters.find((w) => w.id === receipt.waiter)?.name} />
        </article>
      )}
      {report && (
        <article className="receipt print-only">
          <ShiftReport report={report} venueName={user.venue?.name} />
        </article>
      )}
    </>
  );
}
function Root() {
  // undefined = checking the session, null = signed out, "offline" = couldn't reach
  // the server (not the same as signed out — don't send staff to the login screen).
  const [user, setUser] = useState(undefined);
  const check = () =>
    fetchSession().then(setUser, (e) => setUser(e.status === 0 ? "offline" : null));
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    check();
    // The "online" event alone isn't reliable (captive Wi-Fi, flaky signal): also retry
    // every few seconds while the offline screen is up.
    const retry = () => setUser((u) => (u === "offline" ? (check(), undefined) : u));
    window.addEventListener("online", retry);
    const timer = setInterval(retry, 5000);
    return () => {
      window.removeEventListener("online", retry);
      clearInterval(timer);
    };
  }, []);
  const enter = (u) => {
    setUser(u);
  };
  const leave = async () => {
    await logout().catch(() => {});
    enter(null);
  };
  if (user === undefined)
    return (
      <main className="database-setup">
        <span className="brand">BlueBar</span>
        <p>Po ngarkohet…</p>
      </main>
    );
  if (user === "offline")
    return (
      <main className="database-setup">
        <span className="brand">BlueBar</span>
        <h1>Pa lidhje</h1>
        <p>BlueBar nuk arrin serverin. Kontrolloni internetin — rilidhet vetë sapo të kthehet lidhja.</p>
        <button className="primary" onClick={() => (setUser(undefined), check())}>
          Provo sërish
        </button>
      </main>
    );
  return user ? <App user={user} onLogout={leave} onUserChange={(u) => setUser((prev) => ({ ...prev, ...u }))} /> : <Login onSignedIn={enter} />;
}
if (launch()) createRoot(document.getElementById("root")).render(<Root />);
