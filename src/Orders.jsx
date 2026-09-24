import React, { useMemo, useState } from "react";
import { money, total } from "./domain.js";
import { Badge, Empty, Icon, SectionHeading } from "./components.jsx";

export function Orders({ state, selected, onSelect, onModify, onClose, time }) {
  const [area, setArea] = useState("Të gjitha");
  const waiterName = (id) => state.waiters.find((w) => w.id === id)?.name;

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
                  <strong className="orders-list-item-total">{money(total(t.lines))}</strong>
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
            <div className="table-scroll">
              <table className="responsive-table orders-item-table">
                <thead>
                  <tr>
                    <th>Produkti</th>
                    <th className="numeric">Sasia</th>
                    <th className="numeric">Çmimi</th>
                    <th className="numeric">Totali</th>
                  </tr>
                </thead>
                <tbody>
                  {table.lines.map((l) => (
                    <tr key={l.id}>
                      <td data-label="Produkti">{l.name}</td>
                      <td data-label="Sasia" className="numeric">
                        {l.qty}
                      </td>
                      <td data-label="Çmimi" className="numeric">
                        {money(l.price)}
                      </td>
                      <td data-label="Totali" className="numeric">
                        {money(l.price * l.qty)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="orders-detail-total">
              <span>Totali</span>
              <strong>{money(total(table.lines))}</strong>
            </div>
            <div className="orders-detail-payment">
              <button className="primary" onClick={() => onClose(table, "Kartë")}>
                Paguaj me kartë
              </button>
              <button onClick={() => onClose(table, "Cash")}>Paguaj cash</button>
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
