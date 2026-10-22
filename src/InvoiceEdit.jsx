import React, { useRef, useState } from "react";
import { bill, money } from "./domain.js";
import { Icon } from "./components.jsx";

// One setting as a quiet row: label, current value, opens in place when tapped.
function Row({ open, onToggle, label, value, locked, children }) {
  return (
    <div className={`ie-row ${open ? "open" : ""}`}>
      <button type="button" disabled={locked} aria-expanded={open} onClick={onToggle}>
        <span>{label}</span>
        <b>{value}</b>
        <Icon name="arrow" size={15} />
      </button>
      {open && <div className="ie-row-body">{children}</div>}
    </div>
  );
}

// The manager corrects a closed bill (invoice.edit) in one calm column: the items, the total,
// then payment, discount and waiter as single rows that open only when tapped, and why.
// The server has the last word.
export function InvoiceEditForm({ invoice, state, update, onDone }) {
  const dialog = useRef(null);
  const blank = () => ({
    lines: invoice.lines.map((l) => ({ ...l })),
    discount: invoice.discount ? { kind: "amount", value: invoice.discount } : null,
    method: invoice.method,
    cash: invoice.cash,
    waiter: invoice.waiter,
    reason: "",
  });
  const [f, setF] = useState(blank);
  const [search, setSearch] = useState(null);
  const [row, setRow] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (patch) => setF((v) => ({ ...v, ...patch }));

  if (invoice.fiscalStatus === "fiskalizuar")
    return <p className="helper">Fatura është fiskalizuar: nuk ndryshohet. Për para të kthyera përdorni rimbursimin.</p>;
  if (invoice.refunds?.length) return <p className="helper">Fatura ka rimbursim: nuk ndryshohet më.</p>;

  // Money only while the bill's shift is open; after that, only the waiter.
  const moneyOpen = state.openShifts.some((s) => s.id === invoice.shiftId);
  const kept = f.lines.filter((l) => l.qty > 0);
  const b = bill({ lines: kept, discount: f.discount });
  // The cash part of a mixed payment always fits the total, even after the total drops.
  const cashPart = Math.min(Math.max(1, Number(f.cash) || 1), Math.max(1, b.due - 1));
  const card = Math.max(0, b.due - cashPart);
  const qty = (key, n) => set({ lines: f.lines.map((l) => (l.key === key ? { ...l, qty: Math.max(0, Math.min(999, n)) } : l)) });
  const add = (product) => {
    // Already on the bill: one more of it, not a second line.
    const there = f.lines.find((l) => l.id === product.id && !(l.extras || []).length);
    if (there) qty(there.key, there.qty + 1);
    else set({ lines: [...f.lines, { key: `new-${product.id}`, id: product.id, name: product.name, price: product.price, qty: 1, comp: 0, fresh: true }] });
    setSearch(null);
  };
  const found = search?.trim()
    ? state.products.filter((p) => p.active !== false && p.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 6)
    : [];

  const payload = { invoiceId: invoice.id, reason: f.reason.trim() };
  const changes = [];
  if (f.waiter !== invoice.waiter) {
    payload.waiterId = f.waiter;
    changes.push(`kamarieri: ${state.waiters.find((w) => w.id === f.waiter)?.name}`);
  }
  if (moneyOpen) {
    if (JSON.stringify(kept.map((l) => [l.key, l.qty])) !== JSON.stringify(invoice.lines.map((l) => [l.key, l.qty]))) {
      payload.lines = kept.map((l) => (l.fresh ? { id: l.id, qty: l.qty } : { key: l.key, qty: l.qty }));
      changes.push("artikujt");
    }
    if (b.discount !== invoice.discount || (f.discount && f.discount.kind !== "amount")) {
      payload.discount = f.discount;
      changes.push(b.discount ? `zbritja ${money(b.discount)}` : "pa zbritje");
    }
    if (f.method !== invoice.method || (f.method === "Përzier" && cashPart !== invoice.cash) || b.due !== invoice.total) {
      payload.payment = f.method === "Përzier" ? { method: f.method, cash: cashPart } : { method: f.method };
      if (f.method !== invoice.method || f.method === "Përzier") changes.push(`pagesa: ${f.method}`);
    }
    if (b.due !== invoice.total) changes.push(`totali ${money(invoice.total)} → ${money(b.due)}`);
  }

  const close = () => dialog.current?.close();
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const data = await update("invoice.edit", payload, `Fatura D-${invoice.id} u ndryshua.`);
    setBusy(false);
    if (data) (close(), onDone(data));
  };

  const discountText = !f.discount ? "Asnjë" : f.discount.kind === "percent" ? `${f.discount.value}% · −${money(b.discount)}` : `−${money(b.discount)}`;
  const paymentText = f.method === "Përzier" ? `${money(cashPart)} cash · ${money(card)} kartë` : f.method;
  const toggle = (id) => setRow(row === id ? null : id);

  return (
    <>
      <button className="full-width" onClick={() => (setF(blank()), setSearch(null), setRow(null), dialog.current?.showModal())}>
        <Icon name="edit" size={17} /> Ndrysho faturën
      </button>
      <dialog ref={dialog} className="ie-dialog" aria-labelledby="ie-title">
        <form className="ie" onSubmit={submit}>
          <header className="ie-head">
            <h2 id="ie-title">Fatura D-{invoice.id}</h2>
            <button type="button" className="icon-button" aria-label="Mbyll" onClick={close}>
              <Icon name="close" size={18} />
            </button>
          </header>
          <div className="ie-body">
            {!moneyOpen && <p className="ie-locked">Turni është mbyllur: ndryshohet vetëm kamarieri.</p>}
            <ul className="ie-lines">
              {f.lines.map((l) => (
                <li key={l.key} className={l.qty ? "" : "removed"}>
                  <span className="ie-name">{l.name}</span>
                  {moneyOpen && (
                    <span className="ie-stepper">
                      <button type="button" aria-label={`Një më pak ${l.name}`} disabled={!l.qty} onClick={() => qty(l.key, l.qty - 1)}>−</button>
                      <b>{l.qty}</b>
                      <button type="button" aria-label={`Një më shumë ${l.name}`} onClick={() => qty(l.key, l.qty + 1)}>+</button>
                    </span>
                  )}
                  {!moneyOpen && <b className="ie-qty">{l.qty} ×</b>}
                  <span className="ie-amount">{money(l.qty * l.price)}</span>
                </li>
              ))}
            </ul>
            {moneyOpen && (search === null ? (
              <button type="button" className="ie-add-link" onClick={() => setSearch("")}>+ Shto produkt</button>
            ) : (
              <div className="ie-add">
                <input aria-label="Shto produkt" placeholder="Kërko produktin…" autoFocus value={search} onChange={(e) => setSearch(e.target.value)} />
                {found.length > 0 && (
                  <ul className="ie-found">
                    {found.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => add(p)}>{p.name}<span>{money(p.price)}</span></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            <p className="ie-total">
              <span>Totali</span>
              <b>{money(b.due)}</b>
              {b.due !== invoice.total && <s>{money(invoice.total)}</s>}
            </p>

            <div className="ie-rows">
              <Row open={row === "pay"} onToggle={() => toggle("pay")} label="Pagesa" value={paymentText} locked={!moneyOpen}>
                <div className="ie-seg">
                  {["Cash", "Kartë", "Përzier"].map((m) => (
                    <button type="button" key={m} aria-pressed={f.method === m}
                      onClick={() => set({ method: m, cash: m === "Përzier" && f.method !== "Përzier" ? Math.round(b.due / 2) : f.cash })}>
                      {m}
                    </button>
                  ))}
                </div>
                {f.method === "Përzier" && (
                  <label className="ie-inline">
                    Cash
                    <input type="number" min="1" max={Math.max(1, b.due - 1)} required value={cashPart} onChange={(e) => set({ cash: Number(e.target.value) })} />
                    <span>· kartë {money(card)}</span>
                  </label>
                )}
              </Row>
              <Row open={row === "discount"} onToggle={() => toggle("discount")} label="Zbritja" value={discountText} locked={!moneyOpen}>
                <div className="ie-seg">
                  {[[null, "Asnjë"], ["percent", "%"], ["amount", "Lek"]].map(([kind, label]) => (
                    <button type="button" key={label} aria-pressed={(f.discount?.kind ?? null) === kind}
                      onClick={() => set({ discount: kind ? { kind, value: f.discount?.kind === kind ? f.discount.value : kind === "percent" ? 10 : 100 } : null })}>
                      {label}
                    </button>
                  ))}
                </div>
                {f.discount && (
                  <label className="ie-inline">
                    {f.discount.kind === "percent" ? "Përqindja" : "Shuma"}
                    <input aria-label="Vlera e zbritjes" type="number" min="1" max={f.discount.kind === "percent" ? 100 : undefined} required
                      value={f.discount.value} onChange={(e) => set({ discount: { ...f.discount, value: Number(e.target.value) } })} />
                  </label>
                )}
              </Row>
              <Row open={row === "waiter"} onToggle={() => toggle("waiter")} label="Kamarieri" value={state.waiters.find((w) => w.id === f.waiter)?.name || "—"}>
                <div className="ie-seg wrap">
                  {state.waiters.filter((w) => w.active || w.id === invoice.waiter).map((w) => (
                    <button type="button" key={w.id} aria-pressed={f.waiter === w.id} onClick={() => set({ waiter: w.id })}>{w.name}</button>
                  ))}
                </div>
              </Row>
            </div>

            <input className="ie-reason" aria-label="Arsyeja" minLength={3} maxLength={200} required placeholder="Arsyeja e ndryshimit"
              value={f.reason} onChange={(e) => set({ reason: e.target.value })} />
          </div>
          <footer className="ie-foot">
            <button type="button" onClick={close}>Anulo</button>
            <button className="primary" disabled={busy || !changes.length || (moneyOpen && !kept.length)}>
              {busy ? "Po ruhet…" : "Ruaj"}
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
}
