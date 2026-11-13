import React, { useEffect, useMemo, useRef, useState } from "react";
import { plural } from "./domain.js";
import { Icon } from "./components.jsx";
import { blank, parseList, productRowProblem, validDeliveryQuantity } from "./parseList.js";
import { readDelivery, readMenuPhoto } from "./api.js";
import { deliveryItems, validDeliveryRows } from "./documentImport.js";
import { AiDocumentImport } from "./AiDocument.jsx";
import { shrink } from "./OnlineMenu.jsx";

// Produktet → product form: is this product counted in units, and how many are there now?
export function StockFields({ product }) {
  const [tracked, setTracked] = useState(product.id ? product.trackStock !== false : false);
  return (
    <fieldset className="stock-fields">
      <label className="check-row">
        <input type="checkbox" name="trackStock" checked={tracked} onChange={(e) => setTracked(e.target.checked)} />
        Ndiq stokun
      </label>
      <p className="helper">
        {tracked
          ? "Numërohet me copë (shishe, kanaçe, paketa): zbritet në çdo shitje dhe paralajmëron kur mbaron."
          : "Pa numërim (kafe, koktej, pjata të gatuara): stoku nuk e bllokon shitjen. Mund ta hiqni përkohësisht nga menuja."}
      </p>
      {tracked && !product.id && (
        <label className="field">
          <span>Sa copë keni tani</span>
          <input name="initialStock" type="number" min="0" max="100000" step="1" inputMode="numeric" placeholder="0" />
        </label>
      )}
    </fieldset>
  );
}

const COLUMNS = ["name", "price", "category", "department", "stock"];
const LABELS = { name: "Emri", price: "Çmimi (Lek)", category: "Kategoria", department: "Reparti", stock: "Stoku" };

// The editable rows "Shto shumë" and "Importo me AI" both end in, with what's wrong with each.
function useImportRows(state, initial) {
  const [rows, setRows] = useState(initial);
  const existing = useMemo(() => new Set(state.products.map((p) => p.name.toLocaleLowerCase())), [state.products]);
  const filled = rows.filter((r) => r.name.trim());
  const problem = (r) => {
    const invalid = productRowProblem(r);
    if (invalid) return invalid;
    if (!r.name.trim()) return "";
    if (existing.has(r.name.trim().toLocaleLowerCase())) return "Ekziston tashmë";
    if (filled.filter((x) => x.name.trim().toLocaleLowerCase() === r.name.trim().toLocaleLowerCase()).length > 1) return "Dy herë";
    return "";
  };
  const problems = rows.filter(problem).length;
  // Rows read elsewhere (a pasted list, a menu photo) join the table, dropping its empty rows.
  const add = (parsed) =>
    setRows((list) => [...list.filter((r) => r.name.trim() || r.price !== "" || r.stock !== ""), ...parsed, blank(parsed.at(-1)?.category || "")]);
  const newRow = () => setRows((list) => [...list, blank(list.at(-1)?.category || "", list.at(-1)?.department || "")]);
  const ready = filled.length > 0 && filled.length <= 200 && !problems;
  const products = () => filled.map((r) => ({
    name: r.name.trim(), price: Number(r.price), category: r.category.trim(),
    ...(r.department.trim() ? { department: r.department.trim() } : {}),
    ...(r.stock !== "" ? { stock: Number(r.stock) } : {}),
  }));
  const status = filled.length > 200 ? "Ruani deri në 200 produkte njëherësh" : problems ? `${problems} rreshta për t'u rregulluar` : `${filled.length} produkte gati`;
  return { rows, setRows, filled, problem, add, newRow, ready, products, status };
}

function ImportTable({ state, rows: { rows, setRows, problem }, disabled }) {
  const table = useRef(null);
  const set = (key, field, value) => setRows((list) => list.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  // Enter goes down the column; past the last row a new row opens, keeping its category.
  const next = (index, field) => (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const focus = () => table.current?.querySelector(`[data-cell="${index + 1}-${field}"]`)?.focus();
    if (index === rows.length - 1) {
      setRows((list) => [...list, blank(list.at(-1).category, list.at(-1).department)]);
      requestAnimationFrame(focus);
    } else focus();
  };
  return (
    <>
      <datalist id="import-categories">{state.categories.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="import-departments">{state.departments.map((d) => <option key={d} value={d} />)}</datalist>
      <div className="import-table" ref={table} role="table" aria-label="Produktet e reja">
        <div className="import-row import-header" role="row">
          <span role="columnheader">Emri</span>
          <span role="columnheader">Çmimi (Lek)</span>
          <span role="columnheader">Kategoria</span>
          <span role="columnheader">Reparti</span>
          <span role="columnheader">Stoku</span>
          <span />
        </div>
        {rows.map((r, i) => {
          const issue = problem(r);
          return (
            <div className={`import-row ${issue ? "has-issue" : ""}`} role="row" key={r.key}>
              {COLUMNS.map((field) => (
                <label key={field} className={`import-cell import-cell-${field}`} role="cell">
                <span className="import-cell-label">{LABELS[field]}</span>
                <input
                  disabled={disabled}
                  aria-invalid={Boolean(issue)}
                  data-cell={`${i}-${field}`}
                  aria-label={`${{ name: "Emri", price: "Çmimi", category: "Kategoria", department: "Reparti", stock: "Stoku" }[field]}, rreshti ${i + 1}`}
                  value={r[field]}
                  onChange={(e) => set(r.key, field, e.target.value)}
                  onKeyDown={next(i, field)}
                  inputMode={field === "price" || field === "stock" ? "numeric" : undefined}
                  list={field === "category" ? "import-categories" : field === "department" ? "import-departments" : undefined}
                  placeholder={{ name: "p.sh. Espresso", price: "100", category: "Kafe", department: "Bar", stock: "pa numërim" }[field]}
                  maxLength={field === "name" ? 80 : 40}
                />
                </label>
              ))}
              <button type="button" className="icon-button" aria-label={`Hiq rreshtin ${i + 1}`} onClick={() => setRows((list) => (list.length > 1 ? list.filter((x) => x.key !== r.key) : [blank(r.category)]))}>
                <Icon name="close" size={16} />
              </button>
              {issue && <small className="import-issue">{issue}</small>}
            </div>
          );
        })}
      </div>
    </>
  );
}

// Produktet → "Shto shumë": a quick table, one product per row, saved in one go.
export function ProductImport({ state, update, onClose }) {
  const rows = useImportRows(state, [blank(state.categories[0] || ""), blank(state.categories[0] || "")]);
  const [paste, setPaste] = useState(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving || !rows.ready) return;
    setSaving(true);
    const products = rows.products();
    const ok = await update("products.import", { products }, `U shtua${products.length === 1 ? "" : "n"} ${plural(products.length, "produkt", "produkte")}.`);
    setSaving(false);
    if (ok) onClose();
  };
  return (
    <section className="panel product-import">
      <div className="import-head">
        <div>
          <h2>Shto shumë produkte</h2>
          <p className="helper">
            Një produkt për rresht. Kategoritë dhe repartet e reja krijohen vetë. Stoku: bosh = pa numërim (kafe, koktej),
            numër = numërohet duke nisur nga aq copë.
          </p>
        </div>
        <div className="actions">
          <button type="button" onClick={() => setPaste(paste === null ? "" : null)}>
            <Icon name="list" size={17} /> Ngjit një listë
          </button>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Mbyll">
            <Icon name="close" size={18} />
          </button>
        </div>
      </div>
      {paste !== null && (
        <div className="import-paste">
          <textarea
            aria-label="Lista e produkteve"
            rows={6}
            autoFocus
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={"Kafe:\nEspresso 100\nMacchiato 120\nPije:\nCoca-Cola 150\n\nOse ngjitni rreshta nga Excel (Emri, Çmimi, Kategoria, Reparti, Stoku)."}
          />
          <div className="actions">
            <button type="button" onClick={() => setPaste(null)}>Anulo</button>
            <button
              type="button"
              className="primary"
              disabled={!paste.trim()}
              onClick={() => {
                rows.add(parseList(paste, rows.rows.at(-1)?.category || state.categories[0] || ""));
                setPaste(null);
              }}
            >
              Shto në tabelë
            </button>
          </div>
        </div>
      )}
      <ImportTable state={state} rows={rows} disabled={saving} />
      <div className="import-foot">
        <button type="button" onClick={rows.newRow}>
          <Icon name="plus" size={16} /> Rresht i ri
        </button>
        <span className="helper">{rows.status}</span>
        <button type="button" className="primary" disabled={!rows.ready || saving} onClick={save}>
          {saving ? "Po ruhen…" : (rows.filled.length ? `Ruaj ${plural(rows.filled.length, "produkt", "produkte")}` : "Ruaj produktet")}
        </button>
      </div>
    </section>
  );
}

const STEPS = ["Ngarko", "Konfiguro", "Shiko", "Sukses"];

// Produktet → "Importo me AI": a photo of the menu (or its text) → AI reads the products and
// prices → the manager checks them in the import table → saved in one go.
export function AiImport({ state, update }) {
  const dialog = useRef(null);
  const [step, setStep] = useState(0);
  const [source, setSource] = useState(null); // { file, url } or { text }
  const [department, setDepartment] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [saved, setSaved] = useState(0);
  const [skipped, setSkipped] = useState([]);
  const rows = useImportRows(state, []);
  useEffect(() => () => source?.url && URL.revokeObjectURL(source.url), [source]);

  const choose = (file) => {
    if (!file?.type.startsWith("image/")) return setError("Zgjidhni një foto (JPG, PNG, WebP…).");
    setError("");
    setSource({ file, url: URL.createObjectURL(file) });
  };
  const chooseText = (text) => {
    if (!text.trim()) return setError("Clipboard është bosh. Kopjoni një foto ose tekstin e menusë.");
    setError("");
    setSource({ text: text.slice(0, 20000) });
  };
  const fromClipboard = async () => {
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) return choose(new File([await item.getType(type)], "menu", { type }));
      }
      chooseText(await navigator.clipboard.readText());
    } catch {
      setError("Shfletuesi nuk e lejoi leximin e clipboard. Shtypni Ctrl+V (⌘V) këtu.");
    }
  };
  const open = () => {
    if (step === 3) (setStep(0), setSource(null), setNote(""), rows.setRows([]));
    setError("");
    dialog.current?.showModal();
  };
  const read = async () => {
    setBusy(true);
    setError("");
    try {
      // Larger than a product photo: the menu's small print has to stay readable.
      const input = source.file ? { image: await shrink(source.file, { size: 2000 }) } : { text: source.text };
      const { products } = await readMenuPhoto({ ...input, ...(note.trim() && { note: note.trim() }) });
      // What's already on the till stays as it is; "KAFE" on the menu is the "Kafe" already here,
      // and a new all-caps heading reads better as "Pije".
      const have = new Set(state.products.map((p) => p.name.toLocaleLowerCase()));
      const categories = new Map(state.categories.map((c) => [c.toLocaleLowerCase(), c]));
      const category = (c) => categories.get(c.toLocaleLowerCase()) || (c === c.toLocaleUpperCase() ? c.charAt(0) + c.slice(1).toLocaleLowerCase() : c);
      const fresh = products.filter((p) => !have.has(p.name.toLocaleLowerCase()));
      setSkipped(products.filter((p) => have.has(p.name.toLocaleLowerCase())).map((p) => p.name));
      if (!products.length) setError("AI nuk gjeti asnjë produkt me çmim. Provoni një foto më të qartë.");
      else if (!fresh.length) setError("Të gjitha produktet e kësaj menuje ekzistojnë tashmë.");
      else {
        rows.setRows([]);
        rows.add(fresh.map((p) => ({ ...blank(category(p.category) || state.categories[0] || "", department), name: p.name, price: String(p.price) })));
        setStep(2);
      }
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };
  const save = async () => {
    setBusy(true);
    const products = rows.products();
    const ok = await update("products.import", { products }, `U shtua${products.length === 1 ? "" : "n"} ${plural(products.length, "produkt", "produkte")}.`);
    setBusy(false);
    if (ok) (setSaved(products.length), setStep(3));
  };
  const forward = [() => setStep(1), read, save][step];
  const canForward = step === 0 ? Boolean(source) : step === 1 ? !busy : step === 2 ? rows.ready && !busy : false;

  const preview = source && (
    <div className="ai-preview">
      {source.url ? <img src={source.url} alt="Fotoja e menusë" /> : <pre>{source.text.slice(0, 600)}</pre>}
      {step === 0 && <button type="button" onClick={() => setSource(null)}>Ndrysho</button>}
    </div>
  );

  return (
    <>
      <button type="button" onClick={open}>
        <Icon name="sparkle" size={18} />
        Importo me AI
      </button>
      <dialog
        ref={dialog}
        className="ai-dialog"
        aria-labelledby="ai-title"
        onCancel={(e) => busy && e.preventDefault()}
        onPaste={(e) => {
          if (step !== 0 || e.target.closest("input, textarea")) return;
          const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
          file ? choose(file) : chooseText(e.clipboardData.getData("text"));
        }}
      >
        <header className="ai-head">
          <h2 id="ai-title"><Icon name="sparkle" size={22} /> Importo me AI</h2>
          <button type="button" className="icon-button" aria-label="Mbyll" disabled={busy} onClick={() => dialog.current?.close()}>
            <Icon name="close" size={18} />
          </button>
        </header>
        <ol className="ai-steps">
          {STEPS.map((name, i) => (
            <li key={name} className={i <= step ? "reached" : ""} aria-current={i === step ? "step" : undefined}>
              <span className="ai-step-number">{i < step ? <Icon name="check" size={14} /> : i + 1}</span>
              <span className="ai-step-bar" />
              {name}
            </li>
          ))}
        </ol>
        <div className="ai-body">
          {step === 0 && (
            <>
              <div className="ai-intro">
                <h3>Ngarkoni ose bëni foto të menusë</h3>
                <p>AI lexon produktet dhe çmimet. I shihni të gjitha para se të ruhen.</p>
              </div>
              {preview || (
                <div className="ai-sources">
                  <button type="button" className="ai-source" onClick={fromClipboard}>
                    <Icon name="clipboard" size={30} />
                    <strong>Ngjit foto ose tekst</strong>
                    <span>Klikoni për të marrë foton ose tekstin nga clipboard</span>
                  </button>
                  <label
                    className={`ai-source ai-source-drop ${dragging ? "dragging" : ""}`}
                    onDragOver={(e) => (e.preventDefault(), setDragging(true))}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => (e.preventDefault(), setDragging(false), choose(e.dataTransfer.files[0]))}
                  >
                    <Icon name="upload" size={30} />
                    <strong>Ngarko foto / Drag &amp; Drop</strong>
                    <span>Zgjidhni foton nga pajisja ose bëni një të re<br />Tërhiqeni dhe lëshojeni foton këtu</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        e.target.value = "";
                        if (file) choose(file);
                      }}
                    />
                  </label>
                </div>
              )}
            </>
          )}
          {step === 1 && (
            <div className="ai-config">
              {preview}
              <div className="ai-fields">
                <label className="field">
                  <span>Reparti për të gjitha</span>
                  <select value={department} onChange={(e) => setDepartment(e.target.value)} disabled={busy}>
                    <option value="">Pa repart (e zgjidhni më vonë)</option>
                    {state.departments.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Udhëzim për AI (opsionale)</span>
                  <textarea
                    rows={3}
                    maxLength={300}
                    value={note}
                    disabled={busy}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="p.sh. vetëm pijet; çmimet janë në euro"
                  />
                </label>
                {busy && <p className="ai-reading" role="status"><span className="ai-spinner" /> AI po lexon menunë… zakonisht 10–30 sekonda.</p>}
              </div>
            </div>
          )}
          {step === 2 && (
            <>
              <div className="ai-intro">
                <h3>Kontrolloni produktet</h3>
                <p>Ndryshoni çfarë nuk është e saktë. Kategoritë dhe repartet e reja krijohen vetë; stoku bosh = pa numërim.</p>
              </div>
              {skipped.length > 0 && (
                <p className="ai-note">
                  {plural(skipped.length, "produkt ekziston", "produkte ekzistojnë")} tashmë dhe {skipped.length === 1 ? "u la" : "u lanë"} jashtë: {skipped.join(", ")}.
                </p>
              )}
              <ImportTable state={state} rows={rows} disabled={busy} />
              <div className="ai-table-foot">
                <button type="button" onClick={rows.newRow} disabled={busy}><Icon name="plus" size={16} /> Rresht i ri</button>
                <span className="helper">{rows.status}</span>
              </div>
            </>
          )}
          {step === 3 && (
            <div className="ai-done">
              <span className="ai-done-icon"><Icon name="check" size={30} /></span>
              <h3>U shtua{saved === 1 ? "" : "n"} {plural(saved, "produkt", "produkte")}</h3>
              <p>I gjeni te Produktet. Fotot dhe stokun mund t'ua shtoni kur të doni.</p>
            </div>
          )}
          {error && <p className="ai-error" role="alert">{error}</p>}
        </div>
        <div className="ai-foot">
          {step === 3 ? (
            <>
              <button type="button" onClick={open}>Importo një menu tjetër</button>
              <button type="button" className="primary" onClick={() => dialog.current?.close()}>Mbyll</button>
            </>
          ) : (
            <>
              <button type="button" disabled={step === 0 || busy} onClick={() => (setError(""), setStep(step - 1))}>
                <Icon name="back" size={17} /> Kthehu
              </button>
              <button type="button" className="primary" disabled={!canForward} onClick={forward}>
                {step === 1 ? (busy ? "Po lexohet…" : "Lexo me AI") : step === 2 ? (busy ? "Po ruhen…" : `Ruaj ${plural(rows.filled.length, "produkt", "produkte")}`) : "Vazhdo"}
                {step === 0 && <Icon name="arrow" size={17} />}
              </button>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}

// Inventari → "Furnizim": the supplier is at the door; type what arrived, save once.
export function StockDelivery({ state, update, onClose }) {
  const [qty, setQty] = useState({});
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const counted = state.products
    .filter((p) => p.trackStock !== false)
    .filter((p) => `${p.name} ${p.category}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const invalid = Object.values(qty).some((v) => v !== "" && !validDeliveryQuantity(v));
  const items = Object.entries(qty)
    .map(([id, v]) => ({ productId: Number(id), qty: Number(v) }))
    .filter((x) => Number.isSafeInteger(x.qty) && x.qty > 0);
  const units = items.reduce((s, x) => s + x.qty, 0);
  const save = async () => {
    if (saving || invalid || !items.length || items.length > 300) return;
    setSaving(true);
    const ok = await update("stock.receiveMany", { items }, `Furnizimi u ruajt: ${units} copë për ${plural(items.length, "produkt", "produkte")}.`);
    setSaving(false);
    if (ok) onClose();
  };
  return (
    <section className="panel stock-delivery">
      <div className="import-head">
        <div>
          <h2>Furnizim i ri</h2>
          <p className="helper">Shkruani sa copë erdhën për çdo produkt dhe ruajeni një herë. Bosh = asgjë për këtë produkt.</p>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Mbyll">
          <Icon name="close" size={18} />
        </button>
      </div>
      <input className="delivery-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Kërko produkt…" aria-label="Kërko produkt" />
      <div className="delivery-list">
        {counted.map((p) => (
          <label className="delivery-row" key={p.id}>
            <span>
              <strong>{p.name}</strong>
              <small>{p.category} · ka {p.stock} copë</small>
            </span>
            <span className="delivery-plus">+</span>
            <input
              type="number"
              min="1"
              max="100000"
              step="1"
              inputMode="numeric"
              placeholder="0"
              disabled={saving}
              aria-invalid={qty[p.id] !== undefined && qty[p.id] !== "" && !validDeliveryQuantity(qty[p.id])}
              value={qty[p.id] ?? ""}
              onChange={(e) => setQty((q) => ({ ...q, [p.id]: e.target.value }))}
              aria-label={`Sa copë ${p.name} erdhën`}
            />
          </label>
        ))}
        {!counted.length && <p className="helper">{query.trim() ? "Nuk u gjet asnjë produkt. Provoni një emër tjetër." : 'Asnjë produkt që numërohet. Aktivizoni "Ndiq stokun" te Produktet.'}</p>}
      </div>
      <div className="import-foot">
        <span className="helper" role="status">{invalid ? "Çdo sasi duhet të jetë numër i plotë nga 1 deri në 100 000. Kontrolloni edhe produktet jashtë kërkimit." : items.length > 300 ? "Ruani deri në 300 produkte njëherësh." : items.length ? `${items.length} produkte · ${units} copë` : "Asnjë sasi ende"}</span>
        <button type="button" className="primary" disabled={!items.length || items.length > 300 || invalid || saving} onClick={save}>
          {saving ? "Po ruhet…" : "Ruaj furnizimin"}
        </button>
      </div>
    </section>
  );
}

// Inventari → "Importo me AI": a supplier's invoice or delivery note read into what arrived. Each
// line is matched to a counted product (or left for the manager to choose), then received at once.
export function StockAiImport({ state, update }) {
  const counted = state.products.filter((p) => p.trackStock !== false).sort((a, b) => a.name.localeCompare(b.name, "sq"));
  return (
    <AiDocumentImport
      label="Furnizo me AI"
      title="Furnizim me AI"
      intro="Fatura ose fletëdërgesa e furnitorit: AI gjen produktet tuaja dhe sasitë që erdhën."
      notePlaceholder="p.sh. çdo arkë ka 24 shishe"
      read={async (input, note) =>
        (await readDelivery(input, note)).items.map((x) => ({ key: crypto.randomUUID(), id: x.id ? String(x.id) : "", name: x.name, qty: String(x.qty) }))}
      ready={(rows) => validDeliveryRows(rows, counted)}
      save={async (rows) => {
        const list = deliveryItems(rows);
        const units = list.reduce((s, x) => s + x.qty, 0);
        return (await update("stock.receiveMany", { items: list }, `Furnizimi u ruajt: ${units} copë për ${plural(list.length, "produkt", "produkte")}.`)) ? list.length : 0;
      }}
      saved={(n) => `Stoku u shtua për ${plural(n, "produkt", "produkte")}`}
      review={({ rows, setRows, busy }) => {
        const set = (key, field, value) => setRows((list) => list.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
        return (
          <div className="ai-rows">
            <div className="ai-row ai-row-head" aria-hidden="true"><span>Në faturë</span><span>Produkti juaj</span><span>Sasia</span><span /></div>
            {rows.map((r) => (
              <div key={r.key} className={`ai-row ${r.id && validDeliveryQuantity(r.qty) ? "" : "has-issue"}`}>
                <span className="ai-row-read">{r.name}</span>
                <select aria-label={`Produkti për "${r.name}"`} value={r.id} disabled={busy} onChange={(e) => set(r.key, "id", e.target.value)}>
                  <option value="">Zgjidhni produktin…</option>
                  {counted.map((p) => <option key={p.id} value={p.id}>{p.name} · ka {p.stock}</option>)}
                </select>
                <input aria-label={`Sasia për "${r.name}"`} inputMode="numeric" value={r.qty} disabled={busy} onChange={(e) => set(r.key, "qty", e.target.value)} />
                <button type="button" className="icon-button" aria-label={`Hiq "${r.name}"`} disabled={busy} onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}
            {rows.some((r) => !r.id) && <p className="helper">Rreshtat pa produkt nuk u gjetën te produktet që numërohen: zgjidhni një, ose hiqini.</p>}
          </div>
        );
      }}
    />
  );
}
