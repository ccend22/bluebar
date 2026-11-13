import React, { useEffect, useState } from "react";
import { bill, money } from "./domain.js";
import { deleteAccount, deleteExpense, fetchAccounts, fetchExpenses, fetchFinance, moveMoney, saveAccount, saveExpense } from "./api.js";
import { Icon } from "./components.jsx";

// Raportet: the period's money at a glance (Përmbledhje), where it sits (Llogaritë financiare),
// what was sold (Shitjet: the sales reports, passed in) and the spending (Shpenzimet). Totals
// come from the server (server/finance.js); the open orders not yet paid from the room now.
const MONTHS = ["Janar", "Shkurt", "Mars", "Prill", "Maj", "Qershor", "Korrik", "Gusht", "Shtator", "Tetor", "Nëntor", "Dhjetor"];
const day = (d) => d.toLocaleDateString("sv-SE");
const start = (iso) => new Date(`${iso}T00:00`);
const plusDays = (iso, n) => { const d = start(iso); d.setDate(d.getDate() + n); return day(d); };
const today = () => day(new Date());
const firstOf = (y, m) => day(new Date(y, m, 1));
const lastOf = (y, m) => day(new Date(y, m + 1, 0));
const shown = (iso) => iso.split("-").reverse().join(".");
const PRESETS = [
  ["month", "Ky muaj", () => { const n = new Date(); return [firstOf(n.getFullYear(), n.getMonth()), today()]; }],
  ["last", "Muaji i kaluar", () => { const n = new Date(); return [firstOf(n.getFullYear(), n.getMonth() - 1), lastOf(n.getFullYear(), n.getMonth() - 1)]; }],
  ["3", "3 muajt", () => { const n = new Date(); return [firstOf(n.getFullYear(), n.getMonth() - 2), today()]; }],
  ["6", "6 muajt", () => { const n = new Date(); return [firstOf(n.getFullYear(), n.getMonth() - 5), today()]; }],
  ["year", "Viti aktual", () => [`${new Date().getFullYear()}-01-01`, today()]],
  ["all", "Të gjitha", () => ["2020-01-01", today()]],
];
// What the period is called: "Nëntor 2026" for a calendar month, its dates otherwise.
const periodName = ([from, to]) => {
  const a = start(from), b = start(to);
  const wholeMonth = a.getDate() === 1 && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  return wholeMonth ? `${MONTHS[a.getMonth()]} ${a.getFullYear()}` : `${shown(from)} – ${shown(to)}`;
};
const lek = (n) => money(Math.abs(n));
const signed = (n, plus = "") => (n < 0 ? `−${lek(n)}` : `${plus}${lek(n)}`);
const percent = (x) => `${(x * 100).toFixed(1)}%`;
const DOTS = ["#2f80ed", "#7cc142", "#e5484d", "#f5a524", "#6e56cf", "#e93d82", "#12a594", "#f76b15", "#0090ff", "#a18072"];
const CATEGORIES = ["Furnitorë", "Staff", "Qira", "Utilities", "Taksa", "Mirëmbajtje", "Transport", "Marketing", "Të tjera"];

export function Finance({ state, notify, sales }) {
  const [tab, setTab] = useState("overview");
  const [preset, setPreset] = useState("month");
  const [range, setRange] = useState(PRESETS[0][2]);
  const [data, setData] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [from, to] = range;
  useEffect(() => {
    let live = true;
    const a = start(from).toISOString(), b = start(plusDays(to, 1)).toISOString();
    Promise.all([fetchFinance(a, b), fetchExpenses(a, b)])
      .then(([f, e]) => live && (setData(f), setExpenses(e.expenses), setError("")))
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [from, to, version]);
  const reload = () => setVersion((v) => v + 1);
  const choose = (key) => { setPreset(key); setRange(PRESETS.find((p) => p[0] === key)[2]()); };
  // The month arrows: the whole month before or after the one shown.
  const shift = (n) => {
    const a = start(from);
    const y = a.getFullYear(), m = a.getMonth() + n;
    const end = lastOf(y, m);
    setPreset(null);
    setRange([firstOf(y, m), end > today() ? today() : end]);
  };
  // Open orders, not yet paid: counted while the period reaches today.
  const open = to >= today() ? state.tables.reduce((s, t) => s + (t.lines.length ? bill(t).remaining : 0), 0) : 0;
  const name = periodName(range);

  return (
    <div className="fin">
      <header className="fin-head">
        <div>
          {/* The page's h1 is main.jsx's, kept for screen readers; this is the visible title. */}
          <div className="fin-title" aria-hidden="true">Raportet</div>
          <p>Pasqyra financiare: të ardhura, shpenzime dhe fluksi i parasë.</p>
        </div>
        <div className="fin-tabs" role="tablist" aria-label="Raportet">
          {[["overview", "chart", "Përmbledhje"], ["accounts", "card", "Llogaritë financiare"], ["sales", "receipt", "Shitjet"], ["expenses", "cash", "Shpenzimet"]].map(([key, icon, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}><Icon name={icon} size={17} /> {label}</button>
          ))}
        </div>
      </header>
      {(tab === "overview" || tab === "expenses") && (
      <div className="fin-bar">
        <div className="fin-month">
          <button type="button" className="icon-button" aria-label="Muaji më parë" onClick={() => shift(-1)}><Icon name="back" size={18} /></button>
          <strong>{MONTHS[start(from).getMonth()]} {start(from).getFullYear()}</strong>
          <button type="button" className="icon-button" aria-label="Muaji pasardhës" disabled={lastOf(start(from).getFullYear(), start(from).getMonth()) >= today()} onClick={() => shift(1)}><Icon name="arrow" size={18} /></button>
        </div>
        <label className="fin-date">
          <span>Nga</span>
          <input type="date" value={from} max={to} onChange={(e) => e.target.value && (setPreset(null), setRange([e.target.value, to]))} />
        </label>
        <span className="fin-dash" aria-hidden="true" />
        <label className="fin-date">
          <span>Deri</span>
          <input type="date" value={to} min={from} onChange={(e) => e.target.value && (setPreset(null), setRange([from, e.target.value]))} />
        </label>
        <div className="fin-presets" role="group" aria-label="Periudha">
          {PRESETS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={preset === key} onClick={() => choose(key)}>{label}</button>
          ))}
        </div>
      </div>
      )}
      {error && <p className="ai-error" role="alert">{error}</p>}
      {tab === "overview" && <Overview data={data} open={open} name={name} />}
      {tab === "accounts" && <Accounts notify={notify} />}
      {tab === "sales" && sales}
      {tab === "expenses" && <Expenses expenses={expenses} name={name} notify={notify} onChange={reload} defaultDay={to} />}
    </div>
  );
}

function Overview({ data, open, name }) {
  if (!data) return <div className="fin-loading" role="status">Po ngarkohen financat…</div>;
  const cards = [
    ["income", "check", "Të ardhura (paguar)", lek(data.income), `${data.invoices} fatura`],
    ["waiting", "clock", "Të ardhura (pritje)", lek(open), "Porositë e hapura tani"],
    ["spent", "arrow", "Shpenzime (aprovuar)", lek(data.spent), name],
    ["pending", "info", "Shpenzime (pritje)", lek(data.pending), name],
  ];
  return (
    <>
      <div className="fin-section">
        <span className="fin-section-icon"><Icon name="cash" size={18} /></span>
        <h2>Transaksione</h2>
        <span className="fin-chip">{name}</span>
      </div>
      <div className="fin-cards">
        {cards.map(([tone, icon, label, value, note]) => (
          <article key={tone} className={`fin-card ${tone}`}>
            <span className="fin-card-icon"><Icon name={icon} size={20} /></span>
            <h3>{label}</h3>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </div>
      <div className="fin-panels">
        <section className="fin-net" aria-label="Fitimi neto">
          <h3>Fitimi neto (aprovuar)</h3>
          <strong className={data.net < 0 ? "minus" : "plus"}>{signed(data.net)}</strong>
          <p>Nga faturat dhe shpenzimet e aprovuara</p>
          <dl>
            <div><dt>Të ardhura</dt><dd className="plus">{lek(data.income)}</dd></div>
            <div><dt>Shpenzime</dt><dd className="minus">−{lek(data.spent)}</dd></div>
          </dl>
          <div className={`fin-cash ${data.netCash < 0 ? "minus" : "plus"}`}>
            <span>Neto cash</span>
            <b>{signed(data.netCash)}</b>
          </div>
          <dl>
            <div><dt>Pritje (porositë e hapura)</dt><dd className="wait">{lek(open)}</dd></div>
          </dl>
        </section>
        <section aria-labelledby="fin-methods">
          <h3 className="fin-panel-title" id="fin-methods"><Icon name="card" size={18} /> Sipas mënyrës së pagesës</h3>
          <ul className="fin-rows">
            {data.methods.map((m) => (
              <li key={m.method}>
                <span className={`fin-method-icon ${m.method === "Cash" ? "cash" : "bank"}`}><Icon name={m.method === "Cash" ? "cash" : "card"} size={17} /></span>
                <div className="fin-method">
                  <strong>{m.method === "Cash" ? "Cash" : "Kartë / Bankë"}</strong>
                  <span>
                    {m.income > 0 && <em className="plus">+{lek(m.income)}</em>}
                    {m.pending > 0 && <em className="wait">{lek(m.pending)} pritje</em>}
                    {m.spent > 0 && <em className="minus">−{lek(m.spent)}</em>}
                  </span>
                </div>
                <b className={m.net < 0 ? "minus" : ""}>{signed(m.net)}</b>
                <small>{percent(m.share)}</small>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="fin-categories">
          <h3 className="fin-panel-title" id="fin-categories"><Icon name="list" size={18} /> Sipas kategorisë</h3>
          {data.categories.length ? (
            <ul className="fin-rows fin-categories">
              {data.categories.map((c, i) => (
                <li key={c.name}>
                  <i style={{ background: DOTS[i % DOTS.length] }} aria-hidden="true" />
                  <strong>{c.name}</strong>
                  <span className="plus">{c.income ? lek(c.income) : ""}</span>
                  <span className="wait">{c.pending ? `−${lek(c.pending)}` : ""}</span>
                  <span className="minus">{c.spent ? `−${lek(c.spent)}` : ""}</span>
                  <small>{percent(c.share)}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="fin-empty">Asnjë lëvizje parash në këtë periudhë.</p>
          )}
        </section>
      </div>
    </>
  );
}

const blank = (date) => ({ date, amount: "", category: "", method: "Cash", status: "aprovuar", note: "" });

function Expenses({ expenses, name, notify, onChange, defaultDay }) {
  const [draft, setDraft] = useState(() => blank(defaultDay));
  const [busy, setBusy] = useState(false);
  const set = (field) => (e) => setDraft((d) => ({ ...d, [field]: e.target.value }));
  const body = (d) => ({
    spentAt: new Date(`${d.date}T12:00`).toISOString(), amount: Number(d.amount), category: d.category.trim(),
    method: d.method, status: d.status, note: d.note.trim(),
  });
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await saveExpense({ ...(draft.id && { id: draft.id }), ...body(draft) });
      notify(draft.id ? "Shpenzimi u ndryshua." : "Shpenzimi u shtua.");
      setDraft(blank(draft.date));
      onChange();
    } catch (err) {
      notify(err.message, "error");
    }
    setBusy(false);
  };
  const act = async (work, message) => {
    try {
      await work();
      notify(message);
      onChange();
    } catch (err) {
      notify(err.message, "error");
    }
  };
  const total = expenses.reduce((s, x) => s + x.amount, 0);
  const categories = [...new Set([...expenses.map((x) => x.category), ...CATEGORIES])];
  return (
    <div className="fin-expenses">
      <section className="fin-list">
        <div className="fin-section">
          <span className="fin-section-icon spent"><Icon name="receipt" size={18} /></span>
          <h2>Shpenzimet</h2>
          <span className="fin-chip">{name}</span>
          <span className="fin-total">{lek(total)}</span>
        </div>
        {expenses.length ? (
          <ul>
            {expenses.map((x) => (
              <li key={x.id} className={x.status === "pritje" ? "waiting" : ""}>
                <time>{shown(day(new Date(x.spentAt)))}</time>
                <div>
                  <strong>{x.category}</strong>
                  <small>{[x.method === "Cash" ? "Cash" : "Bankë", x.note, x.by].filter(Boolean).join(" · ")}</small>
                </div>
                {x.status === "pritje" ? <span className="badge amber">Në pritje</span> : <span className="badge green">Aprovuar</span>}
                <b>−{lek(x.amount)}</b>
                <div className="fin-actions">
                  {x.status === "pritje" && (
                    <button type="button" onClick={() => act(() => saveExpense({ id: x.id, ...body({ ...x, date: day(new Date(x.spentAt)) }), status: "aprovuar" }), "Shpenzimi u aprovua.")}>Aprovo</button>
                  )}
                  <button type="button" onClick={() => setDraft({ id: x.id, date: day(new Date(x.spentAt)), amount: String(x.amount), category: x.category, method: x.method, status: x.status, note: x.note })}>Ndrysho</button>
                  <button type="button" className="icon-button" aria-label={`Fshi shpenzimin ${x.category}`} onClick={() => confirm(`Të fshihet shpenzimi "${x.category}" (${lek(x.amount)})?`) && act(() => deleteExpense(x.id), "Shpenzimi u fshi.")}>
                    <Icon name="close" size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="fin-empty">Asnjë shpenzim në këtë periudhë. Shtojeni të parin këtu pranë.</p>
        )}
      </section>
      <form className="fin-form" onSubmit={save}>
        <h2>{draft.id ? "Ndrysho shpenzimin" : "Shpenzim i ri"}</h2>
        <div className="fin-form-pair">
          <label className="field"><span>Data</span><input type="date" value={draft.date} onChange={set("date")} required /></label>
          <label className="field"><span>Shuma (Lek)</span><input type="number" inputMode="numeric" min={1} max={100000000} value={draft.amount} onChange={set("amount")} placeholder="p.sh. 12000" required /></label>
        </div>
        <label className="field">
          <span>Kategoria</span>
          <input list="fin-categories" value={draft.category} onChange={set("category")} maxLength={40} placeholder="p.sh. Furnitorë" required />
          <datalist id="fin-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <div className="field">
          <span>Mënyra</span>
          <div className="fin-seg" role="group" aria-label="Mënyra e pagesës">
            {[["Cash", "Cash"], ["Bankë", "Bankë / Kartë"]].map(([v, l]) => <button key={v} type="button" aria-pressed={draft.method === v} onClick={() => setDraft((d) => ({ ...d, method: v }))}>{l}</button>)}
          </div>
        </div>
        <div className="field">
          <span>Gjendja</span>
          <div className="fin-seg" role="group" aria-label="Gjendja">
            {[["aprovuar", "Aprovuar"], ["pritje", "Në pritje"]].map(([v, l]) => <button key={v} type="button" aria-pressed={draft.status === v} onClick={() => setDraft((d) => ({ ...d, status: v }))}>{l}</button>)}
          </div>
        </div>
        <label className="field"><span>Shënim (opsional)</span><input value={draft.note} onChange={set("note")} maxLength={200} placeholder="p.sh. fatura e dritave, tetor" /></label>
        <div className="fin-form-actions">
          {draft.id && <button type="button" onClick={() => setDraft(blank(draft.date))}>Anulo</button>}
          <button className="primary" disabled={busy}><Icon name={draft.id ? "check" : "plus"} size={17} /> {busy ? "Po ruhet…" : draft.id ? "Ruaj ndryshimet" : "Shto shpenzimin"}</button>
        </div>
      </form>
    </div>
  );
}

const KINDS = { cash: ["cash", "Cash"], bank: ["card", "Bankë"], card: ["card", "Kartë / POS"], other: ["list", "Tjetër"] };
const GROUPS = [["own", "Llogaritë e veta", "Arka dhe llogaritë bankare të lokalit"], ["partner", "Partnerë", "Agjenci, platforma dhe partnerë financiarë"]];

// Llogaritë financiare: where the money sits now, account by account, and money moved by hand.
function Accounts({ notify }) {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState({ own: true, partner: true });
  const [form, setForm] = useState(null); // { mode: "account" | "move" | "transfer", ... }
  const [busy, setBusy] = useState(false);
  const load = () => fetchAccounts().then((r) => setList(r.accounts), (e) => notify(e.message, "error"));
  useEffect(() => { load(); }, []);
  if (!list) return <div className="fin-loading" role="status">Po ngarkohen llogaritë…</div>;
  const total = list.reduce((s, a) => s + a.balance, 0);
  const positive = list.reduce((s, a) => s + Math.max(0, a.balance), 0) || 1;
  const run = async (work, message) => {
    setBusy(true);
    try {
      await work();
      notify(message);
      setForm(null);
      await load();
    } catch (e) {
      notify(e.message, "error");
    }
    setBusy(false);
  };
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const submit = (e) => {
    e.preventDefault();
    if (form.mode === "account")
      return run(() => saveAccount({ id: form.id, name: form.name.trim(), group: form.group, kind: form.kind, opening: Number(form.opening || 0), receives: form.receives || null }), form.id ? "Llogaria u ndryshua." : "Llogaria u shtua.");
    const amount = Number(form.amount);
    const move = form.mode === "transfer"
      ? { from: Number(form.from), to: Number(form.to), amount, note: form.note || "" }
      : form.direction === "in" ? { to: Number(form.account), amount, note: form.note || "" } : { from: Number(form.account), amount, note: form.note || "" };
    return run(() => moveMoney(move), form.mode === "transfer" ? "Transferta u regjistrua." : "Lëvizja u regjistrua.");
  };
  const choose = (field) => (
    <select value={form[field] || ""} onChange={set(field)} required>
      <option value="" disabled>Zgjidhni llogarinë</option>
      {list.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  );
  return (
    <div className="acc">
      <section className="acc-head">
        <span className="acc-icon"><Icon name="card" size={22} /></span>
        <div>
          <h2>Portofoli financiar <span className="fin-chip">{list.length} llogari</span></h2>
          <p>Gjendja totale · <b className={total < 0 ? "minus" : ""}>{signed(total)}</b></p>
        </div>
        <div className="acc-actions">
          <button type="button" onClick={() => setForm({ mode: "move", direction: "in", account: list[0]?.id, amount: "", note: "" })}><Icon name="plus" size={16} /> Lëvizje</button>
          <button type="button" onClick={() => setForm({ mode: "transfer", from: list[0]?.id, to: list[1]?.id, amount: "", note: "" })}><Icon name="arrow" size={16} /> Transfertë</button>
          <button type="button" className="primary" onClick={() => setForm({ mode: "account", name: "", group: "own", kind: "bank", opening: "", receives: "" })}><Icon name="plus" size={16} /> Llogari e re</button>
        </div>
      </section>
      {form && (
        <form className="acc-form" onSubmit={submit}>
          <h3>{form.mode === "account" ? (form.id ? `Ndrysho: ${form.name}` : "Llogari e re") : form.mode === "transfer" ? "Transfertë mes llogarive" : "Lëvizje parash"}</h3>
          {form.mode === "account" ? (
            <div className="acc-grid">
              <label className="field"><span>Emri</span><input value={form.name} onChange={set("name")} maxLength={40} placeholder="p.sh. Raiffeisen" required autoFocus /></label>
              <label className="field"><span>Grupi</span><select value={form.group} onChange={set("group")}><option value="own">Llogari e veta</option><option value="partner">Partner</option></select></label>
              <label className="field"><span>Lloji</span><select value={form.kind} onChange={set("kind")}>{Object.entries(KINDS).map(([k, [, l]]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <label className="field"><span>Gjendja fillestare (Lek)</span><input type="number" inputMode="numeric" value={form.opening} onChange={set("opening")} placeholder="0" /></label>
              <label className="field"><span>Merr vetë pagesat</span><select value={form.receives || ""} onChange={set("receives")}><option value="">Asnjë</option><option value="Cash">Cash (shitje dhe shpenzime cash)</option><option value="Bankë">Kartë / Bankë</option></select></label>
            </div>
          ) : form.mode === "transfer" ? (
            <div className="acc-grid">
              <label className="field"><span>Nga</span>{choose("from")}</label>
              <label className="field"><span>Te</span>{choose("to")}</label>
              <label className="field"><span>Shuma (Lek)</span><input type="number" inputMode="numeric" min={1} value={form.amount} onChange={set("amount")} required /></label>
              <label className="field"><span>Shënim</span><input value={form.note} onChange={set("note")} maxLength={200} placeholder="p.sh. derdhje në bankë" /></label>
            </div>
          ) : (
            <div className="acc-grid">
              <div className="field"><span>Drejtimi</span>
                <div className="fin-seg" role="group" aria-label="Drejtimi">
                  {[["in", "Hyrje"], ["out", "Dalje"]].map(([v, l]) => <button key={v} type="button" aria-pressed={form.direction === v} onClick={() => setForm((f) => ({ ...f, direction: v }))}>{l}</button>)}
                </div>
              </div>
              <label className="field"><span>Llogaria</span>{choose("account")}</label>
              <label className="field"><span>Shuma (Lek)</span><input type="number" inputMode="numeric" min={1} value={form.amount} onChange={set("amount")} required /></label>
              <label className="field"><span>Shënim</span><input value={form.note} onChange={set("note")} maxLength={200} placeholder="p.sh. kontribut i pronarit" /></label>
            </div>
          )}
          <div className="fin-form-actions">
            {form.mode === "account" && form.id && (
              <button type="button" className="subtle-button danger" disabled={busy} onClick={() => confirm(`Të fshihet llogaria "${form.name}" dhe lëvizjet e saj?`) && run(() => deleteAccount(form.id), "Llogaria u fshi.")}>Fshi llogarinë</button>
            )}
            <button type="button" onClick={() => setForm(null)}>Anulo</button>
            <button className="primary" disabled={busy}>{busy ? "Po ruhet…" : "Ruaj"}</button>
          </div>
        </form>
      )}
      {GROUPS.map(([group, title, note]) => {
        const items = list.filter((a) => a.group === group);
        if (!items.length) return null;
        const sum = items.reduce((s, a) => s + a.balance, 0);
        return (
          <section key={group} className="acc-group">
            <button type="button" className="acc-group-head" aria-expanded={open[group]} onClick={() => setOpen((o) => ({ ...o, [group]: !o[group] }))}>
              <span className="acc-icon small"><Icon name={group === "own" ? "card" : "people"} size={18} /></span>
              <span className="acc-group-name"><strong>{title} <em>{items.length}</em></strong><small>{note}</small></span>
              <span className="acc-group-sum"><small>Gjendja</small><b className={sum < 0 ? "minus" : ""}>{signed(sum)}</b></span>
              <Icon name="chevronDown" size={18} />
            </button>
            {open[group] && (
              <div className="acc-cards">
                {items.map((a) => (
                  <button key={a.id} type="button" className={`acc-card ${a.kind}`} onClick={() => setForm({ mode: "account", id: a.id, name: a.name, group: a.group, kind: a.kind, opening: String(a.opening), receives: a.receives || "" })}>
                    <span className="acc-card-icon"><Icon name={KINDS[a.kind][0]} size={19} /></span>
                    <h4>{a.name}</h4>
                    <strong className={a.balance < 0 ? "minus" : ""}>{signed(a.balance)}</strong>
                    <small><span>{a.receives ? `Merr pagesat ${a.receives === "Cash" ? "cash" : "me kartë / bankë"}` : "Pjesa e portofolit"}</span><span>{percent(Math.max(0, a.balance) / positive)}</span></small>
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
