import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./components.jsx";
import { ConfirmProvider, useConfirm } from "./ConfirmDialog.jsx";
import { money } from "./domain.js";
import "./admin.css";

// BlueSquare's superadmin for BlueBar (/admin), laid out like LuxHotel's Admin Panel: a tab per
// area, figures on top, lists below. Server side: server/admin.js.

async function api(method, path, body) {
  let res;
  try {
    res = await fetch(`/api/admin${path}`, {
      method, headers: { "Content-Type": "application/json", "X-BlueBar-Client": "1" },
      // Every change carries a JSON body, an empty one included (the server reads them all as JSON).
      ...(method !== "GET" && { body: JSON.stringify(body ?? {}) }),
    });
  } catch {
    throw new Error("Serveri nuk përgjigjet. Kontrolloni lidhjen.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Kërkesa dështoi."), { status: res.status });
  return data;
}

const TABS = [
  ["pasqyra", "home", "Pasqyra"],
  ["bizneset", "tables", "Bizneset"],
  ["abonimet", "card", "Abonimet"],
  ["perdoruesit", "people", "Përdoruesit"],
  ["raportet", "chart", "Raportet"],
  ["historiku", "list", "Historiku"],
];
const STATUS = {
  paguar: ["Paguar", "ok"], skadon: ["Skadon së shpejti", "warn"], vonuar: ["Vonuar", "bad"],
  pa_paguar: ["Pa paguar", "bad"], falas: ["Pa abonim", "muted"],
};
const ACTIONS = {
  hyrje: "Hyri në panel", biznes_i_ri: "Krijoi biznesin", abonimi: "Ndryshoi abonimin", pagesa: "Regjistroi pagesë",
  pagesa_fshire: "Fshiu pagesën", pezullim: "Pezulloi biznesin", aktivizim: "Aktivizoi biznesin",
  pin_menaxheri: "Rivendosi PIN-in e menaxherit", fjalekalimi: "Ndryshoi fjalëkalimin", hyrje_si_menaxher: "Hyri si menaxher", biznes_i_fshire: "Fshiu biznesin",
};
const dateFmt = new Intl.DateTimeFormat("sq-AL", { day: "numeric", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("sq-AL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("sq-AL", { day: "numeric", month: "short" });
const date = (v) => (v ? dateFmt.format(new Date(String(v).length === 10 ? `${v}T12:00:00` : v)) : "—");
const when = (v) => (v ? timeFmt.format(new Date(v)) : "—");
const ago = (v) => {
  if (!v) return "Asnjëherë";
  const m = Math.round((Date.now() - new Date(v)) / 60000);
  if (m < 2) return "Tani";
  if (m < 60) return `${m} min më parë`;
  if (m < 1440) return `${Math.round(m / 60)} orë më parë`;
  const d = Math.round(m / 1440);
  return d === 1 ? "Dje" : `${d} ditë më parë`;
};
const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
// What a log entry changed, in words.
const detailText = (action, d = {}) => {
  if (action === "pagesa") return `${money(d.amount)} · ${d.months} muaj · ${d.method} · ${date(d.from)} – ${date(d.to)}`;
  if (action === "pagesa_fshire") return money(d.amount);
  if (action === "abonimi") return `${d.plan} · ${money(d.monthlyPrice)} në muaj${d.paidUntil ? ` · paguar deri ${date(d.paidUntil)}` : ""}`;
  if (action === "pezullim") return d.reason ? `Arsyeja: ${d.reason}` : "";
  if (action === "biznes_i_ri" || action === "biznes_i_fshire") return d.name || "";
  return "";
};
const route = () => window.location.hash.replace(/^#\/?/, "").split("/");

export function AdminRoot() {
  return <AdminBoundary><ConfirmProvider><Admin /></ConfirmProvider></AdminBoundary>;
}

// Never a blank page: whatever breaks, the panel says what and offers to load it again.
class AdminBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="sa-page sa-login">
        <section className="sa-card sa-login-card">
          <h1>Paneli nuk u hap</h1>
          <p>{String(this.state.error.message || this.state.error)}</p>
          <button type="button" className="sa-primary" onClick={() => window.location.reload()}>Rifresko</button>
        </section>
      </div>
    );
  }
}

function Admin() {
  const [me, setMe] = useState(undefined);
  useEffect(() => { api("GET", "/me").then(setMe, () => setMe(null)); }, []);
  if (me === undefined) return <div className="sa-page"><p className="sa-loading" role="status">Po ngarkohet…</p></div>;
  if (!me) return <AdminLogin onIn={setMe} />;
  return <Panel me={me} onOut={() => setMe(null)} />;
}

function AdminLogin({ onIn }) {
  const [form, setForm] = useState({ email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try { onIn(await api("POST", "/login", form)); } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <div className="sa-page sa-login">
      <section className="sa-card sa-login-card">
        <span className="sa-mark" aria-hidden="true">b.</span>
        <h1>BlueBar Admin</h1>
        <p>Vetëm për ekipin e BlueSquare.</p>
        <form className="sa-form" onSubmit={submit}>
          <label>Email<input className="sa-input" type="email" autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoFocus /></label>
          <label>Fjalëkalimi<input className="sa-input" type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
          {error && <p className="sa-error" role="alert">{error}</p>}
          <button className="sa-primary" disabled={busy}>{busy ? "Po hyhet…" : "Hyr"}</button>
        </form>
      </section>
    </div>
  );
}

function PasswordModal({ onClose }) {
  const [form, setForm] = useState({ current: "", next: "", again: "" });
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (form.next !== form.again) return setMsg("Fjalëkalimet e reja nuk përputhen.");
    try { await api("PUT", "/password", { current: form.current, next: form.next }); setDone(true); setMsg("Fjalëkalimi u ndryshua. Pajisjet e tjera dolën."); } catch (err) { setMsg(err.message); }
  };
  return (
    <Modal title="Ndrysho fjalëkalimin" onClose={onClose}>
      <form className="sa-form" onSubmit={submit}>
        <label>Fjalëkalimi aktual<input className="sa-input" type="password" autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} required autoFocus /></label>
        <label>Fjalëkalimi i ri<input className="sa-input" type="password" autoComplete="new-password" minLength={8} value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} required /><small>Të paktën 8 shenja.</small></label>
        <label>Përsëriteni<input className="sa-input" type="password" autoComplete="new-password" value={form.again} onChange={(e) => setForm({ ...form, again: e.target.value })} required /></label>
        {msg && <p className={done ? "sa-note" : "sa-error"} role="status">{msg}</p>}
        <button className="sa-primary" disabled={done}>Ruaj fjalëkalimin</button>
      </form>
    </Modal>
  );
}

function Panel({ me, onOut }) {
  const [path, setPath] = useState(route);
  const [venues, setVenues] = useState(null);
  const [error, setError] = useState("");
  const [changing, setChanging] = useState(false);
  useEffect(() => {
    const on = () => setPath(route());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const loadVenues = useCallback(() => api("GET", "/venues").then((d) => setVenues(d.venues), (e) => (e.status === 401 ? onOut() : setError(e.message))), [onOut]);
  useEffect(() => { loadVenues(); }, [loadVenues]);
  const [tab, slug] = path;
  const current = TABS.some(([id]) => id === tab) ? tab : "pasqyra";
  const go = (hash) => { window.location.hash = hash; };
  const logout = async () => { await api("POST", "/logout").catch(() => {}); onOut(); };
  return (
    <div className="sa-page">
      <header className="sa-head">
        <h1>Admin Panel</h1>
        <div className="sa-head-right">
          <Search venues={venues || []} onOpen={(s) => go(`bizneset/${s}`)} />
          <details className="sa-me">
            <summary><span aria-hidden="true">{me.email[0].toUpperCase()}</span>{me.email.split("@")[0]}</summary>
            <div><small>{me.email}</small>
              <button type="button" onClick={() => setChanging(true)}><Icon name="settings" size={16} /> Ndrysho fjalëkalimin</button>
              <button type="button" onClick={logout}><Icon name="power" size={16} /> Dil</button></div>
          </details>
        </div>
      </header>
      <nav className="sa-tabs" aria-label="Seksionet">
        {TABS.map(([id, icon, label]) => (
          <a key={id} href={`#${id}`} aria-current={current === id ? "page" : undefined}><Icon name={icon} size={16} />{label}</a>
        ))}
      </nav>
      {error && <p className="sa-error" role="alert">{error}</p>}
      {current === "pasqyra" && <Overview venues={venues} go={go} />}
      {current === "bizneset" && (slug ? <VenueDetail key={slug} slug={slug} onChanged={loadVenues} go={go} /> : <Venues venues={venues} go={go} onChanged={loadVenues} />)}
      {current === "abonimet" && <Subscriptions venues={venues} go={go} />}
      {current === "perdoruesit" && <Users go={go} />}
      {current === "raportet" && <Reports go={go} />}
      {current === "historiku" && <Log go={go} />}
      {changing && <PasswordModal onClose={() => setChanging(false)} />}
    </div>
  );
}

function Search({ venues, onOpen }) {
  const [q, setQ] = useState("");
  const hits = q.trim() ? venues.filter((v) => `${v.name} ${v.slug}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];
  return (
    <div className="sa-search">
      <Icon name="search" size={16} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kërko dhe hap një biznes…" aria-label="Kërko biznes"
        onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) { onOpen(hits[0].slug); setQ(""); } if (e.key === "Escape") setQ(""); }} />
      <small>{venues.length}</small>
      {hits.length > 0 && (
        <ul className="sa-search-hits">
          {hits.map((v) => <li key={v.slug}><button type="button" onClick={() => { onOpen(v.slug); setQ(""); }}><b>{v.name}</b><span>{v.slug}</span></button></li>)}
        </ul>
      )}
    </div>
  );
}

const Stat = ({ label, value, sub, tone }) => (
  <div className="sa-card sa-stat"><span>{label}</span><b className={tone ? `is-${tone}` : ""}>{value}</b>{sub && <small>{sub}</small>}</div>
);
const Chip = ({ status }) => { const [label, tone] = STATUS[status] || STATUS.falas; return <span className={`sa-chip is-${tone}`}>{label}</span>; };
const Live = ({ suspended }) => <span className={`sa-live ${suspended ? "is-off" : ""}`}>{suspended ? "Pezulluar" : "Aktiv"}</span>;
const Panelbox = ({ title, count, action, children }) => (
  <section className="sa-card sa-panel">
    <header><h2>{title}{count !== undefined && <small>{count}</small>}</h2>{action}</header>
    {children}
  </section>
);
const Loading = () => <p className="sa-loading" role="status">Po ngarkohet…</p>;

function useLoad(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [at, setAt] = useState(null);
  const load = useCallback(() => api("GET", path).then((d) => (setData(d), setAt(new Date()), setError("")), (e) => setError(e.message)), [path]);
  useEffect(() => { load(); }, [load]);
  return { data, error, load, at };
}

function Overview({ venues, go }) {
  const { data, error } = useLoad("/overview");
  if (error) return <p className="sa-error">{error}</p>;
  if (!data || !venues) return <Loading />;
  const recent = [...venues].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8);
  const s = data.subscriptions;
  return (
    <>
      <div className="sa-stats">
        <Stat label="Biznese" value={data.venues.total} sub={data.venues.suspended ? `${data.venues.suspended} të pezulluara` : "Të gjitha aktive"} />
        <Stat label="Aktive · 7 ditë" value={data.venues.active7} sub="me hyrje në 7 ditët e fundit" />
        <Stat label="Abonime mujore" value={money(s.mrr)} sub={`${money(s.collectedThisMonth)} të mbledhura këtë muaj`} />
        <Stat label="Shitjet e muajit" value={money(data.sales.month)} sub={`${data.sales.invoices} fatura në të gjitha bizneset`} />
        <Stat label="Të rinj · 30 ditë" value={data.venues.new30} />
      </div>
      <div className="sa-grid">
        <Panelbox title="Kërkojnë vëmendje" count={data.attention.length}>
          {data.attention.length ? (
            <ul className="sa-list">
              {data.attention.map((v) => (
                <li key={v.slug}><a href={`#bizneset/${v.slug}`}>
                  <div><b>{v.name}</b><span>{v.paidUntil ? `Paguar deri ${date(v.paidUntil)}` : "Asnjë pagesë e regjistruar"}</span></div>
                  <div className="sa-list-end">{v.suspended ? <Live suspended /> : <Chip status={v.status} />}</div>
                </a></li>
              ))}
            </ul>
          ) : <p className="sa-empty">Të gjitha bizneset janë në rregull me abonimin.</p>}
        </Panelbox>
        <Panelbox title="Regjistrimet e fundit" action={<a href="#bizneset">Të gjitha bizneset</a>}>
          <ul className="sa-list">
            {recent.map((v) => (
              <li key={v.slug}><a href={`#bizneset/${v.slug}`}>
                <div><b>{v.name}</b><span>{v.slug} · {v.managers} menaxher, {v.waiters} kamarierë{v.luxhotel ? " · LuxHotel" : ""}</span></div>
                <div className="sa-list-end"><Live suspended={v.suspended} /><span>{date(v.createdAt)}</span></div>
              </a></li>
            ))}
          </ul>
        </Panelbox>
      </div>
    </>
  );
}

function Venues({ venues, go, onChanged }) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  if (!venues) return <Loading />;
  const shown = venues.filter((v) => (filter === "all" || (filter === "off" ? v.suspended : filter === "late" ? ["vonuar", "pa_paguar"].includes(v.subscription.status) : !v.suspended))
    && `${v.name} ${v.slug}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <div className="sa-toolbar">
        <div className="sa-seg" role="group" aria-label="Filtro">
          {[["all", "Të gjitha"], ["on", "Aktive"], ["late", "Me vonesë"], ["off", "Të pezulluara"]].map(([k, l]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <div className="sa-toolbar-end">
          <input className="sa-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtro sipas emrit…" aria-label="Filtro bizneset" />
          <button type="button" className="sa-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Shto biznes</button>
        </div>
      </div>
      <section className="sa-card sa-table-wrap">
        <table className="sa-table">
          <thead><tr><th>Biznesi</th><th>Abonimi</th><th className="num">Shitjet e muajit</th><th className="num">Fatura</th><th>Aktiviteti i fundit</th><th>Statusi</th></tr></thead>
          <tbody>
            {shown.map((v) => (
              <tr key={v.slug} onClick={() => go(`bizneset/${v.slug}`)}>
                <td><a href={`#bizneset/${v.slug}`} onClick={(e) => e.stopPropagation()}><b>{v.name}</b></a><small>{v.slug} · që nga {date(v.createdAt)}</small></td>
                <td><Chip status={v.subscription.status} /><small>{v.subscription.monthlyPrice ? `${v.subscription.plan} · ${money(v.subscription.monthlyPrice)}/muaj` : "—"}</small></td>
                <td className="num">{v.error ? "—" : money(v.sales)}</td>
                <td className="num">{v.error ? "—" : v.invoices}</td>
                <td>{ago(v.lastSeen)}</td>
                <td><Live suspended={v.suspended} /></td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={6} className="sa-empty">Asnjë biznes me këto kritere.</td></tr>}
          </tbody>
        </table>
      </section>
      {adding && <NewVenue onClose={() => setAdding(false)} onDone={(slug) => { setAdding(false); onChanged(); go(`bizneset/${slug}`); }} />}
    </>
  );
}

function Modal({ title, children, onClose }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} className="sa-modal" onClose={onClose} aria-label={title}>
      <header><h2>{title}</h2><button type="button" className="icon-button" aria-label="Mbyll" onClick={() => ref.current?.close()}><Icon name="close" size={18} /></button></header>
      {children}
    </dialog>
  );
}

function NewVenue({ onClose, onDone }) {
  const [form, setForm] = useState({ name: "", slug: "", pin: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ë/g, "e").replace(/ç/g, "c").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try { onDone((await api("POST", "/venues", form)).slug); } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <Modal title="Biznes i ri" onClose={onClose}>
      <form className="sa-form" onSubmit={submit}>
        <label>Emri<input className="sa-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: form.slug && form.slug !== slugify(form.name) ? form.slug : slugify(e.target.value) })} required minLength={2} maxLength={80} autoFocus /></label>
        <label>Kodi i biznesit<input className="sa-input" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} required pattern="[a-z0-9][a-z0-9-]{2,39}" /><small>Në lidhje: bar.bluesquareai.com/?business={form.slug || "kodi"}</small></label>
        <label>PIN-i i menaxherit<input className="sa-input" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })} required pattern="[0-9]{6}" inputMode="numeric" /><small>6 shifra. Ia jepni pronarit; mund ta ndryshojë vetë.</small></label>
        {error && <p className="sa-error" role="alert">{error}</p>}
        <button className="sa-primary" disabled={busy}>{busy ? "Po krijohet…" : "Krijo biznesin"}</button>
      </form>
    </Modal>
  );
}

function VenueDetail({ slug, onChanged, go }) {
  const { data: v, error, load } = useLoad(`/venues/${slug}`);
  const confirm = useConfirm();
  const [modal, setModal] = useState(null);
  const [note, setNote] = useState("");
  const [openLink, setOpenLink] = useState(null);
  if (error) return <><a className="sa-back" href="#bizneset"><Icon name="back" size={16} /> Bizneset</a><p className="sa-error">{error}</p></>;
  if (!v) return <Loading />;
  const refresh = () => { load(); onChanged(); };
  const act = async (fn, done) => { try { await fn(); setNote(done); refresh(); } catch (e) { setNote(e.message); } };
  const suspend = async () => {
    if (v.suspended) {
      if (!await confirm({ title: "Aktivizo biznesin?", description: "Stafi mund të hyjë përsëri dhe menuja online rikthehet.", action: "Aktivizo" })) return;
      return act(() => api("POST", `/venues/${slug}/suspend`, { suspended: false }), "Biznesi u aktivizua.");
    }
    setModal("suspend");
  };
  const impersonate = async () => {
    if (!await confirm({ title: `Hyr si menaxher i ${v.name}?`, description: "Hapet biznesi si menaxher për 1 orë, në një skedë të re. Hyrja shënohet në historik.", action: "Hyr" })) return;
    try {
      await api("POST", `/venues/${slug}/impersonate`);
      const url = `/?business=${encodeURIComponent(slug)}`;
      // Opened after the server answers, so a strict browser may block it: then a link.
      const tab = window.open(url, "_blank");
      if (tab) tab.opener = null;
      else setOpenLink(url);
    } catch (e) { setNote(e.message); }
  };
  // Every one of the 30 days, a quiet day included, so the bars read as a calendar.
  const sales = new Map(v.daily.map((d) => [d.day, d.sales]));
  const daily = Array.from({ length: 30 }, (_, i) => { const d = daysAgo(29 - i); return { label: d, value: sales.get(d) || 0 }; });
  return (
    <>
      <a className="sa-back" href="#bizneset"><Icon name="back" size={16} /> Bizneset</a>
      <header className="sa-venue-head">
        <div>
          <h2>{v.name} <Live suspended={v.suspended} /></h2>
          <p>{v.slug} · krijuar më {date(v.createdAt)}{v.luxhotel ? " · lidhur me LuxHotel" : ""}{v.suspended && v.suspendedReason ? ` · Pezulluar: ${v.suspendedReason}` : ""}</p>
        </div>
        <div className="sa-actions">
          <button type="button" onClick={impersonate} disabled={v.suspended}><Icon name="user" size={16} /> Hyr si menaxher</button>
          <button type="button" onClick={() => setModal("pin")}><Icon name="settings" size={16} /> PIN i menaxherit</button>
          <button type="button" className={v.suspended ? "" : "is-warn"} onClick={suspend}><Icon name="power" size={16} /> {v.suspended ? "Aktivizo" : "Pezullo"}</button>
          {slug !== "bluebar" && <button type="button" className="is-danger" onClick={() => setModal("delete")}><Icon name="trash" size={16} /> Fshi</button>}
        </div>
      </header>
      {note && <p className="sa-note" role="status">{note}</p>}
      {openLink && <p className="sa-note" role="status">Hyrja si menaxher është gati për 1 orë. <a href={openLink} target="_blank" rel="noopener" onClick={() => setOpenLink(null)}><b>Hap BlueBar si menaxher</b></a></p>}
      <div className="sa-stats">
        <Stat label="Shitjet e muajit" value={money(v.month.sales)} sub={`${v.month.invoices} fatura`} />
        <Stat label="Cash" value={money(v.month.cash)} />
        <Stat label="Kartë" value={money(v.month.card)} />
        <Stat label="Rimbursime" value={money(v.month.refunds)} tone={v.month.refunds ? "warn" : ""} />
        <Stat label="Produkte · stafi" value={`${v.month.products} · ${v.users.length}`} sub={`Aktiviteti i fundit: ${ago(v.month.lastSeen)}`} />
      </div>
      <section className="sa-card sa-panel">
        <header><h2>Shitjet për ditë <small>30 ditët e fundit</small></h2></header>
        <Bars data={daily} max={Math.max(...daily.map((d) => d.value))} />
      </section>
      <div className="sa-grid">
        <Subscription v={v} onSaved={refresh} />
        <Panelbox title="Stafi" count={v.users.length}>
          <ul className="sa-list">
            {v.users.map((u) => (
              <li key={`${u.role}-${u.id}`}><div><b>{u.name}</b><span>{u.role === "manager" ? "Menaxher" : "Kamarier"}</span></div>
                <div className="sa-list-end"><span className={`sa-live ${u.active ? "" : "is-off"}`}>{u.active ? "Aktiv" : "Joaktiv"}</span><span>{ago(u.lastSeen)}</span></div></li>
            ))}
            {!v.users.length && <li className="sa-empty">Pa staf ende.</li>}
          </ul>
        </Panelbox>
      </div>
      <Panelbox title="Historiku i këtij biznesi" count={v.log.length}>
        <LogList rows={v.log.map((l) => ({ at: l.at, admin: l.admin_email, action: l.action, detail: l.detail }))} />
      </Panelbox>
      {modal === "pin" && <PinModal slug={slug} onClose={() => setModal(null)} onDone={() => { setModal(null); setNote("PIN-i i menaxherit u ndryshua. Sesionet e tij u mbyllën."); refresh(); }} />}
      {modal === "suspend" && <SuspendModal v={v} onClose={() => setModal(null)} onDone={() => { setModal(null); setNote("Biznesi u pezullua. Të gjithë dolën."); refresh(); }} />}
      {modal === "delete" && <DeleteModal v={v} onClose={() => setModal(null)} onDone={() => { setModal(null); onChanged(); go("bizneset"); }} />}
    </>
  );
}

function PinModal({ slug, onClose, onDone }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  return (
    <Modal title="PIN i ri për menaxherin" onClose={onClose}>
      <form className="sa-form" onSubmit={async (e) => { e.preventDefault(); try { await api("POST", `/venues/${slug}/manager-pin`, { pin }); onDone(); } catch (err) { setError(err.message); } }}>
        <label>PIN i ri (6 shifra)<input className="sa-input" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} required pattern="[0-9]{6}" inputMode="numeric" autoFocus /></label>
        <p className="sa-help">Menaxheri del nga çdo pajisje dhe hyn me PIN-in e ri.</p>
        {error && <p className="sa-error" role="alert">{error}</p>}
        <button className="sa-primary" disabled={pin.length !== 6}>Ruaj PIN-in</button>
      </form>
    </Modal>
  );
}

function SuspendModal({ v, onClose, onDone }) {
  const [reason, setReason] = useState(["vonuar", "pa_paguar"].includes(v.subscription.status) ? "Abonimi i papaguar" : "");
  const [error, setError] = useState("");
  return (
    <Modal title={`Pezullo ${v.name}?`} onClose={onClose}>
      <form className="sa-form" onSubmit={async (e) => { e.preventDefault(); try { await api("POST", `/venues/${v.slug}/suspend`, { suspended: true, reason }); onDone(); } catch (err) { setError(err.message); } }}>
        <p className="sa-help">Askush në këtë biznes nuk mund të hyjë, menuja online dhe ChatGPT ndalen. Të dhënat ruhen; e aktivizoni kur të doni.</p>
        <label>Arsyeja (opsionale)<input className="sa-input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} /></label>
        {error && <p className="sa-error" role="alert">{error}</p>}
        <button className="sa-primary is-warn">Pezullo biznesin</button>
      </form>
    </Modal>
  );
}

function DeleteModal({ v, onClose, onDone }) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  return (
    <Modal title={`Fshi ${v.name}?`} onClose={onClose}>
      <form className="sa-form" onSubmit={async (e) => { e.preventDefault(); try { await api("DELETE", `/venues/${v.slug}`, { confirm: typed }); onDone(); } catch (err) { setError(err.message); } }}>
        <p className="sa-help">Fshihen përgjithmonë të gjitha porositë, faturat, produktet dhe stafi i këtij biznesi. Kjo nuk kthehet pas.</p>
        <label>Shkruani <b>{v.slug}</b> për ta konfirmuar<input className="sa-input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus /></label>
        {error && <p className="sa-error" role="alert">{error}</p>}
        <button className="sa-primary is-danger" disabled={typed !== v.slug}>Fshi përgjithmonë</button>
      </form>
    </Modal>
  );
}

function Subscription({ v, onSaved }) {
  const sub = v.subscription;
  const [plan, setPlan] = useState({ plan: sub.plan || "Standard", monthlyPrice: sub.monthlyPrice || 0, note: sub.note || "" });
  const [pay, setPay] = useState({ months: 1, amount: sub.monthlyPrice || "", paidOn: todayISO(), method: "Bankë", note: "" });
  const [msg, setMsg] = useState("");
  const confirm = useConfirm();
  const run = async (fn, done) => { try { await fn(); setMsg(done); onSaved(); } catch (e) { setMsg(e.message); } };
  return (
    <Panelbox title="Abonimi" action={<Chip status={sub.status} />}>
      <div className="sa-sub">
        <p className="sa-sub-line">{sub.paidUntil ? <>Paguar deri më <b>{date(sub.paidUntil)}</b></> : "Asnjë pagesë e regjistruar"}{sub.monthlyPrice ? ` · ${money(sub.monthlyPrice)} në muaj` : ""}</p>
        <form className="sa-form sa-form-row" onSubmit={(e) => { e.preventDefault(); run(() => api("PUT", `/venues/${v.slug}/subscription`, { ...plan, monthlyPrice: Number(plan.monthlyPrice) || 0 }), "Abonimi u ruajt."); }}>
          <label>Plani<input className="sa-input" value={plan.plan} onChange={(e) => setPlan({ ...plan, plan: e.target.value })} required maxLength={40} /></label>
          <label>Çmimi në muaj (Lek)<input className="sa-input" type="number" min={0} value={plan.monthlyPrice} onChange={(e) => setPlan({ ...plan, monthlyPrice: e.target.value })} /></label>
          <label className="wide">Shënim<input className="sa-input" value={plan.note} onChange={(e) => setPlan({ ...plan, note: e.target.value })} maxLength={300} placeholder="p.sh. 2 muaj falas në fillim" /></label>
          <button className="sa-secondary">Ruaj abonimin</button>
        </form>
        <h3>Regjistro pagesë</h3>
        <form className="sa-form sa-form-row" onSubmit={(e) => { e.preventDefault(); run(() => api("POST", `/venues/${v.slug}/payments`, { ...pay, amount: Number(pay.amount), months: Number(pay.months) }), "Pagesa u regjistrua."); }}>
          <label>Muaj<select className="sa-input" value={pay.months} onChange={(e) => setPay({ ...pay, months: e.target.value, amount: sub.monthlyPrice ? sub.monthlyPrice * Number(e.target.value) : pay.amount })}>
            {[1, 2, 3, 6, 12].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          <label>Shuma (Lek)<input className="sa-input" type="number" min={1} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} required /></label>
          <label>Data<input className="sa-input" type="date" value={pay.paidOn} onChange={(e) => setPay({ ...pay, paidOn: e.target.value })} required /></label>
          <label>Mënyra<select className="sa-input" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}><option>Bankë</option><option>Cash</option></select></label>
          <label className="wide">Shënim<input className="sa-input" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} maxLength={200} placeholder="p.sh. nr. i transfertës" /></label>
          <button className="sa-primary">Regjistro pagesën</button>
        </form>
        {msg && <p className="sa-note" role="status">{msg}</p>}
        <ul className="sa-list sa-payments">
          {v.payments.map((p, i) => (
            <li key={p.id}><div><b>{money(p.amount)}</b><span>{date(p.paidOn)} · {p.method} · {p.months} muaj ({date(p.from)} – {date(p.to)}){p.note ? ` · ${p.note}` : ""}</span></div>
              <div className="sa-list-end"><span>{p.by.split("@")[0]}</span>
                {i === 0 && <button type="button" className="sa-link is-danger" onClick={async () => {
                  if (await confirm({ title: "Fshi pagesën e fundit?", description: `${money(p.amount)} · ${p.months} muaj hiqen nga abonimi.`, action: "Fshi pagesën", destructive: true }))
                    run(() => api("DELETE", `/venues/${v.slug}/payments/${p.id}`), "Pagesa u fshi.");
                }}>Fshi</button>}</div></li>
          ))}
          {!v.payments.length && <li className="sa-empty">Asnjë pagesë ende.</li>}
        </ul>
      </div>
    </Panelbox>
  );
}

// Bars by day, like LuxHotel's "Mesazhe për ditë": a light grid, one blue bar a day.
function Bars({ data, max, money: asMoney = true }) {
  if (!data.length) return <p className="sa-empty">Asnjë shitje në këtë periudhë.</p>;
  const top = Math.max(max, 1), W = 1000, H = 220, pad = 34, bw = Math.min(28, (W - pad) / data.length * 0.55);
  const step = (W - pad) / data.length;
  const fmt = (n) => (asMoney ? (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)) : String(n));
  return (
    <div className="sa-chart">
      <svg viewBox={`0 0 ${W} ${H + 26}`} role="img" aria-label="Shitjet sipas ditës">
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={pad} x2={W} y1={H - f * (H - 10)} y2={H - f * (H - 10)} className="grid" /><text x={pad - 8} y={H - f * (H - 10) + 4} textAnchor="end">{fmt(Math.round(top * f))}</text></g>)}
        {data.map((d, i) => {
          const h = (d.value / top) * (H - 10), x = pad + i * step + (step - bw) / 2;
          return <g key={d.label}><rect x={x} y={H - h} width={bw} height={Math.max(h, d.value ? 2 : 0)} rx="4"><title>{`${date(d.label)}: ${asMoney ? money(d.value) : d.value}`}</title></rect>
            {(data.length <= 14 || i % Math.ceil(data.length / 10) === 0) && <text x={x + bw / 2} y={H + 20} textAnchor="middle">{dayFmt.format(new Date(`${d.label}T12:00:00`))}</text>}</g>;
        })}
      </svg>
    </div>
  );
}

function Subscriptions({ venues, go }) {
  const { data } = useLoad("/payments");
  if (!venues || !data) return <Loading />;
  const by = (st) => venues.filter((v) => v.subscription.status === st);
  const order = { vonuar: 0, pa_paguar: 1, skadon: 2, paguar: 3, falas: 4 };
  const sorted = [...venues].sort((a, b) => order[a.subscription.status] - order[b.subscription.status] || (a.subscription.paidUntil || "").localeCompare(b.subscription.paidUntil || ""));
  const month = todayISO().slice(0, 7);
  return (
    <>
      <div className="sa-stats">
        <Stat label="Të paguara" value={by("paguar").length} />
        <Stat label="Skadojnë · 7 ditë" value={by("skadon").length} tone={by("skadon").length ? "warn" : ""} />
        <Stat label="Të vonuara / pa paguar" value={by("vonuar").length + by("pa_paguar").length} tone={by("vonuar").length + by("pa_paguar").length ? "bad" : ""} />
        <Stat label="Abonime mujore" value={money(venues.filter((v) => !v.suspended && v.subscription.status !== "falas").reduce((n, v) => n + v.subscription.monthlyPrice, 0))} />
        <Stat label="Të mbledhura këtë muaj" value={money(data.payments.filter((p) => p.paidOn.startsWith(month)).reduce((n, p) => n + p.amount, 0))} />
      </div>
      <div className="sa-grid">
        <section className="sa-card sa-table-wrap">
          <table className="sa-table">
            <thead><tr><th>Biznesi</th><th>Plani</th><th className="num">Në muaj</th><th>Paguar deri</th><th>Statusi</th></tr></thead>
            <tbody>
              {sorted.map((v) => (
                <tr key={v.slug} onClick={() => go(`bizneset/${v.slug}`)}>
                  <td><a href={`#bizneset/${v.slug}`} onClick={(e) => e.stopPropagation()}><b>{v.name}</b></a><small>{v.slug}</small></td>
                  <td>{v.subscription.plan || "—"}</td>
                  <td className="num">{v.subscription.monthlyPrice ? money(v.subscription.monthlyPrice) : "—"}</td>
                  <td>{date(v.subscription.paidUntil)}</td>
                  <td><Chip status={v.subscription.status} />{v.suspended && <Live suspended />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <Panelbox title="Pagesat e fundit" count={data.payments.length}>
          <ul className="sa-list">
            {data.payments.slice(0, 20).map((p) => (
              <li key={p.id}><a href={`#bizneset/${p.venue}`}><div><b>{p.venueName || p.venue}</b><span>{p.method} · {p.months} muaj · {date(p.paidOn)}</span></div>
                <div className="sa-list-end"><b>{money(p.amount)}</b><span>{p.by.split("@")[0]}</span></div></a></li>
            ))}
            {!data.payments.length && <li className="sa-empty">Asnjë pagesë e regjistruar ende. Regjistrojeni te faqja e biznesit.</li>}
          </ul>
        </Panelbox>
      </div>
    </>
  );
}

function Users({ go }) {
  const { data } = useLoad("/users");
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  if (!data) return <Loading />;
  const users = data.users;
  const week = (u) => u.lastSeen && Date.now() - new Date(u.lastSeen) < 7 * 864e5;
  const shown = users.filter((u) => (role === "all" || u.role === role) && `${u.name} ${u.venueName}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0));
  return (
    <>
      <div className="sa-stats">
        <Stat label="Përdorues" value={users.length} />
        <Stat label="Menaxherë" value={users.filter((u) => u.role === "manager").length} />
        <Stat label="Kamarierë" value={users.filter((u) => u.role === "waiter").length} />
        <Stat label="Aktivë · 7 ditë" value={users.filter(week).length} />
        <Stat label="Joaktivë" value={users.filter((u) => !u.active).length} />
      </div>
      <div className="sa-toolbar">
        <div className="sa-seg" role="group" aria-label="Roli">
          {[["all", "Të gjithë"], ["manager", "Menaxherë"], ["waiter", "Kamarierë"]].map(([k, l]) => <button key={k} type="button" aria-pressed={role === k} onClick={() => setRole(k)}>{l}</button>)}
        </div>
        <input className="sa-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kërko emër ose biznes…" aria-label="Kërko përdorues" />
      </div>
      <section className="sa-card sa-table-wrap">
        <table className="sa-table">
          <thead><tr><th>Emri</th><th>Roli</th><th>Biznesi</th><th>Hyrja e fundit</th><th>Statusi</th></tr></thead>
          <tbody>
            {shown.map((u) => (
              <tr key={`${u.venue}-${u.role}-${u.id}`} onClick={() => go(`bizneset/${u.venue}`)}>
                <td><b>{u.name}</b></td><td>{u.role === "manager" ? "Menaxher" : "Kamarier"}</td>
                <td><a href={`#bizneset/${u.venue}`} onClick={(e) => e.stopPropagation()}>{u.venueName}</a></td>
                <td>{ago(u.lastSeen)}</td>
                <td><span className={`sa-live ${u.active && !u.suspended ? "" : "is-off"}`}>{u.suspended ? "Biznes i pezulluar" : u.active ? "Aktiv" : "Joaktiv"}</span></td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={5} className="sa-empty">Asnjë përdorues.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  );
}

function Reports() {
  const [days, setDays] = useState(30);
  const { data, error, load, at } = useLoad(`/reports?from=${daysAgo(days - 1)}&to=${todayISO()}`);
  const filled = useMemo(() => {
    if (!data) return [];
    const map = new Map(data.days.map((d) => [d.day, d]));
    return Array.from({ length: days }, (_, i) => { const d = daysAgo(days - 1 - i); return { label: d, value: map.get(d)?.sales || 0 }; });
  }, [data, days]);
  if (error) return <p className="sa-error">{error}</p>;
  const total = (k) => (data ? data.days.reduce((n, d) => n + d[k], 0) : 0);
  const topVenue = data ? Math.max(1, ...data.venues.map((v) => v.sales)) : 1;
  return (
    <>
      <div className="sa-toolbar">
        <div className="sa-seg" role="group" aria-label="Periudha">
          {[7, 30, 90].map((n) => <button key={n} type="button" aria-pressed={days === n} onClick={() => setDays(n)}>{n} ditë</button>)}
        </div>
        <div className="sa-toolbar-end">{at && <small className="sa-muted">Përditësuar {at.toLocaleTimeString("sq-AL", { hour: "2-digit", minute: "2-digit" })}</small>}
          <button type="button" className="sa-secondary" onClick={load}><Icon name="rotate" size={16} /> Rifresko</button></div>
      </div>
      {!data ? <Loading /> : (
        <>
          <div className="sa-stats">
            <Stat label="Shitjet" value={money(total("sales"))} sub={`në ${data.venues.filter((v) => v.sales).length} biznese`} />
            <Stat label="Fatura" value={total("invoices")} sub={total("invoices") ? `mesatarja ${money(Math.round(total("sales") / total("invoices")))}` : ""} />
            <Stat label="Cash" value={money(total("cash"))} sub={total("sales") ? `${Math.round((total("cash") / total("sales")) * 100)}% e shitjeve` : ""} />
            <Stat label="Kartë" value={money(total("card"))} sub={total("sales") ? `${Math.round((total("card") / total("sales")) * 100)}% e shitjeve` : ""} />
            <Stat label="Abonime të mbledhura" value={money(data.subscriptionsCollected)} sub={`${data.subscriptionPayments} pagesa`} />
          </div>
          <section className="sa-card sa-panel">
            <header><h2>Shitjet për ditë <small>nga {date(data.from)}</small></h2></header>
            <Bars data={filled} max={Math.max(...filled.map((d) => d.value))} />
          </section>
          <div className="sa-grid">
            <Panelbox title="Bizneset me më shumë shitje">
              <ul className="sa-meter">
                {data.venues.filter((v) => v.sales).map((v) => (
                  <li key={v.slug}><a href={`#bizneset/${v.slug}`}><span>{v.name}</span><b>{money(v.sales)}</b></a><i style={{ "--w": `${(v.sales / topVenue) * 100}%` }} /></li>
                ))}
                {!data.venues.some((v) => v.sales) && <li className="sa-empty">Asnjë shitje në këtë periudhë.</li>}
              </ul>
            </Panelbox>
            <Panelbox title="Faturat sipas biznesit">
              <ul className="sa-meter">
                {[...data.venues].filter((v) => v.invoices).sort((a, b) => b.invoices - a.invoices).map((v) => (
                  <li key={v.slug}><a href={`#bizneset/${v.slug}`}><span>{v.name}</span><b>{v.invoices}</b></a><i style={{ "--w": `${(v.invoices / Math.max(...data.venues.map((x) => x.invoices))) * 100}%` }} /></li>
                ))}
                {!data.venues.some((v) => v.invoices) && <li className="sa-empty">Asnjë faturë në këtë periudhë.</li>}
              </ul>
            </Panelbox>
          </div>
        </>
      )}
    </>
  );
}

function LogList({ rows, showVenue }) {
  if (!rows.length) return <p className="sa-empty">Asnjë veprim ende.</p>;
  return (
    <ul className="sa-list">
      {rows.map((l, i) => (
        <li key={i}><div><b>{ACTIONS[l.action] || l.action}{showVenue && l.venue ? <> · <a href={`#bizneset/${l.venue}`}>{l.venue}</a></> : ""}</b>
          <span>{l.admin}{detailText(l.action, l.detail) ? ` · ${detailText(l.action, l.detail)}` : ""}</span></div>
          <div className="sa-list-end"><span>{when(l.at)}</span></div></li>
      ))}
    </ul>
  );
}

function Log() {
  const { data } = useLoad("/log");
  if (!data) return <Loading />;
  return <Panelbox title="Historiku i veprimeve" count={data.log.length}><LogList rows={data.log} showVenue /></Panelbox>;
}
