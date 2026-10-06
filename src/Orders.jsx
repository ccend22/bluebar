import React, { useEffect, useMemo, useState } from "react";
import { bill, money } from "./domain.js";
import { Badge, DepartmentTag, Empty, Icon, SectionHeading } from "./components.jsx";

export function Orders({ state, selected, onSelect, onModify, onClose, onPrint, onSend, onReprintTicket, time }) {
  const [area, setArea] = useState("Të gjitha");
  const [fiscalizeChoice, setFiscalizeChoice] = useState(false);
  const waiterName = (id) => state.waiters.find((w) => w.id === id)?.name;
  useEffect(() => setFiscalizeChoice(false), [selected]);

  const openTables = useMemo(
    () =>
      state.tables
        .filter((t) => t.lines.length > 0)
        .filter((t) => area === "Të gjitha" || t.area === area)
        .sort((a, b) => a.id - b.id),
    [state.tables, area],
  );
  const areas = useMemo(
    () => [
      "Të gjitha",
      ...[...new Set(state.tables.filter((t) => t.lines.length > 0).map((t) => t.area))].sort((a, b) =>
        a.localeCompare(b, "sq"),
      ),
    ],
    [state.tables],
  );
  const table = state.tables.find((t) => t.id === selected && t.lines.length > 0);
  const pending = table ? table.lines.reduce((s, l) => s + l.qty - (l.sent || 0), 0) : 0;
  const tickets = table
    ? state.tickets.filter((k) => k.table === table.id && !k.invoice && !k.cancelledAt)
    : [];
  const ticketGroups = useMemo(() => {
    if (!table) return [];
    const byDept = new Map();
    for (const l of table.lines) {
      const dept = state.products.find((p) => p.id === l.id)?.department || "Tjetër";
      if (!byDept.has(dept)) byDept.set(dept, []);
      byDept.get(dept).push(l);
    }
    return [...byDept.entries()];
  }, [table, state.products]);

  return (
    <div className="orders-layout">
      <section className={`panel orders-list-panel ${table ? "mobile-hidden" : ""}`}>
        <SectionHeading title="Porositë" description={`${openTables.length} porosi aktive`} />
        {areas.length > 1 && (
          <div className="tabs" aria-label="Filtro zonën">
            {areas.map((a) => (
              <button key={a} aria-pressed={area === a} onClick={() => setArea(a)}>
                {a}
              </button>
            ))}
          </div>
        )}
        {openTables.length ? (
          <div className="orders-list">
            {openTables.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`orders-list-item ${selected === t.id ? "selected" : ""}`}
                aria-pressed={selected === t.id}
                onClick={() => onSelect(t.id)}
              >
                <div className="orders-list-item-head">
                  <strong>Tavolina {String(t.id).padStart(2, "0")}</strong>
                  <Badge tone="green">E hapur</Badge>
                </div>
                <div className="orders-list-item-row">
                  <div className="orders-list-item-meta">
                    <span>{waiterName(t.waiter) || "Pa kamarier"}</span>
                    <span>
                      {t.lines.reduce((s, l) => s + l.qty, 0)} artikuj · Nisi {time(t.occupiedSince)}
                    </span>
                  </div>
                  <strong className="orders-list-item-total">{money(bill(t).remaining)}</strong>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <Empty icon="menu" title="Asnjë porosi aktive">
            Porositë e hapura shfaqen këtu sapo një tavolinë të marrë porosinë e parë.
          </Empty>
        )}
      </section>
      <section className="panel orders-detail-panel">
        {table ? (
          <>
            <div className="orders-detail-head">
              <div className="orders-detail-title">
                <div>
                  <small>Tavolina</small>
                  <h2>{String(table.id).padStart(2, "0")}</h2>
                </div>
                <Badge tone="green">E hapur</Badge>
              </div>
              <div className="orders-detail-actions">
                <button onClick={() => onModify(table)}>Ndrysho porosinë</button>
                <button className="icon-button orders-detail-close" onClick={() => onSelect(null)} aria-label="Kthehu te lista">
                  <Icon name="close" />
                </button>
              </div>
            </div>
            <p className="orders-detail-meta">
              {waiterName(table.waiter) || "Pa kamarier"} · {table.seats} vende · Nisi {time(table.occupiedSince)}
            </p>
            <div className="receipt-paper order-ticket">
              {ticketGroups.map(([dept, lines]) => (
                <div className="receipt-department" key={dept}>
                  <div className="receipt-department-head">
                    <DepartmentTag name={dept} />
                  </div>
                  {lines.map((l) => (
                    <div className="receipt-line" key={l.key || l.id}>
                      <span>
                        {l.qty} × {l.name}
                        <small>
                          {money(l.price)} / copë
                          {l.qty > (l.sent || 0) && (
                            <span className="pending-mark"> · {l.qty - (l.sent || 0)} pa dërguar</span>
                          )}
                        </small>
                      </span>
                      <b>{money(l.qty * l.price)}</b>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {tickets.length > 0 && (
              <div className="sent-tickets">
                <h3>Dërguar në repartet</h3>
                {tickets.map((k) => (
                  <div className="sent-ticket" key={k.id}>
                    <DepartmentTag name={k.department} />
                    <span>
                      {(state.stations || []).find((x) => x.id === k.station)?.name
                        ? `${state.stations.find((x) => x.id === k.station).name} · `
                        : ""}
                      {k.void ? "Anulim" : `Raundi ${k.round}`} · {time(k.date)} ·{" "}
                      {k.lines.map((l) => `${k.void ? "−" : ""}${l.qty}× ${l.name}`).join(", ")}
                    </span>
                    {k.void ? (
                      <span className="pending-mark">{k.doneAt ? "Pa nga reparti" : "Te reparti"}</span>
                    ) : k.doneAt ? (
                      <span className="sent-mark">
                        <Icon name="check" size={12} /> Gati
                      </span>
                    ) : (
                      <span className="pending-mark">Në përgatitje</span>
                    )}
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Riprinto ${k.department}, raundi ${k.round}`}
                      onClick={() => onReprintTicket(k)}
                    >
                      <Icon name="print" size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="orders-detail-total">
              <span>Totali</span>
              <strong>{money(bill(table).remaining)}</strong>
            </div>
            <div className="receipt-actions">
              {pending > 0 && (
                <button className="primary full-width" onClick={() => onSend(table)}>
                  <Icon name="arrow" size={18} />
                  Dërgo në repartet ({pending})
                </button>
              )}
              <button className="full-width" onClick={() => onPrint(table)}>
                <Icon name="print" size={18} />
                Printo faturën
              </button>
              {fiscalizeChoice ? (
                <div className="fiscalize-choice">
                  <span>Si po paguhet?</span>
                  <div className="payment-methods">
                    <button
                      onClick={() => {
                        setFiscalizeChoice(false);
                        onClose(table, "Cash");
                      }}
                    >
                      <Icon name="cash" size={16} />
                      Cash
                    </button>
                    <button
                      onClick={() => {
                        setFiscalizeChoice(false);
                        onClose(table, "Kartë");
                      }}
                    >
                      <Icon name="card" size={16} />
                      Kartë
                    </button>
                  </div>
                  <button className="text-button full-width" onClick={() => setFiscalizeChoice(false)}>
                    Anulo
                  </button>
                </div>
              ) : (
                <button
                  className={`full-width ${pending ? "" : "primary"}`}
                  onClick={() => setFiscalizeChoice(true)}
                >
                  <Icon name="receipt" size={18} />
                  {state.fiscal?.enabled ? "Fiskalizo Faturën" : "Paguaj"}
                </button>
              )}
              <button className="full-width" onClick={() => onSelect(null)}>
                Mbyll
              </button>
            </div>
          </>
        ) : (
          <Empty icon="menu" title="Zgjidhni një porosi">
            Klikoni një tavolinë nga lista për t'i parë detajet dhe për ta mbyllur.
          </Empty>
        )}
      </section>
    </div>
  );
}
