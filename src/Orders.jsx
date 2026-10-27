import React, { useState } from "react";
import { bill, money, pendingUnits, tableName } from "./domain.js";
import { Badge, Empty, Icon, SectionHeading } from "./components.jsx";

// Porositë: open orders as a compact list, and the chosen one beside it as the receipt it will
// become, with what to do next under it. On a phone a row opens the full order window instead.
export function Orders({ state, onEdit, onSend, onPay, onPrint }) {
  const [area, setArea] = useState("Të gjitha");
  const [chosen, setChosen] = useState(null);
  const waiterName = (id) => state.waiters.find((w) => w.id === id)?.name;
  const open = state.tables.filter((t) => t.lines.length > 0);
  const areas = ["Të gjitha", ...[...new Set(open.map((t) => t.area))].sort((a, b) => a.localeCompare(b, "sq"))];
  const shown = open.filter((t) => area === "Të gjitha" || t.area === area).sort((a, b) => a.id - b.id);
  const total = shown.reduce((s, t) => s + bill(t).remaining, 0);
  // Nothing chosen (or it was just paid): the first order is open, never an empty panel.
  const table = shown.find((t) => t.id === chosen) || shown[0];

  const unsentOf = (t) => t.lines.reduce((s, l) => s + l.qty - (l.sent || 0), 0);
  // Where the table's order is, the same way the order window reads it: something still to
  // send, slips still at a station, or everything ready.
  const status = (t) => {
    const unsent = unsentOf(t);
    if (unsent > 0) return <Badge tone="amber">{unsent} pa dërguar</Badge>;
    const slips = state.tickets.filter((k) => k.table === t.id && !k.invoice && !k.cancelledAt && !k.void);
    if (slips.some((k) => !k.doneAt)) return <Badge>Në përgatitje</Badge>;
    return <Badge tone="green">{slips.length ? "Gati" : "Dërguar"}</Badge>;
  };
  const minutes = (t) =>
    t.occupiedSince ? `${Math.max(0, Math.round((Date.now() - new Date(t.occupiedSince)) / 60000))} min` : "";
  const choose = (t) => (matchMedia("(max-width: 900px)").matches ? onEdit(t) : setChosen(t.id));

  if (!open.length)
    return (
      <section className="panel">
        <Empty icon="menu" title="Asnjë porosi aktive">
          Porositë e hapura shfaqen këtu sapo një tavolinë të marrë porosinë e parë.
        </Empty>
      </section>
    );

  const b = table && bill(table);
  // What "Dërgo" would send now (held items and later courses wait), as the order window counts it.
  const sendable = table ? pendingUnits(table).reduce((s, l) => s + l.qty - (l.sent || 0), 0) : 0;
  return (
    <div className="orders-desk">
      <section className="panel orders-desk-list">
        <SectionHeading title="Të hapura" description={`${shown.length} porosi · ${money(total)}`} />
        {areas.length > 2 && (
          <div className="tabs" aria-label="Filtro zonën">
            {areas.map((a) => (
              <button key={a} aria-pressed={area === a} onClick={() => setArea(a)}>
                {a}
                {a !== "Të gjitha" && <span>{open.filter((t) => t.area === a).length}</span>}
              </button>
            ))}
          </div>
        )}
        <div className="orders-rows" role="list">
          {shown.map((t) => (
            <button
              key={t.id}
              type="button"
              role="listitem"
              className="orders-row"
              aria-current={t.id === table?.id ? "true" : undefined}
              onClick={() => choose(t)}
            >
              <span className="orders-row-table">
                <strong>{tableName(t)}</strong>
                <small>{waiterName(t.waiter) || "Pa kamarier"} · {t.area}</small>
              </span>
              <span className="orders-row-time">{minutes(t)}</span>
              <span className="orders-row-status">{status(t)}</span>
              <strong className="orders-row-total">{money(bill(t).remaining)}</strong>
            </button>
          ))}
        </div>
      </section>

      {table && (
        <aside className="panel orders-desk-receipt" aria-label={`Porosia e ${tableName(table)}`}>
          <header className="orders-receipt-head">
            <div>
              <h2>{tableName(table)}</h2>
              <p>
                {waiterName(table.waiter) || "Pa kamarier"} · {table.area} · {minutes(table)}
              </p>
            </div>
            {status(table)}
          </header>
          <ul className="orders-receipt-lines">
            {table.lines.map((l) => {
              const fresh = l.qty - (l.sent || 0);
              return (
                <li key={l.key || l.id}>
                  <span>
                    <span><b>{l.qty} ×</b> {l.name}</span>
                    {fresh > 0 && <small className="pending-mark">{fresh} pa dërguar</small>}
                  </span>
                  <span>{money(l.qty * l.price)}</span>
                </li>
              );
            })}
          </ul>
          <dl className="orders-receipt-sum">
            {b.paid > 0 && (
              <>
                <div><dt>Totali</dt><dd>{money(b.due)}</dd></div>
                <div><dt>Paguar</dt><dd>−{money(b.paid)}</dd></div>
              </>
            )}
            <div className="orders-receipt-due"><dt>Për t'u paguar</dt><dd>{money(b.remaining)}</dd></div>
          </dl>
          <div className="orders-receipt-actions">
            {sendable > 0 && (
              <button className="primary" onClick={() => onSend(table)}>
                <Icon name="arrow" size={18} /> Dërgo në repartet · {sendable}
              </button>
            )}
            <button className={sendable > 0 ? "" : "primary"} onClick={() => onPay(table)}>
              <Icon name="receipt" size={18} /> Paguaj · {money(b.remaining)}
            </button>
            <div className="orders-receipt-more">
              <button onClick={() => onEdit(table)}>Ndrysho porosinë</button>
              <button onClick={() => onPrint(table)}>
                <Icon name="print" size={16} /> Para-fatura
              </button>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
