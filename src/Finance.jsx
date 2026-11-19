import React, { useEffect, useRef, useState } from "react";
import { bill, money, txCategories, txIcon } from "./domain.js";
import { deleteAccount, deleteExpense, deleteExpenseFile, fetchAccounts, fetchExpenseFile, fetchExpenses, fetchFinance, moveMoney, readExpenses, saveAccount, saveExpense, saveExpenseFile, saveTransactionCategories, fetchCategoryUsage } from "./api.js";
import { shrink } from "./OnlineMenu.jsx";
import { saveDocumentRows, validDocumentDate } from "./documentImport.js";
import { AiDocumentImport } from "./AiDocument.jsx";
import { Icon, SectionHeading } from "./components.jsx";
import { ChoiceField } from "./ChoiceField.jsx";

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

// mode "transactions" is its own page (Transaksione): every expense, money in and sale of a period.
export function Finance({ state, notify, sales, mode = "reports" }) {
  const moves = mode === "transactions";
  const [tab, setTab] = useState(moves ? "expenses" : "overview");
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
          <div className="fin-title" aria-hidden="true">{moves ? "Transaksione" : "Raportet"}</div>
          <p>{moves ? "Shpenzimet, hyrjet dhe shitjet e periudhës, në një listë." : "Pasqyra financiare: të ardhura, shpenzime dhe fluksi i parasë."}</p>
        </div>
        {!moves && (
        <div className="fin-tabs" role="tablist" aria-label="Raportet">
          {[["overview", "chart", "Përmbledhje"], ["accounts", "card", "Llogaritë financiare"], ["sales", "receipt", "Shitjet"]].map(([key, icon, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}><Icon name={icon} size={17} /> {label}</button>
          ))}
        </div>
        )}
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
      {tab === "expenses" && <Expenses lists={{ shpenzim: txCategories(state, "shpenzim"), hyrje: txCategories(state, "hyrje") }} expenses={expenses} sales={state.invoices.filter((i) => { const d = day(new Date(i.date)); return d >= from && d <= to; })} name={name} notify={notify} onChange={reload} defaultDay={to} />}
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

const blank = (date) => ({ date, kind: "shpenzim", amount: "", category: "", method: "Cash", status: "aprovuar", note: "", file: null, attach: null, dropFile: false });
const MAX_FILE = 2.5 * 1024 * 1024;
// A file the manager picked, ready to upload: a photo is made smaller first; a PDF goes as it is.
async function readAttachment(file) {
  if (file.type.startsWith("image/")) return { name: file.name, dataUrl: await shrink(file, { size: 1800 }) };
  if (file.type !== "application/pdf") throw new Error("Bashkëngjitni një foto ose një PDF.");
  if (file.size > MAX_FILE) throw new Error("PDF-ja është më e madhe se 2.5 MB.");
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Skedari nuk u hap."));
    r.readAsDataURL(file);
  });
  return { name: file.name, dataUrl };
}
const openAttachment = async (id, notify) => {
  // Opened before the download finishes, so the browser doesn't treat it as a pop-up.
  const tab = window.open("", "_blank");
  try {
    const url = URL.createObjectURL(await fetchExpenseFile(id));
    if (tab) tab.location.href = url;
    else window.location.assign(url);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    tab?.close();
    notify(err.message, "error");
  }
};

function Expenses({ lists, expenses, sales, name, notify, onChange, defaultDay }) {
  const [draft, setDraft] = useState(() => blank(defaultDay));
  // The form is a dialog: "+ Veprim" opens it empty, "Ndrysho" opens it with the row.
  const dialog = useRef(null);
  const [newCategory, setNewCategory] = useState(false);
  const openForm = (d) => (setDraft(d), setNewCategory(false), dialog.current?.showModal());
  const closeForm = () => dialog.current?.close();
  const [show, setShow] = useState("out"); // expenses first: what a manager opens this page for
  const [busy, setBusy] = useState(false);
  const set = (field) => (e) => setDraft((d) => ({ ...d, [field]: e.target.value }));
  const body = (d) => ({
    spentAt: new Date(`${d.date}T12:00`).toISOString(), kind: d.kind || "shpenzim", amount: Number(d.amount), category: d.category.trim(),
    method: d.method, status: d.status, note: d.note.trim(),
  });
  const save = async (e) => {
    e.preventDefault();
    if (!draft.category.trim()) return notify("Zgjidhni kategorinë.", "error");
    setBusy(true);
    try {
      const { expense } = await saveExpense({ ...(draft.id && { id: draft.id }), ...body(draft) });
      // A category typed in here joins its list, so it's there next time (and in Cilësimet).
      const list = lists[draft.kind], typed = draft.category.trim();
      if (!list.some((c) => c.toLocaleLowerCase("sq") === typed.toLocaleLowerCase("sq")))
        await saveTransactionCategories(draft.kind, [...list, typed]).catch(() => {});
      const id = expense?.id || draft.id;
      // The receipt or invoice, if one was added, changed or taken off.
      if (draft.attach) await saveExpenseFile(id, draft.attach.name, draft.attach.dataUrl);
      else if (draft.dropFile && draft.file) await deleteExpenseFile(id);
      notify(draft.id ? "Veprimi u ndryshua." : "Veprimi u shtua.");
      setDraft(blank(draft.date));
      closeForm();
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
  // One list, newest first: expenses (−), money in (+) and the period's sales (+, read only).
  const rows = [
    ...expenses.map((x) => ({ ...x, at: x.spentAt, type: x.kind === "hyrje" ? "in" : "out" })),
    ...sales.map((i) => ({ sale: i, id: `s${i.id}`, at: i.date, amount: i.total, type: "sale" })),
  ]
    .filter((r) => show === "all" || r.type === show)
    .sort((a, b) => b.at.localeCompare(a.at));
  const total = rows.reduce((s, r) => s + (r.type === "out" ? -r.amount : r.amount), 0);
  // The dialog offers its kind's list; an older row keeps its own category even if it was removed.
  const categories = [...new Set([...lists[draft.kind], ...(draft.category && !newCategory ? [draft.category] : [])])];
  return (
    <div className="fin-expenses">
      <section className="fin-list">
        <div className="fin-section">
          <span className="fin-section-icon spent"><Icon name="receipt" size={18} /></span>
          <h2>Transaksione</h2>
          <span className="fin-chip">{name}</span>
          <span className={`fin-total ${total < 0 ? "minus" : "plus"}`}>{signed(total, "+")}</span>
          <ExpensesAiImport categories={lists.shpenzim} defaultDay={defaultDay} notify={notify} onSaved={onChange} />
          <button type="button" className="primary" onClick={() => openForm(blank(defaultDay))}><Icon name="plus" size={17} /> Veprim</button>
        </div>
        <div className="fin-seg fin-filter" role="group" aria-label="Shfaq">
          {[["all", "Të gjitha"], ["out", "Shpenzime"], ["in", "Hyrje"], ["sale", "Shitje"]].map(([v, l]) => (
            <button key={v} type="button" aria-pressed={show === v} onClick={() => setShow(v)}>{l}</button>
          ))}
        </div>
        {rows.length ? (
          <ul>
            {rows.map((x) => x.sale ? (
              <li key={x.id} className="sale">
                <time>{shown(day(new Date(x.at)))}</time>
                <div>
                  <strong>Shitje · Fatura D-{x.sale.id}</strong>
                  <small>{[x.sale.method === "Përzier" ? "Cash + Kartë" : x.sale.method === "Kartë" ? "Bankë" : "Cash", x.sale.table && `Tavolina ${x.sale.table}`].filter(Boolean).join(" · ")}</small>
                </div>
                <span className="badge blue">Shitje</span>
                <b className="plus">+{lek(x.amount)}</b>
                <div className="fin-actions" />
              </li>
            ) : (
              <li key={x.id} className={x.status === "pritje" ? "waiting" : ""}>
                <time>{shown(day(new Date(x.spentAt)))}</time>
                <div>
                  <strong>{x.category}</strong>
                  <small>{[x.method === "Cash" ? "Cash" : "Bankë", x.note, x.by].filter(Boolean).join(" · ")}</small>
                  {x.file && (
                    <button type="button" className="fin-file" onClick={() => openAttachment(x.id, notify)} title={x.file.name}>
                      <Icon name="paperclip" size={14} /> {x.file.type === "application/pdf" ? "PDF" : "Foto"}
                    </button>
                  )}
                </div>
                {x.status === "pritje" ? <span className="badge amber">Në pritje</span> : <span className="badge green">{x.type === "in" ? "Hyrje" : "Aprovuar"}</span>}
                <b className={x.type === "in" ? "plus" : undefined}>{x.type === "in" ? "+" : "−"}{lek(x.amount)}</b>
                <div className="fin-actions">
                  {x.status === "pritje" && (
                    <button type="button" onClick={() => act(() => saveExpense({ id: x.id, ...body({ ...x, date: day(new Date(x.spentAt)) }), status: "aprovuar" }), "Shpenzimi u aprovua.")}>Aprovo</button>
                  )}
                  <button type="button" onClick={() => openForm({ ...blank(day(new Date(x.spentAt))), id: x.id, kind: x.kind || "shpenzim", amount: String(x.amount), category: x.category, method: x.method, status: x.status, note: x.note, file: x.file })}>Ndrysho</button>
                  <button type="button" className="icon-button" aria-label={`Fshi shpenzimin ${x.category}`} onClick={() => confirm(`Të fshihet shpenzimi "${x.category}" (${lek(x.amount)})?`) && act(() => deleteExpense(x.id), "Shpenzimi u fshi.")}>
                    <Icon name="close" size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="fin-empty">Asnjë veprim në këtë periudhë. Shtoni të parin me "+ Veprim".</p>
        )}
      </section>
      <dialog ref={dialog} className="tx-dialog" aria-labelledby="tx-title" onClose={() => setDraft(blank(defaultDay))}>
        <form className="tx" onSubmit={save}>
          <header className="tx-head">
            <span className={`tx-mark ${draft.kind === "hyrje" ? "in" : "out"}`} aria-hidden="true"><Icon name="diagonal" size={18} /></span>
            <div>
              <h2 id="tx-title">{draft.id ? "Ndrysho transaksionin" : "Transaksion i ri"}</h2>
              <p>{draft.kind === "hyrje" ? "Regjistro një hyrje parash" : "Regjistro një shpenzim"}</p>
            </div>
            <div className="fin-seg tx-kind" role="group" aria-label="Lloji">
              {[["hyrje", "Hyrje"], ["shpenzim", "Shpenzim"]].map(([v, l]) => <button key={v} type="button" aria-pressed={draft.kind === v} onClick={() => (setNewCategory(false), setDraft((d) => ({ ...d, kind: v, category: lists[v].includes(d.category) ? d.category : "" })))}>{l}</button>)}
            </div>
            <button type="button" className="icon-button" aria-label="Mbyll" onClick={closeForm}><Icon name="close" size={18} /></button>
          </header>
          <div className="tx-body">
            <aside className="tx-side">
              <label className="field"><span>Data</span><input type="date" value={draft.date} onChange={set("date")} required /></label>
              <ChoiceField
                label="Gjendja"
                value={draft.status}
                options={[{ value: "aprovuar", label: "Aprovuar" }, { value: "pritje", label: "Në pritje" }]}
                onChange={(v) => setDraft((d) => ({ ...d, status: v }))}
              />
              {newCategory ? (
                <label className="field">
                  <span>Kategoria e re</span>
                  <input value={draft.category} onChange={set("category")} maxLength={40} placeholder={draft.kind === "hyrje" ? "p.sh. Evente" : "p.sh. Furnitorë"} autoFocus required />
                  <button type="button" className="text-button tx-back" onClick={() => (setNewCategory(false), setDraft((d) => ({ ...d, category: "" })))}>Zgjidh nga lista</button>
                </label>
              ) : (
                <ChoiceField
                  label="Kategoria"
                  value={draft.category}
                  options={[...categories.map((c) => ({ value: c, label: c })), { value: "\u0000new", label: "+ Kategori e re…" }]}
                  onChange={(v) => (v === "\u0000new" ? (setNewCategory(true), setDraft((d) => ({ ...d, category: "" }))) : setDraft((d) => ({ ...d, category: v })))}
                />
              )}
              <ChoiceField
                label="Mënyra"
                value={draft.method}
                options={[{ value: "Cash", label: "Cash" }, { value: "Bankë", label: "Bankë / Kartë" }]}
                onChange={(v) => setDraft((d) => ({ ...d, method: v }))}
              />
            </aside>
            <div className="tx-main">
              <label className="field tx-amount">
                <span>Shuma (Lek)</span>
                <input type="number" inputMode="numeric" min={1} max={100000000} value={draft.amount} onChange={set("amount")} placeholder="0" required />
              </label>
              <label className="field">
                <span>Shënim</span>
                <textarea rows={3} value={draft.note} onChange={set("note")} maxLength={200} placeholder={draft.kind === "hyrje" ? "p.sh. pagesë për eventin e së shtunës" : "p.sh. fatura e dritave, tetor"} />
              </label>
              <div className="field">
                <span>Fatura / dokument</span>
                {draft.attach || (draft.file && !draft.dropFile) ? (
                  <div className="fin-attach">
                    <Icon name="paperclip" size={16} />
                    <span>{draft.attach?.name || draft.file.name}</span>
                    <button type="button" className="text-button" onClick={() => setDraft((d) => ({ ...d, attach: null, dropFile: true }))}>Hiqe</button>
                  </div>
                ) : (
                  <label className="fin-attach-pick">
                    <Icon name="upload" size={18} />
                    <span>Ngarko foto ose PDF (deri 2.5 MB)</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="sr-only"
                      onChange={async (e) => {
                        const file = e.target.files[0];
                        e.target.value = "";
                        if (!file) return;
                        try {
                          const attach = await readAttachment(file);
                          setDraft((d) => ({ ...d, attach, dropFile: false }));
                        } catch (err) {
                          notify(err.message, "error");
                        }
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>
          <footer className="tx-foot">
            <button type="button" className="text-button" onClick={closeForm}>Anulo</button>
            <button className="primary" disabled={busy}><Icon name="check" size={17} /> {busy ? "Po ruhet…" : draft.id ? "Ruaj ndryshimet" : "Ruaj transaksionin"}</button>
          </footer>
        </form>
      </dialog>
    </div>
  );
}

// Cilësimet → Transaksione: the categories offered in the Transaksion dialog, as tiles with
// an icon each. A tile opens a small editor (name, icon, remove); the dashed tile adds one.
// Renaming moves past transactions too; removing leaves them be.
const ICON_CHOICES = {
  truck: "Kamion", people: "Njerëz", home: "Shtëpi", bolt: "Rrymë", receipt: "Faturë", wrench: "Riparim",
  location: "Vendndodhje", megaphone: "Reklamë", stock: "Kuti", coffee: "Kafe", card: "Kartë", cash: "Para",
  calendar: "Kalendar", music: "Muzikë", star: "Yll", gift: "Dhuratë", print: "Printer", tag: "Etiketë",
};
export function TransactionCategories({ state, notify, onSaved }) {
  const [kind, setKind] = useState("shpenzim");
  const [usage, setUsage] = useState([]);
  const [version, setVersion] = useState(0);
  const [editor, setEditor] = useState(null); // { from: name | null, name, icon }
  const [busy, setBusy] = useState(false);
  const dialog = useRef(null);
  useEffect(() => {
    fetchCategoryUsage().then((r) => setUsage(r.usage)).catch(() => {});
  }, [version]);
  const lists = { shpenzim: txCategories(state, "shpenzim"), hyrje: txCategories(state, "hyrje") };
  const list = lists[kind];
  const iconOf = (name) => txIcon(state, kind, name);
  const used = (c) => usage.find((u) => u.kind === kind && u.category === c);
  const top = Math.max(1, ...list.map((c) => used(c)?.total || 0));
  const sign = kind === "hyrje" ? "+" : "−";
  const open = (from) => {
    setEditor({ from, name: from || "", icon: from ? iconOf(from) : "tag" });
    requestAnimationFrame(() => dialog.current?.showModal());
  };
  const close = () => dialog.current?.close();
  const icons = (names, renamed) => Object.fromEntries(names.map((n) => [n, n === renamed?.to ? renamed.icon : iconOf(n === renamed?.to ? renamed.from : n)]));
  const save = async (next, message, rename, iconsMap) => {
    setBusy(true);
    try {
      await saveTransactionCategories(kind, next, rename, iconsMap);
      await onSaved?.();
      setVersion((v) => v + 1);
      notify(message);
      return true;
    } catch (err) {
      notify(err.message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const exists = (name, except) => list.some((c) => c !== except && c.toLocaleLowerCase("sq") === name.toLocaleLowerCase("sq"));
  const submit = async (e) => {
    e.preventDefault();
    const name = editor.name.trim();
    if (!name) return;
    if (exists(name, editor.from)) return notify(`"${name}" është tashmë në listë.`, "error");
    const next = editor.from ? list.map((x) => (x === editor.from ? name : x)) : [...list, name];
    const rename = editor.from && editor.from !== name ? { from: editor.from, to: name } : undefined;
    const message = !editor.from ? `"${name}" u shtua.` : rename ? `"${editor.from}" u bë "${name}"${used(editor.from) ? ", edhe te veprimet e vjetra" : ""}.` : `"${name}" u ruajt.`;
    if (await save(next, message, rename, icons(next, { from: editor.from || name, to: name, icon: editor.icon }))) close();
  };
  const remove = async () => {
    const next = list.filter((x) => x !== editor.from);
    if (await save(next, `"${editor.from}" u hoq. Veprimet e vjetra e mbajnë emrin.`, undefined, icons(next))) close();
  };
  const u = editor?.from && used(editor.from);
  return (
    <div className="settings-column settings-wide">
      <section className="panel tx-cats">
        <header className="tx-cats-head">
          <div>
            <h2>Kategoritë e transaksioneve</h2>
            <p>Ato që zgjidhni te "+ Veprim". Klikoni një kategori për ta ndryshuar.</p>
          </div>
          <div className="fin-seg tx-cats-kind" role="tablist" aria-label="Lloji">
            {[["shpenzim", "Shpenzime"], ["hyrje", "Hyrje"]].map(([v, l]) => (
              <button key={v} type="button" role="tab" aria-selected={kind === v} aria-pressed={kind === v} onClick={() => setKind(v)}>
                {l} <span>{lists[v].length}</span>
              </button>
            ))}
          </div>
        </header>
        <ul className={`tx-tiles ${kind}`}>
          {list.map((c) => {
            const x = used(c);
            return (
              <li key={c}>
                <button type="button" className="tx-tile" onClick={() => open(c)} aria-label={`${c}: ndrysho`}>
                  <span className="tx-tile-icon" aria-hidden="true"><Icon name={iconOf(c)} size={22} /></span>
                  <span className="tx-tile-name">{c}</span>
                  {x ? (
                    <>
                      <b className="tx-tile-total">{sign}{lek(x.total)}</b>
                      <span className="tx-tile-count">{x.count} {x.count === 1 ? "veprim" : "veprime"}</span>
                      <span className="tx-tile-share" aria-hidden="true"><i style={{ width: `${Math.max(4, (x.total / top) * 100)}%` }} /></span>
                    </>
                  ) : (
                    <span className="tx-tile-count idle">Ende pa veprime</span>
                  )}
                </button>
              </li>
            );
          })}
          <li>
            <button type="button" className="tx-tile add" onClick={() => open(null)}>
              <span className="tx-tile-icon" aria-hidden="true"><Icon name="plus" size={22} /></span>
              <span className="tx-tile-name">Shto kategori</span>
              <span className="tx-tile-count idle">{kind === "hyrje" ? "p.sh. Evente" : "p.sh. Pastrimi"}</span>
            </button>
          </li>
        </ul>
        <p className="helper tx-cats-note">Riemërtimi ndryshon edhe veprimet e vjetra. Heqja i lë ashtu siç janë.</p>
      </section>
      <dialog ref={dialog} className="tx-cat-dialog" aria-labelledby="tx-cat-title" onClose={() => setEditor(null)}>
        {editor && (
          <form onSubmit={submit}>
            <header>
              <span className={`tx-tile-icon ${kind}`} aria-hidden="true"><Icon name={editor.icon} size={22} /></span>
              <div>
                <h2 id="tx-cat-title">{editor.from ? "Ndrysho kategorinë" : "Kategori e re"}</h2>
                <p>{kind === "hyrje" ? "Hyrje" : "Shpenzim"}{u ? ` · ${u.count} ${u.count === 1 ? "veprim" : "veprime"}, ${sign}${lek(u.total)}` : ""}</p>
              </div>
              <button type="button" className="icon-button" aria-label="Mbyll" onClick={close}><Icon name="close" size={18} /></button>
            </header>
            <label className="field">
              <span>Emri</span>
              <input value={editor.name} maxLength={40} autoFocus placeholder={kind === "hyrje" ? "p.sh. Evente" : "p.sh. Pastrimi"} onChange={(e) => setEditor((d) => ({ ...d, name: e.target.value }))} required />
            </label>
            {u && editor.name.trim() && editor.name.trim() !== editor.from && <p className="tx-cat-warn">{u.count} {u.count === 1 ? "veprim merr" : "veprime marrin"} emrin e ri.</p>}
            <div className="field">
              <span>Ikona</span>
              <div className="tx-icon-grid" role="radiogroup" aria-label="Ikona">
                {Object.entries(ICON_CHOICES).map(([n, label]) => (
                  <button key={n} type="button" role="radio" aria-checked={editor.icon === n} aria-label={label} title={label} onClick={() => setEditor((d) => ({ ...d, icon: n }))}>
                    <Icon name={n} size={20} />
                  </button>
                ))}
              </div>
            </div>
            <footer>
              {editor.from && (
                <button type="button" className="text-button tx-cat-remove" disabled={busy || list.length === 1} title={list.length === 1 ? "Duhet të paktën një kategori" : undefined} onClick={remove}>
                  <Icon name="trash" size={16} /> Hiqe
                </button>
              )}
              <button type="button" onClick={close}>Anulo</button>
              <button className="primary" disabled={busy || !editor.name.trim()}>{editor.from ? "Ruaj" : "Shto"}</button>
            </footer>
          </form>
        )}
      </dialog>
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

// Shpenzimet → "Importo me AI": receipts, bills or a bank statement read into expenses, each
// checked (date, amount, category, how it was paid, approved or pending) before it is saved.
function ExpensesAiImport({ categories, defaultDay, notify, onSaved }) {
  const valid = (r) => validDocumentDate(r.date) && /^\d+$/.test(String(r.amount)) && Number(r.amount) >= 1 && Number(r.amount) <= 100000000 && r.category.trim();
  return (
    <AiDocumentImport
      title="Shpenzime me AI"
      intro="Kupona, fatura (drita, uji, furnitorët) ose një ekstrakt bankar: AI i kthen në shpenzime."
      notePlaceholder="p.sh. të gjitha u paguan me bankë"
      read={async (input, note) =>
        (await readExpenses(input, note)).expenses.map((x) => ({
          key: crypto.randomUUID(), date: x.date || defaultDay, amount: String(x.amount), category: x.category, method: x.method || "Cash", status: "aprovuar", note: x.note,
        }))}
      ready={(rows) => rows.length > 0 && rows.every(valid)}
      save={async (rows, { onSavedRow }) => {
        let n = 0;
        try {
          await saveDocumentRows(rows, (r) => saveExpense({ spentAt: new Date(`${r.date}T12:00`).toISOString(), amount: Number(r.amount), category: r.category.trim(), method: r.method, status: r.status, note: r.note.trim() }), (r) => {
            n++;
            onSavedRow(r);
          });
          notify(`U shtuan ${n} shpenzime.`);
          return n;
        } catch (e) {
          throw new Error(`${n ? `U ruajtën ${n} shpenzime. Kanë mbetur vetëm rreshtat e paruajtur. ` : ""}${e.message}`);
        } finally {
          if (n) onSaved();
        }
      }}
      saved={(n) => (n === 1 ? "U shtua 1 shpenzim" : `U shtuan ${n} shpenzime`)}
      review={({ rows, setRows, busy }) => {
        const set = (key, field, value) => setRows((list) => list.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
        return (
          <div className="ai-rows">
            <datalist id="ai-expense-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            <div className="ai-row ai-row-expense ai-row-head" aria-hidden="true"><span>Data</span><span>Shuma (Lek)</span><span>Kategoria</span><span>Mënyra</span><span>Gjendja</span><span>Shënim</span><span /></div>
            {rows.map((r, i) => (
              <div key={r.key} className={`ai-row ai-row-expense ${valid(r) ? "" : "has-issue"}`}>
                <input type="date" aria-label={`Data, rreshti ${i + 1}`} value={r.date} disabled={busy} onChange={(e) => set(r.key, "date", e.target.value)} />
                <input inputMode="numeric" aria-label={`Shuma, rreshti ${i + 1}`} value={r.amount} disabled={busy} onChange={(e) => set(r.key, "amount", e.target.value)} />
                <input list="ai-expense-categories" aria-label={`Kategoria, rreshti ${i + 1}`} value={r.category} maxLength={40} disabled={busy} onChange={(e) => set(r.key, "category", e.target.value)} />
                <select aria-label={`Mënyra, rreshti ${i + 1}`} value={r.method} disabled={busy} onChange={(e) => set(r.key, "method", e.target.value)}>
                  <option value="Cash">Cash</option>
                  <option value="Bankë">Bankë / Kartë</option>
                </select>
                <select aria-label={`Gjendja, rreshti ${i + 1}`} value={r.status} disabled={busy} onChange={(e) => set(r.key, "status", e.target.value)}>
                  <option value="aprovuar">Aprovuar</option>
                  <option value="pritje">Në pritje</option>
                </select>
                <input aria-label={`Shënim, rreshti ${i + 1}`} value={r.note} maxLength={200} disabled={busy} onChange={(e) => set(r.key, "note", e.target.value)} />
                <button type="button" className="icon-button" aria-label={`Hiq rreshtin ${i + 1}`} disabled={busy} onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}
          </div>
        );
      }}
    />
  );
}
