import "./uuid.js";
import React, { useState, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { bill, COURSES, invoicePos, money, posOf, printerFor, tableReservations, ticketPos, total, plural, tableName } from "./domain.js";
import { useDatabase } from "./useDatabase.js";
import { Login } from "./Login.jsx";
import { GuestOrderAlert, GuestOrders, OnlineMenuSettings, ProductPhoto } from "./OnlineMenu.jsx";
import { AiImport, ProductImport, StockDelivery, StockFields } from "./ProductSetup.jsx";
import { Reservations } from "./Reservations.jsx";
import { Finance } from "./Finance.jsx";
import { BusinessNetwork } from "./BusinessNetwork.jsx";
import { AccountSettings, LoginModeSettings, ManagerLoginSettings } from "./LoginModeSettings.jsx";
import { Fiscalization } from "./Fiscalization.jsx";
import { PAPERS, paperWidth, printFitted, setPaperWidth } from "./printPaper.js";
import { InvoiceEditForm } from "./InvoiceEdit.jsx";
import { DesktopInstall, NetworkPrinters } from "./NetworkPrinters.jsx";
import { PointsOfSale } from "./PointsOfSale.jsx";
import { ConfigCheck, StationSetup } from "./StationSetup.jsx";
import { OrderHistory } from "./OrderHistory.jsx";
import { PaymentForm, RefundForm } from "./PaymentDialog.jsx";
import { WaiterPatternEditor } from "./PatternPad.jsx";
import { FloorPlan } from "./FloorPlan.jsx";
import { RoomEditor } from "./RoomEditor.jsx";
import { arrange, collisions } from "./floorGeometry.js";
import { ChoiceField } from "./ChoiceField.jsx";
import { Reports } from "./Reports.jsx";
import { Orders } from "./Orders.jsx";
import { Stations, useStationPrinting } from "./Stations.jsx";
import { TableOrder } from "./TableOrder.jsx";
import { ShiftReport, Shifts } from "./Shifts.jsx";
import { useInstall, useOnline } from "./pwa.js";
import { fetchSession, fiscalizeInvoice, logout, reprintDocument, setUnauthorizedHandler, setWaiterPin } from "./api.js";
import {
  Icon,
  Search,
  Empty,
  Badge,
  Field,
  SectionHeading,
  TableSymbol,
  DepartmentTag,
  BrandMark,
} from "./components.jsx";
import "./style.css";

// On a phone the manager's nav is a bottom tab bar: these stay as tabs, the rest
// open from "Më shumë".
// The manager's navigation in sections, each named above its first page.
const NAV_GROUPS = { Tavolinat: "Shërbimi", Faturat: "Shitjet dhe financat", Inventari: "Magazina", Kamarierët: "Ekipi dhe sistemi" };
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
    description: "Porositë e hapura: zgjidhni një për ta dërguar, paguar ose ndryshuar.",
  },
  {
    name: "Repartet",
    icon: "coffee",
    description: "Fletët e çdo reparti — bar, ëmbëltore, restorant — gati për t'u përgatitur.",
  },
  {
    name: "Rezervimet",
    icon: "calendar",
    description: "Kush vjen, sa veta, në cilën tavolinë dhe në çfarë ore.",
  },
  {
    name: "Faturat",
    icon: "receipt",
    description: "Çdo pagesë e regjistruar, çdo faturë lehtësisht e gjendshme.",
  },
  {
    name: "Raportet",
    icon: "chart",
    description: "Financat, llogaritë, shitjet dhe shpenzimet.",
  },  {
    name: "Inventari",
    icon: "stock",
    description: "Kontrolloni gjendjen dhe mbani stokun gati për shërbim.",
  },
  {
    name: "Produktet",
    icon: "menu",
    description: "Një menu e organizuar, nga kategoria e menusë te çmimi.",
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
    name: "Cilësimet",
    icon: "settings",
    description: "Printerët, stafi, kasat, menuja online dhe fiskalizimi.",
  },
];
// Each topic with its icon and the line under it in the side list.
const SETTINGS_TABS = [
  ["Printerët", "print", "Printerët dhe kompjuteri i tyre"],
  ["Stafi dhe hyrja", "people", "Hyrja e stafit dhe rrjeti i lokalit"],
  ["Kasat dhe stacionet", "coffee", "Arkat, zonat dhe stacionet"],
  ["Menuja online", "menu", "Kodi QR dhe porositë e klientëve"],
  ["Fiskalizimi", "receipt", "Lidhja me BlueBill dhe tatimet"],
  ["Llogaria ime", "user", "Emri, PIN-i dhe kjo pajisje"],
];
// Which settings topic fixes each group of the configuration check (Produktet has its own page).
const ISSUE_TAB = { Stafi: "Stafi dhe hyrja", Kasat: "Kasat dhe stacionet", Stacionet: "Kasat dhe stacionet", Rregullat: "Kasat dhe stacionet" };
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
function Receipt({ invoice, venueName, waiterName, products, tables }) {
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
        <span>{tableName(invoice.table, tables)}</span>
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
                <div className="receipt-line" key={l.key || l.id}>
                  <span>
                    {l.qty} × {[l.name, ...(l.extras || []).map((x) => x.name)].join(" + ")}
                    <small>
                      {money(l.price)} / copë{l.comp ? ` · ${l.comp} qerasur` : ""}
                    </small>
                  </span>
                  <b>{money((l.qty - (l.comp || 0)) * l.price)}</b>
                </div>
              ))}
            </div>
          ))
        : invoice.lines.map((l) => (
            <div className="receipt-line" key={l.key || l.id}>
              <span>
                {l.qty} × {[l.name, ...(l.extras || []).map((x) => x.name)].join(" + ")}
                <small>
                  {money(l.price)} / copë{l.comp ? ` · ${l.comp} qerasur` : ""}
                </small>
              </span>
              <b>{money((l.qty - (l.comp || 0)) * l.price)}</b>
            </div>
          ))}
      <hr />
      {invoice.discount > 0 && (
        <div className="receipt-line">
          <span>Ulje{invoice.discountReason ? ` · ${invoice.discountReason}` : ""}</span>
          <b>−{money(invoice.discount)}</b>
        </div>
      )}
      <div className="receipt-total">
        <b>TOTALI</b>
        <strong>{money(invoice.total)}</strong>
      </div>
      {preBill && invoice.paid > 0 && (
        <>
          <div className="receipt-line"><span>Paguar</span><b>{money(invoice.paid)}</b></div>
          <div className="receipt-total"><b>MBETUR</b><strong>{money(invoice.remaining)}</strong></div>
        </>
      )}
      {!preBill && (
        <>
          {invoice.cash > 0 && <div className="receipt-line"><span>Paguar cash</span><b>{money(invoice.cash)}</b></div>}
          {invoice.card > 0 && <div className="receipt-line"><span>Paguar me kartë</span><b>{money(invoice.card)}</b></div>}
          {invoice.cash === undefined && <p>Pagesa: {invoice.method}</p>}
          {(invoice.refunds || []).map((r) => (
            <div className="receipt-line" key={r.id}>
              <span>
                Rimbursuar {r.method === "Cash" ? "cash" : "në kartë"}
                <small>{r.reason}</small>
              </span>
              <b>−{money(r.amount)}</b>
            </div>
          ))}
        </>
      )}
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
function StationTicket({ ticket, waiterName, tables }) {
  return (
    <>
      <div className="receipt-brand">
        {ticket.department.toUpperCase()}
        <span>
          {ticket.void
            ? "ANULIM · HIQENI NGA POROSIA"
            : ticket.cancelledAt
              ? "ANULUAR · MOS E PËRGATITNI"
              : ticket.kind === "correction"
                ? "KORRIGJIM"
                : ticket.kind === "remake"
                  ? "RIPËRGATIT"
                  : "POROSI PËR REPARTIN"}
        </span>
      </div>
      <div className="receipt-meta">
        <span>{tableName(ticket.table, tables)}</span>
        <span>Raundi {ticket.round}</span>
      </div>
      <p>
        {date(ticket.date)} · {time(ticket.date)}
        {waiterName ? ` · ${waiterName}` : ""}
      </p>
      <hr />
      {ticket.allergy && <p><b>ALERGJI: {ticket.allergy}</b></p>}
      {ticket.note && <p>{ticket.kind && ticket.kind !== "order" ? "Arsyeja" : "Shënim"}: {ticket.note}</p>}
      {ticket.lines.map((l) => (
        <div className="receipt-line station-line" key={l.key || l.id}>
          <span>
            <b>{l.qty} ×</b> {l.name}
            {l.course > 0 && <small>{COURSES[l.course]}</small>}
            {l.extras?.map((x) => <small key={x}>+ {x}</small>)}
            {l.note && <small>› {l.note}</small>}
            {l.allergy && <small><b>ALERGJI: {l.allergy}</b></small>}
          </span>
        </div>
      ))}
      <hr />
    </>
  );
}
// Cilësimet → Llogaria ime → this device's own preferences (kept in this browser only).
function DeviceSettings() {
  const [photos, setPhotos] = useState(() => {
    try { return localStorage.getItem("order-photos") !== "0"; } catch { return true; }
  });
  return (
    <section className="panel">
      <h2>Kjo pajisje</h2>
      <p className="helper">Vlen vetëm për këtë tablet ose telefon; çdo pajisje ruan zgjedhjen e vet.</p>
      <label className="printer-ascii device-option">
        <input
          type="checkbox"
          checked={photos}
          onChange={(e) => {
            try { localStorage.setItem("order-photos", e.target.checked ? "1" : "0"); } catch {}
            setPhotos(e.target.checked);
          }}
        />
        <span>
          Fotot e produkteve te porosia
          <small>Pa foto, menuja e porosisë del më e ngjeshur, vetëm me emra dhe çmime.</small>
        </span>
      </label>
    </section>
  );
}

function App({ user, onLogout, onUserChange }) {
  const database = useDatabase();
  const online = useOnline();
  const installOffer = useInstall();
  const desktopDialog = useRef(null);
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
  const [printDoc, setPrintDoc] = useState(null);
  useEffect(() => {
    const done = () => setPrintDoc(null);
    window.addEventListener("afterprint", done);
    return () => window.removeEventListener("afterprint", done);
  }, []);
  const [receipt, setReceipt] = useState(null),
    [payment, setPayment] = useState(null),
    [editor, setEditor] = useState(null),
    [bulkOpen, setBulkOpen] = useState(false),
    [deliveryOpen, setDeliveryOpen] = useState(false),
    [paymentFilter, setPaymentFilter] = useState("Të gjitha"),
    [stockFilter, setStockFilter] = useState("Të gjitha"),
    [settingsTab, setSettingsTab] = useState(() => {
      // Back on the topic last open in this browser tab, not always the first one.
      try { return SETTINGS_TABS.find(([t]) => t === sessionStorage.getItem("settings-tab"))?.[0] || "Printerët"; } catch { return "Printerët"; }
    }),
    [settingsIssues, setSettingsIssues] = useState([]),
    [manageTables, setManageTables] = useState(false),
    [report, setReport] = useState(null),
    [cancelling, setCancelling] = useState(false),
    [deleteConfirmId, setDeleteConfirmId] = useState(null),
    [floorSelected, setFloorSelected] = useState(null),
    // Table management works on an unsaved draft — new tables, edited area/shape/seats,
    // moved/resized tables — shown live everywhere and saved with one "Konfirmo".
    // Ndrysho sallën: changes not yet confirmed, by table id (each a whole table.save row).
    [roomDraft, setRoomDraft] = useState({}),
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
  // The table's order opens as a popup over the floor: focus its heading, and the floor
  // behind it doesn't scroll.
  useEffect(() => {
    if (selected === null || page !== "Tavolinat" || manageTables) return;
    orderHeading.current?.focus({ preventScroll: true });
    document.body.classList.add("order-open");
    return () => document.body.classList.remove("order-open");
  }, [selected, page, manageTables]);
  // A soft ripple from where a button was pressed, everywhere in the app. Drawn in a clipping
  // layer of its own, so a button's badge or position is never touched; skipped for anyone who
  // asked for less motion.
  useEffect(() => {
    const press = (e) => {
      const button = e.target.closest?.(".app button:not(:disabled):not(.pattern-dot):not(.fp-handle)");
      if (!button || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (getComputedStyle(button).position === "static") button.style.position = "relative";
      const box = button.getBoundingClientRect();
      const size = Math.max(box.width, box.height) * 2.2;
      const layer = document.createElement("span");
      layer.className = "ripple-layer";
      const wave = document.createElement("span");
      wave.className = "ripple";
      Object.assign(wave.style, { width: `${size}px`, height: `${size}px`, left: `${e.clientX - box.left - size / 2}px`, top: `${e.clientY - box.top - size / 2}px` });
      layer.append(wave);
      button.append(layer);
      setTimeout(() => layer.remove(), 650);
    };
    document.addEventListener("pointerdown", press);
    return () => document.removeEventListener("pointerdown", press);
  }, []);
  const notify = (text, tone = "success") => setNotice({ text, tone });
  // A notice fades out by itself: a few seconds, longer with a button on it ("Printo faturën")
  // or when it is a problem, and not while the pointer or the keyboard is on it.
  const [noticeLeaving, setNoticeLeaving] = useState(false);
  const noticeHeld = useRef(false);
  useEffect(() => {
    if (!notice) return;
    setNoticeLeaving(false);
    const ms = notice.tone === "error" ? 10000 : notice.tickets || receipt || report ? 7000 : 4000;
    let fade, gone;
    const wait = () => {
      fade = setTimeout(() => {
        if (noticeHeld.current) return wait();
        setNoticeLeaving(true);
        gone = setTimeout(() => setNotice(null), 300);
      }, ms);
    };
    wait();
    return () => (clearTimeout(fade), clearTimeout(gone));
  }, [notice]);
  // An order's messages name its table: with several tables open, "out of stock" alone
  // doesn't say where.
  const tableLabel = (payload) =>
    payload?.tableId ? `${tableName(payload.tableId, state.tables)}: ` : "";
  const update = async (type, payload, message) => {
    const where = type.startsWith("order.") ? tableLabel(payload) : "";
    try {
      const data = await database.execute(type, payload);
      message ? notify(where + message) : setNotice(null);
      return data;
    } catch (e) {
      notify(where + e.message, "error");
      return false;
    }
  };
  const nav = (p) => {
    if (!leaveRoomDraft()) return;
    // The page cross-fades into the next one where the browser can (the navigation stays put);
    // otherwise, and for anyone asking for less motion, it just swaps.
    if (p !== page && document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches)
      // A transition cut short (another tap, the tab hidden) is not an error: the page has changed.
      document.startViewTransition(() => flushSync(() => showPage(p))).ready.catch(() => {});
    else showPage(p);
    setTimeout(() => heading.current?.focus(), 0);
  };
  // Opening a product brings its whole form into view: one short move, then no scrolling to reach "Ruaj".
  useEffect(() => {
    if (page === "Produktet" && editor) document.querySelector(".product-dialog")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [page, Boolean(editor), editor?.id]);
  const showPage = (p) => {
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
    setFloorSelected(null);
    setOrderMode("summary");
  };
  const draftTable = (id, patch) =>
    setRoomDraft((draft) => {
      const t = state.tables.find((x) => x.id === id);
      const saved = { label: t.label || "", area: t.area, shape: t.shape || "Drejtkëndësh", seats: t.seats, posX: t.posX, posY: t.posY, width: t.width, height: t.height, rotation: t.rotation };
      const next = { ...saved, ...draft[id], ...patch };
      // Changed back by hand: nothing pending for it any more.
      const { [id]: _, ...rest } = draft;
      return Object.keys(saved).every((k) => saved[k] === next[k]) ? rest : { ...draft, [id]: next };
    });
  // false = the manager chose to stay and keep the changes they haven't confirmed.
  const leaveRoomDraft = () => {
    if (Object.keys(roomDraft).length && !window.confirm("Ndryshimet e sallës nuk janë konfirmuar. T'i hedh poshtë?")) return false;
    setRoomDraft({});
    return true;
  };

  // Porositë opens the full order window only when asked ("Ndrysho porosinë"); paying from
  // its receipt selects the table without it.
  const [orderWindow, setOrderWindow] = useState(false);
  const selectTable = (t) => {
    setCancelling(false);
    setSelected(t.id);
    setOrderMode(t.lines.length ? "summary" : "add");
    setQuery("");
    setCategory("Të gjitha");
    setNotice(null);
  };
  // The tills this user works (a waiter assigned to one till: just that one), and those not open.
  const myPos = user.role === "waiter" ? state.waiters.find((w) => w.id === user.waiterId)?.posId : null;
  const tills = state.pointsOfSale.filter((k) => !myPos || k.id === myPos);
  const closedTills = tills.filter((k) => !state.openShifts.some((s) => s.posId === k.id));
  // Deactivated tables ("Menaxho tavolinat") drop off the floor but stay listed there for reactivation.
  const activeTables = state.tables.filter((t) => t.active),
    areas = [
      "Të gjitha",
      ...[...new Set(activeTables.map((t) => t.area))].sort((a, b) =>
        a.localeCompare(b, "sq"),
      ),
    ];
  // The floor plan shows the unsaved draft (shape, size, position) as if it were saved.
  const floorTables = activeTables.map((t) => ({ ...t, ...roomDraft[t.id] }));
  // Tables (by id) that claim a cell another table also claims.
  // Rooms of their own (the manager's choice): every zone is its own room, shown one at a time,
  // and tables only clash with tables in the same room.
  const separateRooms = state.separateRooms === true;
  const room = separateRooms ? (areas.includes(area) && area !== "Të gjitha" ? area : areas[1]) : area;
  const floorClashes = [
    ...new Set((separateRooms ? areas.slice(1).flatMap((a) => collisions(floorTables.filter((t) => t.area === a))) : collisions(floorTables)).flat()),
  ];
  const table = activeTables.find((t) => t.id === selected),
    occupied = activeTables.filter((t) => t.lines.length).length;
  // Today's reservations by table, written on the floor.
  const reservedToday = tableReservations(state.reservations);
  // Not counted (an espresso, a cocktail): always available, never low.
  const available = (p) =>
    p.trackStock === false ? Infinity : p.stock -
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
      (deptFilter === "Pa repart" ? !p.department : p.department === deptFilter),
  );
  const unrouted = state.products.filter((p) => !p.department).length;
  // Each product's own threshold (10 until the manager sets one).
  const isLow = (p) => p.trackStock !== false && p.stock <= (p.minStock ?? 10);
  const counted = state.products.filter((p) => p.trackStock !== false);
  const filteredStock = counted.filter(
    (p) =>
      matches(`${p.name} ${p.category}`, query) &&
      (stockFilter === "Të gjitha" || isLow(p)),
  );
  const lowStock = state.products.filter(isLow).length;
  const pendingUnits = (t) => t.lines.reduce((s, l) => s + l.qty - (l.sent || 0), 0);
  // Printing from this browser never opens the invoice preview: only the printed copy changes.
  const print = (invoice) => {
    setTicketPrint(null);
    setPrintDoc(invoice);
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
        text: `${tableLabel({ tableId: t.id })}u dërgua te ${data.result.tickets
          .map((k) => state.stations?.find((x) => x.id === k.station)?.name || k.department)
          .join(", ")}.`,
        tone: "success",
        tickets: data.result.tickets,
      });
  };
  // Departments / invoices a LAN printer covers go through the print agent; the rest
  // still print from this browser.
  // A ticket sent to a station prints on that station's printer, if it has one; without
  // stations, per till: the outside bar's "Bar" tickets go to the outside bar's printer.
  const useStations = (state.stations || []).length > 0;
  const networked = (k) =>
    k.station
      ? Boolean(state.printers.some((p) => p.id === state.stations.find((x) => x.id === k.station)?.printerId))
      : Boolean(printerFor(state.printers, ticketPos(state, k), k.department));
  const cashierFor = (invoice) => printerFor(state.printers, invoicePos(state, invoice));
  const tillOf = (k) => ticketPos(state, k);
  const stationDevice = useStationPrinting(state.tickets, database.ready, printTickets, networked, tillOf, useStations);
  const reprintTickets = async (tickets) => {
    const local = tickets.filter((k) => !networked(k));
    try {
      for (const k of tickets.filter(networked))
        await reprintDocument("ticket", k.id);
      if (local.length) printTickets(local);
      else notify("Fleta u dërgua te printeri i repartit.");
    } catch (e) {
      notify(e.message, "error");
    }
  };
  const reprintInvoice = async (invoice) => {
    const cashierPrinter = cashierFor(invoice);
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
  // The pre-bill goes straight to the till's receipt printer when there is one.
  const printOrder = async (t) => {
    const cashier = printerFor(state.printers, posOf(state, t));
    if (cashier)
      try {
        if ((await reprintDocument("bill", t.id)).queued) return notify(`Para-fatura u dërgua te ${cashier.name}.`);
      } catch (e) {
        return notify(e.message, "error");
      }
    print({
      preBill: true,
      id: t.id,
      table: t.id,
      waiter: t.waiter,
      date: new Date().toISOString(),
      lines: t.lines,
      // The bill as it stands: comps and discount taken off, part payments shown.
      discount: bill(t).discount,
      discountReason: t.discount?.reason,
      total: bill(t).due,
      paid: bill(t).paid,
      remaining: bill(t).remaining,
    });
  };
  const startPayment = (method) => setPayment(method);
  const cancelPayment = () => {
    dialog.current?.close();
    setPayment(null);
    dialogTrigger.current?.focus({ preventScroll: true });
  };
  async function pay(payload, autoFiscalize) {
    const command = { tableId: selected, ...payload, fiscalize: autoFiscalize };
    cancelPayment();
    const data = await update("order.pay", command);
    if (data?.result.partial) {
      notify(`${tableLabel(command)}pagesa e pjesshme u regjistrua · mbeten ${money(data.result.remaining)}.`);
      return;
    }
    if (data) {
      const invoice = data.state.invoices.find(
        (i) => i.id === data.result.invoiceId,
      );
      setReceipt(invoice);
      // A split by items leaves the rest of the bill on the table.
      if (!data.result.remaining) setSelected(null);
      const cashierPrinter = printerFor(data.state.printers, invoicePos(data.state, invoice));
      notify(
        `${tableLabel(command)}pagesa u regjistrua. Fatura D-${invoice.id} · ${money(invoice.total)}` +
          (data.result.remaining ? ` · në tavolinë mbeten ${money(data.result.remaining)}` : "") +
          (data.result.sentTickets?.length
            ? ` · artikujt e padërguar shkuan te ${data.result.sentTickets.map((k) => k.department).join(", ")}`
            : "") +
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
            if (data.fiscalError) notify(data.fiscalError, "error");
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
      return notify("Zgjidhni repartin e përgatitjes: ku përgatitet produkti (bar, kuzhinë…).", "error");
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
          trackStock: form.get("trackStock") === "on",
          ...(!editor.id && form.get("initialStock") ? { initialStock: Number(form.get("initialStock")) } : {}),
          // "Qumësht soje +50" → {name, price: 50}; no "+N" means no extra charge.
          extras: String(form.get("extras") || "")
            .split("\n")
            .map((row) => row.trim())
            .filter(Boolean)
            .map((row) => {
              const m = row.match(/^(.*?)\s*\+\s*(\d+)\s*(lek)?$/i);
              return m ? { name: m[1].trim(), price: Number(m[2]) } : { name: row, price: 0 };
            }),
          // Online menu (guests): visibility and the description.
          menuVisible: form.get("menuVisible") === "on",
          description: String(form.get("description") || "").trim(),
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
    const cashierPrinter = printerFor(state.printers, r.shift.posId);
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
  // The order window, opened from the floor plan or from a card on Porositë.
  const orderModal = table && (
                    <div className="order-modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setSelected(null)}>
                      <div className="order-modal" role="dialog" aria-modal="true" aria-label={`Porosia e tavolinës ${table.id}`}>
                    <TableOrder
                      table={table}
                      state={state}
                      notify={notify}
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
                      </div>
                    </div>
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
      <GuestOrderAlert count={(state?.guestOrders?.length || 0) + (state?.guestAlerts?.length || 0)} latest={state && [...(state.guestAlerts || []), ...(state.guestOrders || [])].map((g) => ({ ...g, items: g.items.map((i) => ({ ...i, name: state.products.find((p) => p.id === i.productId)?.name || "?" })) })).sort((a, b) => b.id - a.id)[0]} />
      <a className="skip-link" href="#main">
        Kalo te përmbajtja
      </a>
      <div
        className={`app ${page === "Tavolinat" ? "floor-app" : ""}`}
        inert={!!database.pending && !database.busy && !database.syncingOrders}
      >
        <aside className="sidebar">
          <a className="brand" href="#main" onClick={() => nav("Tavolinat")}>
            <span className="brandmark"><BrandMark /></span>BlueBar
          </a>
          <div className="workspace-label">
            <span className="venue-dot" />
            {user.venue?.name || "BlueBar"}
          </div>
          <nav aria-label="Navigimi kryesor">
            {pages
              .filter((p) => role === "Menaxher" || ["Tavolinat", "Porositë", "Repartet", "Rezervimet"].includes(p.name))
              .map((p) => (
                <React.Fragment key={p.name}>
                {role === "Menaxher" && NAV_GROUPS[p.name] && <span className="nav-group" aria-hidden="true">{NAV_GROUPS[p.name]}</span>}
                <button
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
                  {p.name === "Tavolinat" && state.guestOrders?.length + state.guestAlerts?.length > 0 && (
                    <span className="nav-count guest" aria-label="Porosi të reja nga menuja">{state.guestOrders.length + state.guestAlerts.length}</span>
                  )}
                </button>
                </React.Fragment>
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
          {database.error && (
            <div className="sidebar-note">
              <Icon name="info" size={18} />
              <p>
                Pa lidhje me serverin
                <small>Ndryshimet nuk ruhen derisa të kthehet lidhja.</small>
              </p>
            </div>
          )}
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
              <span className="brandmark"><BrandMark /></span>
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
              <span className={`shift-status ${closedTills.length < tills.length ? "" : "closed"}`}>
                <span className="dot" />
                {tills.length > 1
                  ? `${tills.length - closedTills.length}/${tills.length} kasa hapur`
                  : closedTills.length < tills.length ? "Turn i hapur" : "Turn i mbyllur"}
              </span>
              <span className="role">
                <span>{user.name}</span>
                <button onClick={onLogout} disabled={database.saving}>Dil</button>
              </span>
            </div>
          </header>
          {/* Operational screens stay clean: this bar appears only when something needs
              attention — no connection, or fiscalization in test mode (not real invoices). */}
          {(database.error || (role === "Menaxher" && state.fiscal?.enabled && state.fiscal.mode === "test")) && (
            <div className="demo">
              <Icon name="info" size={15} />
              <span>
                {database.error
                  ? "Pa lidhje me serverin: porositë dhe pagesat nuk ruhen derisa të kthehet lidhja."
                  : "Fiskalizimi është në mënyrën test: faturat nuk dërgohen realisht te tatimet."}
              </span>
              <Badge>{database.error ? "PA LIDHJE" : "TEST"}</Badge>
            </div>
          )}
          <main id="main">
            <fieldset className="workspace-controls" disabled={database.busy} aria-busy={database.busy} aria-label="Hapësira e punës">
            {/* Raportet carries its own header, with its tabs beside the title. */}
            <div className={`title-row ${page === "Raportet" ? "sr-only" : ""}`}>
              <div>
                <h1 ref={heading} tabIndex={-1}>
                  {page}
                </h1>
                <p>{pages.find((p) => p.name === page).description}</p>
              </div>
              <div className="title-actions">
                {page === "Produktet" ? (
                  <>
                    <AiImport state={state} update={update} />
                    <button onClick={() => (setBulkOpen(true), setEditor(null))}>
                      <Icon name="list" size={18} />
                      Shto shumë
                    </button>
                    <button className="primary" onClick={() => (setEditor({}), setBulkOpen(false))}>
                      <Icon name="plus" size={18} />
                      Shto produkt
                    </button>
                  </>
                ) : page === "Tavolinat" ? null : (
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
                  {installOffer.kind === "desktop"
                    ? "Instaloni BlueBar në këtë kompjuter: faturat dhe fletët printohen direkt, pa dritare."
                    : installOffer.kind === "prompt"
                      ? "Instaloni BlueBar si aplikacion: hapet me një prekje, në ekran të plotë."
                      : "Instaloni BlueBar: prekni Shpërndaj, pastaj “Shto në ekranin bazë”."}
                </span>
                {installOffer.kind === "desktop" && (
                  <button className="primary" onClick={() => desktopDialog.current?.showModal()}>
                    Instalo
                  </button>
                )}
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
            <dialog ref={desktopDialog} className="lux-dialog desktop-dialog" aria-labelledby="desktop-title">
              <button type="button" className="icon-button lux-close" aria-label="Mbyll" onClick={() => desktopDialog.current?.close()}>
                <Icon name="close" size={18} />
              </button>
              <header>
                <img src="/icons/icon-192.png" alt="" width="48" height="48" />
                <h2 id="desktop-title">BlueBar në këtë kompjuter</h2>
                <p>Një ikonë BlueBar në desktop. Prej saj faturat dhe fletët dalin direkt te printeri, pa dritare.</p>
              </header>
              <DesktopInstall notify={notify} />
            </dialog>
            {database.error && !database.pending && (
              <div className="notice error" role="alert">
                <Icon name="info" />
                <span>{database.error}</span>
                <button onClick={database.refresh}>Rilidh</button>
              </div>
            )}
            {notice && (
              <div
                // With a table's popup open the page is behind it: the notice floats above, or a
                // refused add ("Pa stok", "Turni është i mbyllur"…) would look like nothing happened.
                // On Tavolinat it always floats, so the room never moves under it.
                className={`notice ${notice.tone} ${page === "Tavolinat" || (page === "Porositë" && table) || (page === "Produktet" && editor) ? "floating" : ""} ${noticeLeaving ? "leaving" : ""}`}
                role={notice.tone === "error" ? "alert" : "status"}
                onPointerEnter={() => (noticeHeld.current = true)}
                onPointerLeave={() => (noticeHeld.current = false)}
                onFocus={() => (noticeHeld.current = true)}
                onBlur={() => (noticeHeld.current = false)}
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
                {notice.tickets?.some((k) => !networked(k)) && (
                    <button onClick={() => printTickets(notice.tickets.filter((k) => !networked(k)))}>
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
                <RoomEditor
                  state={state}
                  tables={floorTables}
                  update={update}
                  notify={notify}
                  refresh={database.refresh}
                  area={room}
                  onRoom={setArea}
                  selected={floorSelected}
                  onSelect={setFloorSelected}
                  onDone={() => {
                    if (!leaveRoomDraft()) return;
                    setFloorSelected(null);
                    setManageTables(false);
                    setSelected(null);
                  }}
                  draft={roomDraft}
                  onDraft={draftTable}
                  onDiscard={() => setRoomDraft({})}
                />
              ) : (
                <>
                <GuestOrders state={state} user={user} update={update} />
                {closedTills.length > 0 && (
                  <div className="notice warning">
                    <Icon name="clock" />
                    <span>
                      {closedTills.length === tills.length
                        ? "Turni është i mbyllur. Hapni një turn për të marrë porosi."
                        : `Turni është i mbyllur te ${closedTills.map((k) => k.name).join(", ")}: tavolinat e saj nuk marrin porosi.`}
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
                        activeTables.reduce((s, t) => s + bill(t).remaining, 0),
                      )}
                    </strong>
                  </div>
                </div>
                <div className="floor-layout">
                  <section
                    className={`floor ${table ? "mobile-hidden" : ""}`}
                    aria-label="Tavolinat e lokalit"
                  >
                      <div className="toolbar floor-toolbar">
                        <div className="tabs" aria-label="Filtro zonën">
                          {(separateRooms ? areas.slice(1) : areas).map((a) => (
                            <button
                              key={a}
                              aria-pressed={room === a}
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
                        <div className="floor-toolbar-end">
                        <ChoiceField
                          compact
                          label="Gjendja"
                          options={["Të gjitha", "Të lira", "Të zëna"].map((item) => ({ value: item, label: item }))}
                          value={status}
                          onChange={setStatus}
                        />
                        {role === "Menaxher" && (
                          <button
                            onClick={() => {
                              setManageTables(true);
                              setSelected(null);
                              setEditor(null);
                            }}
                          >
                            <Icon name="edit" size={18} />
                            Ndrysho sallën
                          </button>
                        )}
                        </div>
                      </div>
                    {role === "Menaxher" && floorClashes.length > 0 && (
                      <div className="notice warning floor-clash">
                        <Icon name="info" size={16} />
                        <span>Disa tavolina mbivendosen në sallë.</span>
                        <button
                          onClick={() =>
                            update("table.layout", {
                              tables: Object.entries(arrange(floorTables)).map(([id, patch]) => {
                                const t = floorTables.find((x) => x.id === Number(id));
                                return { id: t.id, posX: t.posX, posY: t.posY, width: t.width, height: t.height, rotation: t.rotation, ...patch };
                              }),
                            }, "Tavolinat u rregulluan.")
                          }
                        >
                          Rregullo automatikisht
                        </button>
                      </div>
                    )}
                    {(() => {
                      const visible = activeTables.filter(
                        (t) =>
                          (room === "Të gjitha" || t.area === room) &&
                          (status === "Të gjitha" ||
                            Boolean(t.lines.length) === (status === "Të zëna")),
                      );
                      return visible.length ? (
                        <FloorPlan
                          tables={visible}
                          waiters={state.waiters}
                          reservations={reservedToday}
                          look={state.floorStyle}
                          texture={state.floorTexture}
                          editing={false}
                          selected={selected}
                          onSelectTable={(t) => t && selectTable(t)}
                        />
                      ) : (
                        <Empty
                          icon="tables"
                          title={state.tables.length ? "Nuk ka tavolina në këtë filtër" : "Shtoni tavolinën e parë"}
                          action={
                            !state.tables.length ? (role === "Menaxher" && <button className="primary" onClick={() => setManageTables(true)}>Ndërto sallën</button>) : <button
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
                  {orderModal}
                  {(
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
              <>
                <Orders
                  state={state}
                  onEdit={(t) => (selectTable(t), setOrderWindow(true))}
                  onSend={sendOrder}
                  onPrint={printOrder}
                  onPay={(t) => (setOrderWindow(false), setSelected(t.id), startPayment("Zgjidh"))}
                />
                {orderWindow && orderModal}
              </>
            )}

            {page === "Repartet" && (
              <Stations
                state={state}
                device={stationDevice}
                update={update}
                tillOf={tillOf}
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
                      options={["Të gjitha", "Cash", "Kartë", "Përzier"].map((item) => ({ value: item, label: item }))}
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
                                {tableName(i.table, state.tables).replace(/^Tavolina /, "")}
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
                      <Receipt invoice={receipt} venueName={user.venue?.name} waiterName={state.waiters.find((w) => w.id === receipt.waiter)?.name} products={state.products} tables={state.tables} />
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
                                    if (updated.fiscalError) notify(updated.fiscalError, "error");
                                    else notify(`Fatura D-${receipt.id} u fiskalizua si ${method}.`);
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
                      {role === "Menaxher" && (
                        <InvoiceEditForm
                          key={`edit-${receipt.id}`}
                          invoice={receipt}
                          state={state}
                          update={update}
                          onDone={(data) => setReceipt(data.state.invoices.find((i) => i.id === receipt.id))}
                        />
                      )}
                      {role === "Menaxher" && (
                        <RefundForm
                          key={receipt.id}
                          invoice={receipt}
                          update={update}
                          onDone={(data) => setReceipt(data.state.invoices.find((i) => i.id === receipt.id))}
                        />
                      )}
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
                    {role === "Menaxher" && (
                      <details className="invoice-history">
                        <summary>Historiku i porosisë</summary>
                        <OrderHistory invoiceId={receipt.id} />
                      </details>
                    )}
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
                    <div className="actions">
                      <Badge tone={lowStock ? "amber" : "green"}>
                        {lowStock} produkte me stok të ulët
                      </Badge>
                      <button className="primary" onClick={() => setDeliveryOpen(true)} disabled={!counted.length}>
                        <Icon name="plus" size={17} />
                        Furnizim i ri
                      </button>
                    </div>
                  </SectionHeading>
                  {deliveryOpen && <StockDelivery state={state} update={update} onClose={() => setDeliveryOpen(false)} />}
                  {state.products.length > counted.length && (
                    <p className="helper stock-untracked">
                      {state.products.length - counted.length} produkte nuk numërohen (kafe, koktej, pjata): stoku nuk ua bllokon shitjen dhe nuk shfaqen këtu.
                      Ndryshojeni te Produktet → "Ndiq stokun".
                    </p>
                  )}
                  <div className="toolbar">
                    <Search
                      label="Kërko në inventar"
                      placeholder="Kërko produkt ose kategori menuje…"
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
                            <th>Gjendja</th>
                            <th>E disponueshme</th>
                            <th>Pragu minimal</th>
                            <th>Hyrje stoku</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredStock.map((p) => (
                            <React.Fragment key={p.id}>
                            <tr>
                              <td data-label="Produkti">
                                <strong>{p.name}</strong>
                                <small>
                                  {p.category}
                                  {p.available === false && " · "}
                                  {p.available === false && <b className="unavailable-mark">Jo në dispozicion</b>}
                                </small>
                              </td>
                              <td data-label="Gjendja">
                                <Badge tone={p.stock === 0 ? "red" : isLow(p) ? "amber" : "green"}>
                                  {p.stock} copë
                                  {isLow(p) ? ` · ${p.stock === 0 ? "Pa stok" : "Stok i ulët"}` : ""}
                                </Badge>
                              </td>
                              <td data-label="E disponueshme">
                                {available(p)} copë
                                <small>
                                  {p.stock - available(p)} të rezervuara
                                </small>
                              </td>
                              <td data-label="Pragu minimal">
                                <span className="min-stock-label" aria-hidden="true">Pragu minimal</span>
                                <input
                                  className="min-stock"
                                  aria-label={`Pragu minimal për ${p.name}`}
                                  type="number"
                                  min="0"
                                  max="100000"
                                  defaultValue={p.minStock ?? 10}
                                  key={p.minStock}
                                  onBlur={(e) => {
                                    const value = Number(e.target.value);
                                    if (Number.isSafeInteger(value) && value >= 0 && value !== (p.minStock ?? 10))
                                      update("product.stockRules", { productId: p.id, minStock: value }, `Pragu i ${p.name}: ${value} copë.`);
                                  }}
                                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                                />
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
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty
                      icon="stock"
                      title={!counted.length && state.products.length ? "Produktet tuaja nuk numërohen" : state.products.length ? "Nuk ka produkte në këtë filtër" : "Ende pa inventar"}
                      action={
                        !counted.length ? <button onClick={() => nav("Produktet")}>Shko te produktet</button> : <button
                          onClick={() => {
                            setQuery("");
                            setStockFilter("Të gjitha");
                          }}
                        >
                          Pastro filtrat
                        </button>
                      }
                    >
                      {!counted.length && state.products.length ? 'Aktivizoni "Ndiq stokun" te produktet që doni të numëroni.' : state.products.length ? "Kërkoni një produkt tjetër ose shfaqni gjithë stokun." : "Shtoni produktet në menu, pastaj regjistroni sasitë e stokut këtu."}
                    </Empty>
                  )}
                </section>
                <section className="panel">
                  <SectionHeading
                    title="Lëvizjet e fundit"
                    description="Hyrjet, shitjet, korrigjimet dhe humbjet, me arsye dhe person"
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
                              <small>
                                {m.kind === "loss" ? "Humbje · " : ""}
                                {m.reason}
                                {m.actor ? ` · ${m.actor}` : ""}
                              </small>
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

            {page === "Produktet" && bulkOpen && <ProductImport state={state} update={update} onClose={() => setBulkOpen(false)} />}
            {page === "Produktet" && (
              <div className="management-layout products-layout">
                <section className="panel">
                  <SectionHeading
                    title="Menuja e lokalit"
                    description={`${state.products.length} produkte · ${state.departments.length} reparte`}
                  />
                  <div className="toolbar toolbar-stack">
                    <Search
                      label="Kërko në menu"
                      placeholder="Kërko një produkt…"
                      value={query}
                      onChange={setQuery}
                    />
                    {/* Two filters side by side: same width, labels on the same line. */}
                    <div className="toolbar-filters">
                      <ChoiceField
                        label="Reparti i përgatitjes"
                        options={["Të gjitha", ...state.departments, "Pa repart"].map((item) => ({ value: item, label: item }))}
                        value={deptFilter}
                        onChange={setDeptFilter}
                      />
                      <ChoiceField
                        label="Kategoria e menusë"
                        options={["Të gjitha", ...state.categories].map((item) => ({ value: item, label: item }))}
                        value={category}
                        onChange={setCategory}
                      />
                    </div>
                  </div>
                  {unrouted > 0 && deptFilter !== "Pa repart" && (
                    <div className="notice warning">
                      <span>
                        {unrouted} {unrouted === 1 ? "produkt nuk ka" : "produkte nuk kanë"} repart përgatitjeje. Kur porositen, fleta e tyre nuk del në asnjë printer.
                      </span>
                      <button onClick={() => setDeptFilter("Pa repart")}>Shfaqi</button>
                    </div>
                  )}
                  {menuProducts.length ? (
                    <div className="table-scroll">
                      <table className="responsive-table product-table">
                        <thead>
                          <tr>
                            <th>Produkti</th>
                            <th>Reparti</th>
                            <th>Kategoria e menusë</th>
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
                                <small>{p.trackStock === false ? "Pa numërim stoku" : `${p.stock} copë në stok`}</small>
                              </td>
                              <td data-label="Reparti i përgatitjes">
                                {p.department ? (
                                  <DepartmentTag name={p.department} />
                                ) : (
                                  <small className="warning-text">Pa repart</small>
                                )}
                              </td>
                              <td data-label="Kategoria e menusë">
                                {/* Same pill as the department next to it: same size, same line. */}
                                <span className="dept-tag neutral">{p.category}</span>
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
                      {state.products.length ? "Provoni një emër tjetër ose ndryshoni filtrat." : "Krijoni repartet dhe kategoritë e menusë anash, pastaj shtoni produktet dhe çmimet."}
                    </Empty>
                  )}
                </section>
                <aside className="management-aside">
                  {/* The product form takes the side column (a sheet on small screens), so editing never means scrolling to find it. */}
                  {editor && (
                    <div
                      className="order-modal-backdrop"
                      onPointerDown={(e) => e.target === e.currentTarget && setEditor(null)}
                      onKeyDown={(e) => e.key === "Escape" && setEditor(null)}
                    >
                    <section className="panel editor-panel product-dialog" role="dialog" aria-label={editor.id ? "Ndrysho produktin" : "Produkt i ri"}>
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
                        className="stack-form product-form"
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
                          label="Reparti i përgatitjes"
                          name="department"
                          defaultValue={editor.department || ""}
                          options={[
                            { value: "", label: state.departments.length ? "— Zgjidhni repartin —" : "— Asnjë —" },
                            ...state.departments.map((item) => ({ value: item, label: item })),
                          ]}
                        />
                        <ChoiceField
                          label="Kategoria e menusë"
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
                        <StockFields key={editor.id || "new"} product={editor} />
                        <label className="field product-extras">
                          <span>Variante dhe shtesa (një për rresht)</span>
                          <textarea
                            name="extras"
                            rows={3}
                            defaultValue={(editor.extras || []).map((x) => `${x.name}${x.price ? ` +${x.price}` : ""}`).join("\n")}
                            placeholder={"Qumësht soje +50\nPa sheqer\nE madhe +100"}
                          />
                        </label>
                        <fieldset className="menu-fields">
                          <legend>Menuja online</legend>
                          <label className="check-row">
                            <input type="checkbox" name="menuVisible" defaultChecked={editor.menuVisible !== false} />
                            Shfaqe në menunë online
                          </label>
                          <label className="field">
                            <span>Përshkrimi</span>
                            <textarea name="description" rows={2} maxLength={300} defaultValue={editor.description || ""} placeholder="p.sh. Espresso me pak qumësht të shkumëzuar" />
                          </label>
                          {editor.id ? (
                            <ProductPhoto product={state.products.find((p) => p.id === editor.id) || editor} onChanged={() => database.refresh()} />
                          ) : (
                            <p className="helper">Fotoja shtohet pasi ta ruani produktin.</p>
                          )}
                        </fieldset>
                        <p className="helper">
                          {editor.id
                            ? "Çmimi i ri zbatohet për produktet e shtuara në porosi të reja."
                            : "Për shumë produkte njëherësh përdorni \"Shto shumë\"."}
                        </p>
                        <div className="product-form-foot">
                          <button className="primary">
                            {editor.id ? "Ruaj ndryshimet" : "Shto produkt"}
                          </button>
                        </div>
                      </form>
                    </section>
                    </div>
                  )}
                  <section className="panel">
                    <SectionHeading
                      title="Repartet e përgatitjes"
                      description="Ku përgatitet porosia: bar, kuzhinë, ëmbëltore. Çdo repart mund të ketë printerin e vet."
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
                          return notify("Vendosni emrin e repartit.", "error");
                        if (
                          state.departments.some(
                            (d) => d.toLowerCase() === name.toLowerCase(),
                          )
                        )
                          return notify("Ky repart ekziston tashmë.", "error");
                        if (
                          await update(
                            "department.create",
                            { name },
                            "Reparti u shtua.",
                          )
                        )
                          formElement.reset();
                      }}
                    >
                      <Field
                        label="Repart i ri"
                        name="department"
                        placeholder="p.sh. Grill"
                        maxLength={40}
                        required
                      />
                      <button aria-label="Shto repart">
                        <Icon name="plus" size={16} />
                        Shto
                      </button>
                    </form>
                  </section>
                  <section className="panel">
                    <SectionHeading
                      title="Kategoritë e menusë"
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
                            "Vendosni emrin e kategorisë së menusë.",
                            "error",
                          );
                        if (
                          state.categories.some(
                            (c) => c.toLowerCase() === name.toLowerCase(),
                          )
                        )
                          return notify(
                            "Kjo kategori menuje ekziston tashmë.",
                            "error",
                          );
                        if (
                          await update(
                            "category.create",
                            { name },
                            "Kategoria e menusë u shtua.",
                          )
                        )
                          formElement.reset();
                      }}
                    >
                      <Field
                        label="Kategori e re e menusë"
                        name="category"
                        placeholder="p.sh. Kokteje"
                        maxLength={40}
                        required
                      />
                      <button aria-label="Shto kategori menuje">
                        <Icon name="plus" size={16} />
                        Shto
                      </button>
                    </form>
                  </section>
                </aside>
              </div>
            )}

            {page === "Rezervimet" && <Reservations state={state} update={update} role={role} />}
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
                              <span className={`avatar ${w.active ? "" : "inactive"}`}>
                                {w.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                              </span>
                              <div>
                                <strong>{w.name}</strong>
                                <small>
                                  {w.pinShared && <b className="pin-shared">PIN i njëjtë me një tjetër: vendosni një PIN të ri · </b>}
                                  {w.hasPin && w.hasPattern ? "PIN dhe pattern"
                                    : w.hasPin ? "Hyn me PIN"
                                    : w.hasPattern ? "Hyn me pattern"
                                    : "Pa hyrje"}
                                  {" · "}
                                  {assigned.length
                                    ? `${assigned.length} tavolina · ${money(assigned.reduce((s, t) => s + bill(t).remaining, 0))}`
                                    : "Pa porosi të hapura"}
                                </small>
                                <div className="staff-status">
                              <Badge tone={w.active ? "green" : ""}>{w.active ? "Aktiv" : "Joaktiv"}</Badge>
                              {state.pointsOfSale.length > 1 && (
                                <div className="staff-pos">
                                  <ChoiceField
                                    compact
                                    label="Kasa"
                                    value={String(w.posId ?? "")}
                                    options={[
                                      { value: "", label: "Të gjitha" },
                                      ...state.pointsOfSale.map((k) => ({ value: String(k.id), label: k.name })),
                                    ]}
                                    onChange={(v) =>
                                      update("waiter.pos", { waiterId: w.id, posId: v ? Number(v) : null }, "Kasa e kamarierit u ruajt.")
                                    }
                                  />
                                </div>
                              )}
                            </div>
                              </div>
                            </div>
                            {/* Same size, same row: every action of the profile. */}
                            <div className="staff-buttons">
                              <button type="button" onClick={() => { setPatternFor(null); setPinFor(pinFor === w.id ? null : w.id); }}>
                                {w.hasPin ? "Ndrysho PIN" : "Vendos PIN"}
                              </button>
                              <button type="button" onClick={() => { setPinFor(null); setPatternFor(patternFor === w.id ? null : w.id); }}>
                                {w.hasPattern ? "Ndrysho pattern" : "Vendos pattern"}
                              </button>
                              <button
                                type="button"
                                disabled={assigned.length > 0 || last}
                                title={assigned.length ? "Ka porosi të hapura" : last ? "Duhet të paktën një profil aktiv" : undefined}
                                onClick={() => {
                                  if (waiter === w.id) setWaiter(state.waiters.find((x) => x.active && x.id !== w.id)?.id || w.id);
                                  update("waiter.toggle", { waiterId: w.id }, w.active ? "Profili u çaktivizua." : "Profili u aktivizua.");
                                }}
                              >
                                {w.active ? "Çaktivizo" : "Aktivizo"}
                              </button>
                            </div>
                            {pinFor === w.id && (
                              <form
                                className="inline-form staff-pin-form"
                                onSubmit={async (e) => {
                                  e.preventDefault();
                                  try {
                                    await setWaiterPin(w.id, new FormData(e.currentTarget).get("pin"));
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
                                  placeholder="PIN i ri · 6 shifra"
                                  autoComplete="off"
                                  required
                                  autoFocus
                                />
                                <button className="primary">Ruaj</button>
                                <button type="button" onClick={() => setPinFor(null)}>Anulo</button>
                              </form>
                            )}
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
            {page === "Raportet" && <Finance state={state} notify={notify} sales={<Reports state={state} />} />}
            {page === "Cilësimet" && (
              <>
              {/* One topic at a time instead of ten panels on one page: a side list on wide screens,
                  a row of tabs on narrow ones; what needs a look, one line above the topic. */}
              <div className="settings-layout">
              <div className="tabs settings-tabs" role="tablist" aria-label="Cilësimet">
                {SETTINGS_TABS.map(([t, icon, hint]) => {
                  const issues = settingsIssues.filter((i) => ISSUE_TAB[i.group] === t);
                  return (
                    <button
                      key={t}
                      role="tab"
                      aria-selected={settingsTab === t}
                      aria-pressed={settingsTab === t}
                      onClick={(e) => {
                        setSettingsTab(t);
                        try { sessionStorage.setItem("settings-tab", t); } catch {}
                        e.currentTarget.scrollIntoView({ inline: "center", block: "nearest" });
                      }}
                    >
                      <Icon name={icon} size={18} />
                      <b>{t}</b>
                      <small>{hint}</small>
                      {issues.length > 0 && (
                        <i className={issues.some((i) => i.level === "error") ? "error" : undefined} aria-label={`${issues.length} për t'u parë`}>
                          {issues.length}
                        </i>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="settings-body">
              <ConfigCheck state={state} onIssues={setSettingsIssues} />
              <div className="settings-grid">
                {settingsTab === "Printerët" && (
                  <div className="settings-column settings-wide">
                    <NetworkPrinters state={state} update={update} notify={notify} />
                  </div>
                )}
                {settingsTab === "Stafi dhe hyrja" && (
                  <>
                    <div className="settings-column">
                      <LoginModeSettings venue={user.venue} waiters={state.waiters} />
                      <ManagerLoginSettings venue={user.venue} name={user.name} />
                    </div>
                    <div className="settings-column">
                      <BusinessNetwork venue={user.venue} />
                    </div>
                  </>
                )}
                {settingsTab === "Kasat dhe stacionet" && (
                  <>
                    <div className="settings-column">
                      <PointsOfSale state={state} update={update} />
                    </div>
                    <div className="settings-column">
                      <StationSetup state={state} update={update} />
                    </div>
                  </>
                )}
                {settingsTab === "Menuja online" && (
                  <div className="settings-column settings-wide">
                    <OnlineMenuSettings venue={user.venue} state={state} update={update} onVenueChange={(venue) => onUserChange({ venue })} />
                  </div>
                )}
                {settingsTab === "Fiskalizimi" && (
                  <div className="settings-column settings-wide">
                    <Fiscalization onChange={() => database.refresh()} />
                  </div>
                )}
                {settingsTab === "Llogaria ime" && (
                  <div className="settings-column settings-wide">
                    <AccountSettings name={user.name} onChange={onUserChange} />
                    <DeviceSettings />
                  </div>
                )}
              </div>
              </div>
              </div>
              </>
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
          <PaymentForm
            key={`${table.id}-${payment}`}
            table={table}
            initialMethod={payment}
            fiscalEnabled={Boolean(state.fiscal?.enabled)}
            onCancel={cancelPayment}
            onSubmit={pay}
          />
        )}
      </dialog>
      {ticketPrint &&
        ticketPrint.map((ticket) => (
          <article className="receipt print-only station-ticket" key={ticket.id}>
            <StationTicket
              ticket={ticket}
              waiterName={state.waiters.find((w) => w.id === ticket.waiter)?.name}
              tables={state.tables}
            />
          </article>
        ))}
      {(printDoc || receipt) && !ticketPrint && (
        <article className="receipt print-only invoice-print">
          <Receipt invoice={printDoc || receipt} venueName={user.venue?.name} waiterName={state.waiters.find((w) => w.id === (printDoc || receipt).waiter)?.name} tables={state.tables} />
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
export function Root() {
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
