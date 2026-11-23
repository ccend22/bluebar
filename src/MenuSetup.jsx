import React, { useState } from "react";
import { DepartmentTag, Icon, SectionHeading } from "./components.jsx";

// Cilësimet → Repartet dhe kategoritë: where an order is prepared (departments: bar, kitchen…)
// and how the menu is grouped (categories: coffee, drinks…). Rename in place (products, and a
// department's printers, follow); remove (a department's products wait for a new one; a
// category only once it is empty).
export function MenuSetup({ state, update }) {
  const count = (field, value) => state.products.filter((p) => p[field] === value).length;
  const printersOf = (d) => state.printers.filter((p) => p.departments?.includes(d)).map((p) => p.name);
  return (
    <>
      <div className="settings-column">
        <NameList
          icon="coffee"
          title="Repartet e përgatitjes"
          description="Ku përgatitet porosia. Fleta e çdo produkti shkon te reparti i tij dhe te printeri i atij reparti."
          items={state.departments}
          tag={(d) => <DepartmentTag name={d} />}
          meta={(d) => {
            const n = count("department", d), printers = printersOf(d);
            return `${n === 1 ? "1 produkt" : `${n} produkte`} · ${printers.length ? printers.join(", ") : "pa printer"}`;
          }}
          addLabel="Shto repart"
          placeholder="p.sh. Grill"
          onAdd={(name) => update("department.create", { name }, `Reparti "${name}" u shtua.`)}
          onRename={(from, name) => update("department.rename", { from, name }, `"${from}" u bë "${name}". Produktet dhe printerët e ndoqën.`)}
          onRemove={(d) => {
            const n = count("department", d);
            if (n && !confirm(`"${d}" ka ${n === 1 ? "1 produkt" : `${n} produkte`}. Do të mbeten pa repart derisa t'u zgjidhni një tjetër te Produktet. Ta fshij?`)) return;
            return update("department.delete", { name: d }, `Reparti "${d}" u fshi.`);
          }}
        />
      </div>
      <div className="settings-column">
        <NameList
          icon="list"
          title="Kategoritë e menusë"
          description="Grupet që shohin kamarierët dhe klientët në menu: kafe, pije, ushqim…"
          items={state.categories}
          meta={(c) => { const n = count("category", c); return n === 1 ? "1 produkt" : `${n} produkte`; }}
          blocked={(c) => count("category", c) > 0 && "Ka produkte: kalojini në një kategori tjetër, pastaj fshijeni."}
          addLabel="Shto kategori"
          placeholder="p.sh. Kokteje"
          onAdd={(name) => update("category.create", { name }, `Kategoria "${name}" u shtua.`)}
          onRename={(from, name) => update("category.rename", { from, name }, `"${from}" u bë "${name}". Produktet e ndoqën.`)}
          onRemove={(c) => update("category.delete", { name: c }, `Kategoria "${c}" u fshi.`)}
        />
      </div>
    </>
  );
}

function NameList({ icon, title, description, items, tag, meta, blocked = () => false, addLabel, placeholder, onAdd, onRename, onRemove }) {
  const [editing, setEditing] = useState(null); // { from, to }
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (work) => {
    setBusy(true);
    const ok = await work();
    setBusy(false);
    return ok;
  };
  const exists = (name, except) => items.some((x) => x !== except && x.toLocaleLowerCase("sq") === name.toLocaleLowerCase("sq"));
  return (
    <section className="panel ms-panel">
      <SectionHeading icon={icon} title={title} description={description} />
      <ul className="ms-list">
        {items.map((x) =>
          editing?.from === x ? (
            <li key={x} className="editing">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const to = editing.to.trim();
                  if (!to || to === x) return setEditing(null);
                  if (exists(to, x)) return;
                  if (await run(() => onRename(x, to))) setEditing(null);
                }}
              >
                <input aria-label={`Emri i ri për ${x}`} value={editing.to} maxLength={40} autoFocus onChange={(e) => setEditing({ from: x, to: e.target.value })} onKeyDown={(e) => e.key === "Escape" && setEditing(null)} />
                <button className="primary" disabled={busy || !editing.to.trim() || exists(editing.to.trim(), x)}>Ruaj</button>
                <button type="button" onClick={() => setEditing(null)}>Anulo</button>
              </form>
              {exists(editing.to.trim(), x) && <small className="ms-warn">"{editing.to.trim()}" ekziston tashmë.</small>}
            </li>
          ) : (
            <li key={x}>
              <div className="ms-name">
                {tag ? tag(x) : <strong>{x}</strong>}
                <small>{meta(x)}</small>
              </div>
              <div className="ms-actions">
                <button type="button" className="icon-button" aria-label={`Riemërto ${x}`} title="Riemërto" onClick={() => setEditing({ from: x, to: x })}>
                  <Icon name="edit" size={16} />
                </button>
                <button
                  type="button"
                  className="icon-button danger"
                  aria-label={`Fshi ${x}`}
                  title={blocked(x) || "Fshije"}
                  disabled={busy || Boolean(blocked(x))}
                  onClick={() => run(() => onRemove(x))}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </li>
          ),
        )}
        <li className="ms-new">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const name = adding.trim();
              if (!name || exists(name)) return;
              if (await run(() => onAdd(name))) setAdding("");
            }}
          >
            <Icon name="plus" size={16} />
            <input aria-label={addLabel} value={adding} maxLength={40} placeholder={`${addLabel}, ${placeholder}`} onChange={(e) => setAdding(e.target.value)} />
            {adding.trim() && <button className="primary" disabled={busy || exists(adding.trim())}>{exists(adding.trim()) ? "Ekziston" : "Shto"}</button>}
          </form>
        </li>
      </ul>
    </section>
  );
}
