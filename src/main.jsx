import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { money, total } from "./domain.js";
import { useDatabase } from "./useDatabase.js";
import { Login } from "./Login.jsx";
import { BusinessNetwork } from "./BusinessNetwork.jsx";
import { FloorPlan, TableDetailPanel } from "./FloorPlan.jsx";
import { ChoiceField } from "./ChoiceField.jsx";
import { Reports } from "./Reports.jsx";
import { fetchSession, logout, setUnauthorizedHandler, setWaiterPin } from "./api.js";
import {
  Icon,
  Search,
  Empty,
  Badge,
  Field,
  SectionHeading,
  TableSymbol,
  TableShapePicker,
} from "./components.jsx";
import "./style.css";

const pages = [
  {
    name: "Tavolinat",
    icon: "tables",
    description:
      "Salla juaj, në një vështrim. Zgjidhni një tavolinë për të nisur.",
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
function Receipt({ invoice, venueName }) {
  return (
    <>
      <div className="receipt-brand">
        {venueName || "BlueBar"}<span>BAR & KAFE</span>
      </div>
      <p>KOPJE DEMO · JO FATURË FISKALE</p>
      <div className="receipt-meta">
        <span>Fatura D-{invoice.id}</span>
        <span>Tavolina {invoice.table}</span>
      </div>
      <p>
        {date(invoice.date)} · {time(invoice.date)}
      </p>
      <hr />
      {invoice.lines.map((l) => (
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
      <p>Pagesa: {invoice.method}</p>
      <p>Faleminderit për vizitën!</p>
    </>
  );
}
function ShiftReport({ report, venueName }) {
  const { shift, invoiceCount, cash, card, topProducts, byWaiter } = report;
  return (
    <>
      <div className="receipt-brand">
        {venueName || "BlueBar"}<span>RAPORT TURNI</span>
      </div>
      <div className="receipt-meta">
        <span>Turni #{shift.id}</span>
        <span>{invoiceCount} fatura</span>
      </div>
      <p>
        {date(shift.opened)} {time(shift.opened)} – {date(shift.closed)}{" "}
        {time(shift.closed)}
      </p>
      <hr />
      <div className="receipt-line">
        <span>Fondi fillestar</span>
        <b>{money(shift.opening)}</b>
      </div>
      <div className="receipt-line">
        <span>Shitje cash</span>
        <b>{money(cash)}</b>
      </div>
      <div className="receipt-line">
        <span>Shitje me kartë</span>
        <b>{money(card)}</b>
      </div>
      <hr />
      <div className="receipt-total">
        <b>E PRITSHME CASH</b>
        <strong>{money(shift.expected)}</strong>
      </div>
      <div className="receipt-line">
        <span>E numëruar</span>
        <b>{money(shift.counted)}</b>
      </div>
      <div className="receipt-line">
        <span>Diferenca</span>
        <b>{money(shift.difference)}</b>
      </div>
      <hr />
      <p>PRODUKTET MË TË SHITURA</p>
      {topProducts.length ? (
        topProducts.map((p) => (
          <div className="receipt-line" key={p.name}>
            <span>
              {p.qty} × {p.name}
            </span>
            <b>{money(p.total)}</b>
          </div>
        ))
      ) : (
        <p>Asnjë shitje</p>
      )}
      <hr />
      <p>SHITJE SIPAS KAMARIERIT</p>
      {byWaiter.length ? (
        byWaiter.map((w) => (
          <div className="receipt-line" key={w.name}>
            <span>{w.name}</span>
            <b>{money(w.total)}</b>
          </div>
        ))
      ) : (
        <p>Asnjë shitje</p>
      )}
    </>
  );
}
function App({ user, onLogout }) {
  const database = useDatabase();
  const { state } = database;
  const [page, setPage] = useState("Tavolinat"),
    [selected, setSelected] = useState(null),
    [area, setArea] = useState("Të gjitha"),
    [status, setStatus] = useState("Të gjitha"),
    [category, setCategory] = useState("Të gjitha"),
    [query, setQuery] = useState("");
  const [notice, setNotice] = useState(null),
    [pinFor, setPinFor] = useState(null),
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
    [counted, setCounted] = useState(""),
    [manageTables, setManageTables] = useState(false),
    [report, setReport] = useState(null),
    [cancelling, setCancelling] = useState(false),
    [deleteConfirmId, setDeleteConfirmId] = useState(null),
    [floorEditing, setFloorEditing] = useState(false),
    [floorDraft, setFloorDraft] = useState(null),
    [floorSelected, setFloorSelected] = useState(null),
    [floorSaving, setFloorSaving] = useState(false),
    [orderMode, setOrderMode] = useState("summary");
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
    if (selected !== null && window.matchMedia("(max-width: 760px)").matches) {
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
    setPage(p);
    setSelected(null);
    setQuery("");
    setCategory("Të gjitha");
    setNotice(null);
    setEditor(null);
    setReceipt(null);
    setManageTables(false);
    setReport(null);
    setFloorEditing(false);
    setFloorDraft(null);
    setFloorSelected(null);
    setOrderMode("summary");
    setTimeout(() => heading.current?.focus(), 0);
  };
  const startFloorEdit = () => {
    setFloorDraft(
      Object.fromEntries(
        activeTables.map((t) => [t.id, { posX: t.posX, posY: t.posY, width: t.width, height: t.height, rotation: t.rotation }]),
      ),
    );
    setFloorSelected(null);
    setFloorEditing(true);
  };
  const cancelFloorEdit = () => {
    setFloorEditing(false);
    setFloorDraft(null);
    setFloorSelected(null);
  };
  const changeFloorLayout = (id, patch) =>
    setFloorDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  async function saveFloorLayout() {
    setFloorSaving(true);
    const tables = Object.entries(floorDraft).map(([id, p]) => ({ id: Number(id), ...p }));
    if (await update("table.layout", { tables }, "Plani i sallës u ruajt."))
      cancelFloorEdit();
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
  // Deactivated tables ("Menaxho tavolinat") drop off the floor but stay listed there for reactivation.
  const activeTables = state.tables.filter((t) => t.active),
    areas = [
      "Të gjitha",
      ...[...new Set(activeTables.map((t) => t.area))].sort((a, b) =>
        a.localeCompare(b, "sq"),
      ),
    ];
  // While editing, the canvas shows the local draft position/size/rotation; nothing
  // reaches the server until "Ruaj planin" sends it as one table.layout command.
  const floorTables = floorDraft
    ? activeTables.map((t) => (floorDraft[t.id] ? { ...t, ...floorDraft[t.id] } : t))
    : activeTables;
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
  const filteredStock = state.products.filter(
    (p) =>
      matches(`${p.name} ${p.category}`, query) &&
      (stockFilter === "Të gjitha" || p.stock <= 10),
  );
  const shiftInvoices = state.invoices.filter(
      (i) => i.shiftId === state.shift?.id,
    ),
    cashSales = shiftInvoices
      .filter((i) => i.method === "Cash")
      .reduce((s, i) => s + i.total, 0),
    cardSales = shiftInvoices
      .filter((i) => i.method === "Kartë")
      .reduce((s, i) => s + i.total, 0),
    expected = (state.shift?.opening || 0) + cashSales;
  const lowStock = state.products.filter((p) => p.stock <= 10).length;
  const print = (invoice) => {
    setReceipt(invoice);
    setTimeout(() => window.print(), 100);
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
    const command = {
      tableId: selected,
      method: payment,
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
        `Pagesa u regjistrua. Fatura D-${invoice.id} · ${money(invoice.total)}`,
      );
    }
  }
  async function saveProduct(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget),
      name = form.get("name").trim(),
      price = Number(form.get("price"));
    if (!name || !Number.isSafeInteger(price) || price <= 0)
      return notify("Vendosni një emër dhe një çmim të vlefshëm.", "error");
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
        },
        editor.id
          ? "Produkti u përditësua. Porositë ekzistuese ruajnë çmimin e tyre."
          : "Produkti u shtua. Shtoni gjendjen fillestare te Inventari.",
      )
    )
      setEditor(null);
  }
  async function saveTable(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget),
      area = form.get("area").trim(),
      shape = form.get("shape") || undefined,
      seats = Number(form.get("seats"));
    if (!area) return notify("Vendosni zonën e tavolinës.", "error");
    if (
      await update(
        "table.save",
        { ...(editor.id ? { id: editor.id } : {}), area, shape, seats },
        editor.id ? "Tavolina u përditësua." : "Tavolina u shtua.",
      )
    )
      setEditor(null);
  }
  // Takes the state explicitly (not the outer `state` closure) so a report built right after
  // shift.close uses that response's fresh data, not a render that hasn't caught up yet.
  const buildReport = (fromState, shift) => {
    const invoices = fromState.invoices.filter((i) => i.shiftId === shift.id);
    const cash = invoices
        .filter((i) => i.method === "Cash")
        .reduce((s, i) => s + i.total, 0),
      card = invoices
        .filter((i) => i.method === "Kartë")
        .reduce((s, i) => s + i.total, 0);
    const products = new Map();
    for (const inv of invoices)
      for (const l of inv.lines) {
        const cur = products.get(l.name) || { qty: 0, total: 0 };
        cur.qty += l.qty;
        cur.total += l.qty * l.price;
        products.set(l.name, cur);
      }
    const topProducts = [...products]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
    const waiterTotals = new Map();
    for (const inv of invoices)
      waiterTotals.set(inv.waiter, (waiterTotals.get(inv.waiter) || 0) + inv.total);
    const byWaiter = [...waiterTotals]
      .map(([id, total]) => ({
        name: fromState.waiters.find((w) => w.id === id)?.name || "—",
        total,
      }))
      .sort((a, b) => b.total - a.total);
    return { shift, invoiceCount: invoices.length, cash, card, topProducts, byWaiter };
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
              .filter((p) => role === "Menaxher" || p.name === "Tavolinat")
              .map((p) => (
                <button
                  key={p.name}
                  aria-current={page === p.name ? "page" : undefined}
                  onClick={() => nav(p.name)}
                >
                  <Icon name={p.icon} />
                  <span>{p.name}</span>
                  {p.name === "Inventari" && lowStock > 0 && (
                    <span className="nav-count">{lowStock}</span>
                  )}
                </button>
              ))}
          </nav>
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
            <div className="header-actions">
              <span className="save-status" role="status" aria-live="polite">
                {database.saving ? "Po ruhet…" : ""}
              </span>
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
              {user.venue?.name || "BlueBar"} · Pa fiskalizim.
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
                        cancelFloorEdit();
                        setManageTables(false);
                        setSelected(null);
                        setEditor(null);
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
                {page === "Tavolinat" &&
                  receipt &&
                  notice.tone === "success" && (
                    <button onClick={() => print(receipt)}>
                      <Icon name="print" size={16} />
                      Printo faturën
                    </button>
                  )}
                {page === "Turnet" && report && notice.tone === "success" && (
                  <button onClick={() => window.print()}>
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
                          <>
                            <button onClick={cancelFloorEdit} disabled={floorSaving}>Anulo planin</button>
                            <button className="primary" onClick={saveFloorLayout} disabled={floorSaving}>
                              <Icon name="check" size={17} />
                              {floorSaving ? "Po ruhet…" : "Ruaj planin"}
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={startFloorEdit} disabled={!activeTables.length}>
                              <Icon name="location" size={17} />
                              Vendos tavolinat në sallë
                            </button>
                            <button className="primary" onClick={() => setEditor({})}>
                              <Icon name="plus" size={18} />
                              Shto tavolinë
                            </button>
                          </>
                        )}
                      </div>
                    </SectionHeading>
                    {floorEditing ? (
                      <div className="floor-management">
                        <p className="floor-edit-hint">
                          <Icon name="info" size={16} />
                          Tërhiqni tavolinat për t’i vendosur. Zgjidhni një tavolinë për ta rrotulluar ose për t’i ndryshuar madhësinë.
                        </p>
                        <FloorPlan
                          tables={floorTables}
                          editing
                          selected={floorSelected}
                          waiters={state.waiters}
                          onSelectTable={(t) => setFloorSelected(t?.id ?? null)}
                          onLayoutChange={changeFloorLayout}
                        />
                        {floorSelected && (
                          <div className="floor-selected-tools">
                            <span>Tavolina {String(floorSelected).padStart(2, "0")} · {state.tables.find((t) => t.id === floorSelected)?.shape}</span>
                            <button onClick={() => setEditor({ ...state.tables.find((t) => t.id === floorSelected) })}>
                              Ndrysho formën dhe vendet
                            </button>
                          </div>
                        )}
                      </div>
                    ) : state.tables.length ? (
                      <div className="table-admin-grid">
                        {[...state.tables]
                          .sort((a, b) => a.id - b.id)
                          .map((t) => (
                            <article
                              className={`table-admin-card ${t.active ? "" : "inactive"}`}
                              key={t.id}
                            >
                              <div className="table-admin-head">
                                <div>
                                  <small>Tavolina</small>
                                  <strong>{String(t.id).padStart(2, "0")}</strong>
                                </div>
                                <Badge tone={t.active ? "green" : ""}>
                                  {t.active ? "Aktive" : "Joaktive"}
                                </Badge>
                              </div>
                              <div className="table-admin-visual">
                                <TableSymbol shape={t.shape} />
                                <span className="sr-only">
                                  Forma {t.shape || "Drejtkëndësh"}
                                </span>
                              </div>
                              <div className="table-admin-zone">
                                <Icon name="location" size={15} />
                                <span>{t.area}</span>
                              </div>
                              <div className="table-admin-actions">
                                <button
                                  aria-label={`Ndrysho tavolinën ${t.id}`}
                                  onClick={() => setEditor({ ...t })}
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
                                return (
                                  <>
                                    <button
                                      className="text-button table-admin-delete"
                                      disabled={blocked}
                                      aria-describedby={blocked ? `table-delete-help-${t.id}` : undefined}
                                      onClick={() => setDeleteConfirmId(t.id)}
                                    >
                                      Fshi tavolinën
                                    </button>
                                    {blocked && (
                                      <small className="table-admin-help" id={`table-delete-help-${t.id}`}>
                                        {t.lines.length > 0
                                          ? "Ka porosi të hapura"
                                          : "Ka histori faturash; përdorni çaktivizimin"}
                                      </small>
                                    )}
                                  </>
                                );
                              })()}
                            </article>
                          ))}
                      </div>
                    ) : (
                      <Empty icon="tables" title="Ende pa tavolina">
                        Shtoni tavolinën e parë për të nisur sallën.
                      </Empty>
                    )}
                  </section>
                  <aside className="management-aside">
                    {editor && (
                      <section className="panel editor-panel">
                        <SectionHeading
                          title={
                            editor.id ? "Ndrysho tavolinën" : "Tavolinë e re"
                          }
                        >
                          <button
                            className="icon-button"
                            onClick={() => setEditor(null)}
                            aria-label="Mbyll formularin e tavolinës"
                          >
                            <Icon name="close" size={18} />
                          </button>
                        </SectionHeading>
                        <form
                          key={editor.id || "new"}
                          className="stack-form"
                          onSubmit={saveTable}
                        >
                          <Field
                            label="Zona"
                            name="area"
                            defaultValue={editor.area || ""}
                            placeholder="p.sh. Salla"
                            maxLength={40}
                            required
                            autoFocus
                          />
                          <TableShapePicker
                            defaultValue={editor.shape || "Drejtkëndësh"}
                          />
                          <Field
                            label="Numri i vendeve"
                            name="seats"
                            type="number"
                            min={1}
                            max={12}
                            defaultValue={editor.seats || 4}
                            required
                          />
                          <p className="helper">
                            Forma dhe vendet caktohen këtu; pozicioni vendoset te "Vendos tavolinat në sallë".
                          </p>
                          <button className="primary">
                            {editor.id ? "Ruaj ndryshimet" : "Shto tavolinë"}
                          </button>
                        </form>
                      </section>
                    )}
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
                          waiters={state.waiters}
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
                    <section
                      className="order"
                      aria-label={`Porosia e tavolinës ${table.id}`}
                    >
                      <div className="order-heading">
                        <div>
                          <span className="order-title">
                            <Icon name="tables" />
                            <h2 ref={orderHeading} tabIndex={-1}>
                              Tavolina {String(table.id).padStart(2, "0")}
                            </h2>
                          </span>
                          <p>
                            {table.area} ·{" "}
                            {table.lines.length
                              ? "Porosi e hapur"
                              : "Porosi e re"}
                          </p>
                        </div>
                        <button
                          className="icon-button"
                          onClick={() => setSelected(null)}
                          aria-label="Kthehu te tavolinat"
                        >
                          <Icon name="close" />
                        </button>
                      </div>
                      <TableDetailPanel table={table} time={time} />
                      <div className="order-body">
                        {!state.waiters.some((w) => w.active) && (
                          <p className="notice warning">
                            Shtoni një kamarier aktiv te Kamarierët përpara
                            porosisë.
                          </p>
                        )}
                        <ChoiceField
                          label="Kamarieri"
                          disabled={role === "Kamarier"}
                          value={table.lines.length ? table.waiter : waiter}
                          options={state.waiters
                            .filter((w) => w.active || (table.lines.length && w.id === table.waiter))
                            .map((w) => ({ value: w.id, label: w.name }))}
                          onChange={(next) => {
                            setWaiter(next);
                            update("order.assign", {
                              tableId: selected,
                              waiterId: next,
                            });
                          }}
                        />
                        <div className="order-mode-tabs" role="group" aria-label="Pamja e porosisë">
                          <button aria-pressed={orderMode === "summary"} disabled={!table.lines.length} onClick={() => setOrderMode("summary")}>Porosia</button>
                          <button aria-pressed={orderMode === "add"} onClick={() => setOrderMode("add")}><Icon name="plus" size={16} /> Shto artikuj</button>
                        </div>
                        {orderMode === "add" && <div className="order-add-products">
                        <Search
                          label="Kërko produkt për porosinë"
                          placeholder="Kërko një produkt…"
                          value={query}
                          onChange={setQuery}
                        />
                        <div
                          className="category-tabs"
                          aria-label="Kategoritë e menusë"
                        >
                          {["Të gjitha", ...state.categories].map((c) => (
                            <button
                              key={c}
                              aria-pressed={category === c}
                              onClick={() => setCategory(c)}
                            >
                              {c}
                            </button>
                          ))}
                        </div>
                        <div className="product-picker">
                          {filteredProducts.map((p) => (
                            <button
                              key={p.id}
                              disabled={
                                !state.shift || !waiter || available(p) <= 0
                              }
                              onClick={() =>
                                update("order.add", {
                                  tableId: selected,
                                  productId: p.id,
                                  waiterId: table.lines.length
                                    ? table.waiter
                                    : waiter,
                                })
                              }
                            >
                              <span>{p.name}</span>
                              <div>
                                <b>{money(p.price)}</b>
                                {available(p) <= 0 ? (
                                  <small>Pa stok</small>
                                ) : (
                                  <Icon name="plus" size={15} />
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                        {!filteredProducts.length && (
                          <p className="inline-empty">
                            Nuk u gjet asnjë produkt. Provoni një emër tjetër.
                          </p>
                        )}
                        </div>}
                        <div className="order-section-title">
                          <h3>Porosia aktuale</h3>
                          <span>
                            {table.lines.reduce((s, l) => s + l.qty, 0)} {table.lines.reduce((s, l) => s + l.qty, 0) === 1 ? "artikull" : "artikuj"}
                          </span>
                        </div>
                        {!table.lines.length ? (
                          <Empty icon="coffee" title="Gati për porosinë e parë">
                            Zgjidhni produktet nga menuja më sipër.
                          </Empty>
                        ) : (
                          <div className="order-lines">
                            {table.lines.map((l) => (
                              <div className="order-line" key={l.id}>
                                <div className="line-name">
                                  <strong>{l.name}</strong>
                                  <small>{money(l.price)} / copë</small>
                                </div>
                                <div className="quantity">
                                  <button
                                    aria-label={`Hiq një ${l.name}`}
                                    onClick={() =>
                                      update("order.remove", {
                                        tableId: selected,
                                        productId: l.id,
                                      })
                                    }
                                  >
                                    −
                                  </button>
                                  <span>{l.qty}</span>
                                  <button
                                    disabled={
                                      available(
                                        state.products.find(
                                          (p) => p.id === l.id,
                                        ),
                                      ) <= 0
                                    }
                                    aria-label={`Shto një ${l.name}`}
                                    onClick={() =>
                                      update("order.add", {
                                        tableId: selected,
                                        productId: l.id,
                                        waiterId: table.waiter,
                                      })
                                    }
                                  >
                                    +
                                  </button>
                                </div>
                                <b>{money(l.price * l.qty)}</b>
                              </div>
                            ))}
                          </div>
                        )}
                        {role === "Menaxher" && table.lines.length > 0 && (
                        <div className="order-cancel">
                          {cancelling ? (
                            <form className="stack-form" onSubmit={async (e) => {
                              e.preventDefault();
                              const reason = new FormData(e.currentTarget).get("reason");
                              const data = await update("order.cancel", { tableId: table.id, reason }, "Porosia u anulua dhe tavolina u lirua.");
                              if (data) {
                                setCancelling(false);
                                setSelected(null);
                              }
                            }}>
                              <Field label="Arsyeja e anulimit" name="reason" minLength={3} maxLength={200} required placeholder="p.sh. Porosi prove" autoFocus />
                              <p className="helper">Anulohet vetëm porosia e papaguar. Nuk krijohet faturë dhe arsyeja e anulimit ruhet.</p>
                              <div className="actions">
                                <button type="button" onClick={() => setCancelling(false)}>Kthehu</button>
                                <button className="danger-button">Konfirmo anulimin</button>
                              </div>
                            </form>
                          ) : (
                            <button className="text-button" onClick={() => setCancelling(true)}>Anulo porosinë</button>
                          )}
                        </div>
                        )}
                      </div>
                      <div className="order-payment">
                        <div className="order-total">
                          <span>Totali për pagesë</span>
                          <strong>{money(total(table.lines))}</strong>
                        </div>
                        <div className="actions">
                          <button
                            onClick={() => setOrderMode(orderMode === "add" ? "summary" : "add")}
                            disabled={orderMode === "add" && !table.lines.length}
                          >
                            <Icon name={orderMode === "add" ? "receipt" : "plus"} size={17} />
                            {orderMode === "add" ? "Shiko porosinë" : "Shto artikuj"}
                          </button>
                          <button
                            className="primary"
                            disabled={!table.lines.length || !state.shift}
                            onClick={() => startPayment("Zgjidh")}
                          >
                            <Icon name="check" size={17} />
                            Mbyll porosinë
                          </button>
                        </div>
                      </div>
                    </section>
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
                          <small>Cash ose kartë · format 80mm</small>
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
                      <table className="responsive-table">
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
                            <tr key={i.id}>
                              <td data-label="Fatura">
                                <strong>D-{i.id}</strong>
                                <small className="positive">Paguar</small>
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
                                  onClick={() => setReceipt(i)}
                                >
                                  Shiko
                                  <Icon name="arrow" size={15} />
                                </button>
                                <button
                                  className="icon-button"
                                  aria-label={`Printo faturën D-${i.id}`}
                                  onClick={() => print(i)}
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
                      <button
                        className="icon-button"
                        onClick={() => setReceipt(null)}
                        aria-label="Mbyll detajet e faturës"
                      >
                        <Icon name="close" />
                      </button>
                    </div>
                    <article className="receipt-paper">
                      <Receipt invoice={receipt} venueName={user.venue?.name} />
                    </article>
                    <button
                      className="primary full-width"
                      onClick={() => print(receipt)}
                    >
                      <Icon name="print" size={18} />
                      Printo 80mm
                    </button>
                    <p className="helper">
                      Zgjidhni letër 80mm dhe hiqni header/footer në dialogun e
                      printimit.
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
                      placeholder="Kërko produkt ose kategori…"
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
                            <th>Kategoria</th>
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
                              <td data-label="Kategoria">{p.category}</td>
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
                    description={`${state.products.length} produkte · ${state.categories.length} kategori`}
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
                      options={["Të gjitha", ...state.categories].map((item) => ({ value: item, label: item }))}
                      value={category}
                      onChange={setCategory}
                    />
                  </div>
                  {filteredProducts.length ? (
                    <div className="table-scroll">
                      <table className="responsive-table">
                        <thead>
                          <tr>
                            <th>Produkti</th>
                            <th>Kategoria</th>
                            <th className="numeric">Çmimi</th>
                            <th>
                              <span className="sr-only">Veprimet</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredProducts.map((p) => (
                            <tr key={p.id}>
                              <td data-label="Produkti">
                                <strong>{p.name}</strong>
                                <small>{p.stock} copë në stok</small>
                              </td>
                              <td data-label="Kategoria">
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
                          }}
                        >
                          Pastro filtrat
                        </button>
                      }
                    >
                      {state.products.length ? "Provoni një emër tjetër ose ndryshoni kategorinë." : "Krijoni kategorinë e parë te Kategoritë, pastaj shtoni produktet dhe çmimet."}
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
                      description="Organizoni produktet për t’i gjetur më shpejt."
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
                            "Vendosni emrin e kategorisë.",
                            "error",
                          );
                        if (
                          state.categories.some(
                            (c) => c.toLowerCase() === name.toLowerCase(),
                          )
                        )
                          return notify(
                            "Kjo kategori ekziston tashmë.",
                            "error",
                          );
                        if (
                          await update(
                            "category.create",
                            { name },
                            "Kategoria u shtua.",
                          )
                        )
                          formElement.reset();
                      }}
                    >
                      <Field
                        label="Kategori e re"
                        name="category"
                        placeholder="p.sh. Ëmbëlsira"
                        maxLength={40}
                        required
                      />
                      <button>
                        <Icon name="plus" size={16} />
                        Shto kategori
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
                                  {w.hasPin
                                    ? "Kamarier · Hyn me PIN"
                                    : "Kamarier · Pa PIN, nuk mund të hyjë"}
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
                                <button onClick={() => setPinFor(w.id)}>
                                  {w.hasPin ? "Ndrysho PIN" : "Vendos PIN"}
                                </button>
                              )}
                            </div>
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
                  <BusinessNetwork venue={user.venue} />
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
                      <strong>Hyrja e kamarierëve</strong>
                      <p>
                        Çdo kamarier hyn me një PIN 6-shifror që vendosni ju.
                        Pas 5 përpjekjeve të gabuara llogaria bllokohet për 15
                        minuta; vendosja e një PIN-i të ri e zhbllokon. Kamarierët
                        hyjnë vetëm nga rrjeti i lokalit.
                      </p>
                    </div>
                  </div>
                </aside>
              </div>
            )}

            {page === "Turnet" && (
              <div className="management-layout">
                <div>
                  <section className="panel">
                    <SectionHeading
                      title={
                        state.shift ? "Turni aktual" : "Gati për turnin e ri"
                      }
                      description={
                        state.shift
                          ? `Hapur më ${date(state.shift.opened)}, ora ${time(state.shift.opened)}`
                          : "Vendosni fondin fillestar të arkës për të nisur shërbimin."
                      }
                    >
                      <Badge tone={state.shift ? "green" : ""}>
                        {state.shift ? "I hapur" : "I mbyllur"}
                      </Badge>
                    </SectionHeading>
                    {state.shift ? (
                      <>
                        <div className="reconciliation">
                          <div>
                            <span>Fondi fillestar</span>
                            <strong>{money(state.shift.opening)}</strong>
                          </div>
                          <div>
                            <span>
                              Shitje cash{" "}
                              <small>
                                {
                                  shiftInvoices.filter(
                                    (i) => i.method === "Cash",
                                  ).length
                                }{" "}
                                fatura
                              </small>
                            </span>
                            <strong>+ {money(cashSales)}</strong>
                          </div>
                          <div className="reconciliation-total">
                            <span>Cash i pritshëm në arkë</span>
                            <strong>{money(expected)}</strong>
                          </div>
                          <div className="card-total">
                            <span>
                              Shitje me kartë{" "}
                              <small>Nuk përfshihen në cash</small>
                            </span>
                            <strong>{money(cardSales)}</strong>
                          </div>
                        </div>
                        {occupied > 0 && (
                          <div className="notice warning">
                            <Icon name="info" />
                            <span>
                              {occupied} tavolina kanë porosi të hapura.
                              Përfundoni pagesat përpara mbylljes.
                            </span>
                            <button onClick={() => nav("Tavolinat")}>
                              Shiko tavolinat
                            </button>
                          </div>
                        )}
                        <form
                          className="shift-form"
                          onSubmit={async (e) => {
                            const formElement = e.currentTarget;
                            e.preventDefault();
                            const data = await update(
                              "shift.close",
                              { counted: Number(counted) },
                              "Turni u mbyll. Numërimi u ruajt në historik.",
                            );
                            if (data) {
                              setCounted("");
                              setReport(
                                buildReport(data.state, data.state.shifts[0]),
                              );
                            }
                          }}
                        >
                          <Field
                            label="Cash i numëruar (Lek)"
                            name="amount"
                            type="number"
                            min="0"
                            step="1"
                            max="100000000"
                            value={counted}
                            onChange={(e) => setCounted(e.target.value)}
                            placeholder="Vendosni shumën reale"
                            required
                          />
                          {counted !== "" && (
                            <div
                              className={`count-difference ${Number(counted) === expected ? "positive" : "warning-text"}`}
                            >
                              <span>Diferenca e numërimit</span>
                              <strong>
                                {money(Number(counted) - expected)}
                              </strong>
                            </div>
                          )}
                          <button className="primary" disabled={occupied > 0}>
                            <Icon name="check" size={18} />
                            Mbyll turnin
                          </button>
                        </form>
                      </>
                    ) : (
                      <form
                        className="stack-form"
                        onSubmit={async (e) => {
                          const formElement = e.currentTarget;
                          e.preventDefault();
                          const amount = Number(
                            new FormData(e.currentTarget).get("amount"),
                          );
                          await update(
                            "shift.open",
                            { opening: amount },
                            "Turni u hap. Mund të filloni të merrni porosi.",
                          );
                        }}
                      >
                        <Field
                          label="Fondi fillestar (Lek)"
                          name="amount"
                          type="number"
                          min="0"
                          step="1"
                          max="100000000"
                          required
                          placeholder="p.sh. 5000"
                        />
                        <button className="primary">
                          <Icon name="plus" size={18} />
                          Hap turnin
                        </button>
                      </form>
                    )}
                  </section>
                  {report && (
                    <div className="receipt-preview">
                      <div className="preview-heading">
                        <h2>Raporti i turnit #{report.shift.id}</h2>
                        <button
                          className="icon-button"
                          onClick={() => setReport(null)}
                          aria-label="Mbyll raportin"
                        >
                          <Icon name="close" />
                        </button>
                      </div>
                      <article className="receipt-paper">
                        <ShiftReport report={report} venueName={user.venue?.name} />
                      </article>
                      <button
                        className="primary full-width"
                        onClick={() => window.print()}
                      >
                        <Icon name="print" size={18} />
                        Printo raportin
                      </button>
                    </div>
                  )}
                  <section className="panel">
                    <SectionHeading
                      title="Historiku i turneve"
                      description={`${state.shifts.length} turne të mbyllura`}
                    />
                    {state.shifts.length ? (
                      <div className="table-scroll">
                        <table className="responsive-table">
                          <thead>
                            <tr>
                              <th>Mbyllur më</th>
                              <th>E pritshme</th>
                              <th>E numëruar</th>
                              <th>Diferenca</th>
                              <th>
                                <span className="sr-only">Veprimet</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {state.shifts.map((s) => (
                              <tr key={s.id}>
                                <td data-label="Mbyllur më">
                                  {date(s.closed)}
                                  <small>{time(s.closed)}</small>
                                </td>
                                <td data-label="E pritshme">
                                  {money(s.expected)}
                                </td>
                                <td data-label="E numëruar">
                                  {money(s.counted)}
                                </td>
                                <td data-label="Diferenca">
                                  <Badge
                                    tone={
                                      s.difference === 0 ? "green" : "amber"
                                    }
                                  >
                                    {money(s.difference)}
                                  </Badge>
                                </td>
                                <td className="row-actions">
                                  <button
                                    onClick={() =>
                                      setReport(buildReport(state, s))
                                    }
                                  >
                                    Shiko raportin
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty icon="clock" title="Çdo turn, i dokumentuar">
                        Pas mbylljes së turnit të parë, numërimet dhe diferencat
                        do të shfaqen këtu.
                      </Empty>
                    )}
                  </section>
                </div>
                <aside className="management-aside">
                  <div className="info-note">
                    <Icon name="cash" />
                    <div>
                      <strong>Një numërim i qartë</strong>
                      <p>
                        Numëroni paratë fizike në arkë. Pagesat me kartë ruhen
                        veçmas dhe nuk shtohen në cash-in e pritshëm.
                      </p>
                    </div>
                  </div>
                  <div className="shift-checklist">
                    <h3>Para mbylljes</h3>
                    <p>
                      <Icon name={occupied ? "tables" : "check"} size={18} />
                      {occupied
                        ? "Përfundoni porositë e hapura"
                        : "Të gjitha tavolinat janë të lira"}
                    </p>
                    <p>
                      <Icon name="cash" size={18} />
                      Numëroni paratë në arkë
                    </p>
                    <p>
                      <Icon name="receipt" size={18} />
                      Kontrolloni diferencën e numërimit
                    </p>
                  </div>
                </aside>
              </div>
            )}
            {page === "Raportet" && <Reports state={state} />}
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
            <h2 id="payment-title">Mbyll porosinë</h2>
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
                className="primary"
                disabled={
                  payment === "Zgjidh" ||
                  (payment === "Cash" &&
                    (received === "" || Number(received) < total(table.lines)))
                }
              >
                <Icon name="check" size={17} />
                Konfirmo dhe krijo faturën
              </button>
            </div>
          </form>
        )}
      </dialog>
      {receipt && (
        <article className="receipt print-only">
          <Receipt invoice={receipt} venueName={user.venue?.name} />
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
  // undefined = checking the session, null = signed out.
  const [user, setUser] = useState(undefined);
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    fetchSession().then(setUser, () => setUser(null));
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
  return user ? <App user={user} onLogout={leave} /> : <Login onSignedIn={enter} />;
}
createRoot(document.getElementById("root")).render(<Root />);
