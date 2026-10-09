import React, { useMemo, useRef, useState } from "react";
import { Icon } from "./components.jsx";
import { blank, parseList, productRowProblem, validDeliveryQuantity } from "./parseList.js";

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

// Produktet → "Shto shumë": a quick table, one product per row, saved in one go.
export function ProductImport({ state, update, onClose }) {
  const [rows, setRows] = useState(() => [blank(state.categories[0] || ""), blank(state.categories[0] || "")]);
  const [paste, setPaste] = useState(null);
  const [saving, setSaving] = useState(false);
  const table = useRef(null);
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
  const save = async () => {
    if (saving || problems || !filled.length || filled.length > 200) return;
    setSaving(true);
    const products = filled.map((r) => ({
      name: r.name.trim(), price: Number(r.price), category: r.category.trim(),
      ...(r.department.trim() ? { department: r.department.trim() } : {}),
      ...(r.stock !== "" ? { stock: Number(r.stock) } : {}),
    }));
    const ok = await update("products.import", { products }, `U shtuan ${products.length} produkte.`);
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
                const parsed = parseList(paste, rows.at(-1)?.category || state.categories[0] || "");
                setRows((list) => [...list.filter((r) => r.name.trim() || r.price !== "" || r.stock !== ""), ...parsed, blank(parsed.at(-1)?.category || "")]);
                setPaste(null);
              }}
            >
              Shto në tabelë
            </button>
          </div>
        </div>
      )}
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
                  disabled={saving}
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
      <div className="import-foot">
        <button type="button" onClick={() => setRows((list) => [...list, blank(list.at(-1)?.category || "", list.at(-1)?.department || "")])}>
          <Icon name="plus" size={16} /> Rresht i ri
        </button>
        <span className="helper">{filled.length > 200 ? "Ruani deri në 200 produkte njëherësh" : problems ? `${problems} rreshta për t'u rregulluar` : `${filled.length} produkte gati`}</span>
        <button type="button" className="primary" disabled={!filled.length || filled.length > 200 || problems > 0 || saving} onClick={save}>
          {saving ? "Po ruhen…" : `Ruaj ${filled.length || ""} produkte`}
        </button>
      </div>
    </section>
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
    const ok = await update("stock.receiveMany", { items }, `Furnizimi u ruajt: ${units} copë për ${items.length} produkte.`);
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
