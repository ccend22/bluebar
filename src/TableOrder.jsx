import React, { useEffect, useRef, useState } from "react";
import { money, total } from "./domain.js";
import { DepartmentTag, Empty, Field, Icon, Search } from "./components.jsx";

// The waiter's whole job at a table, in one panel: pick from the menu, send each new
// round to the stations, take payment. The footer always offers exactly one primary
// next step — "Dërgo" while something hasn't gone to a station yet, else "Paguaj".
export function TableOrder({
  table,
  state,
  role,
  user,
  waiter,
  onWaiterChange,
  mode,
  setMode,
  query,
  setQuery,
  category,
  setCategory,
  products,
  available,
  update,
  onClose,
  onSend,
  onPay,
  onPrintBill,
  cancelling,
  setCancelling,
  headingRef,
}) {
  const [menu, setMenu] = useState(null);
  const heading = useRef(null);
  useEffect(() => setMenu(null), [table.id]);
  useEffect(() => {
    if (!menu) return;
    const outside = (e) => !heading.current?.contains(e.target) && setMenu(null);
    const escape = (e) => e.key === "Escape" && setMenu(null);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [menu]);

  const isWaiter = role === "Kamarier";
  const hasOrder = table.lines.length > 0;
  const ownerId = hasOrder ? table.waiter : waiter;
  const owner = state.waiters.find((w) => w.id === ownerId);
  // A waiter looking at a colleague's table can see it, but must claim it first.
  const foreign = isWaiter && hasOrder && table.waiter !== user.waiterId;
  const canAdd = Boolean(state.shift) && Boolean(ownerId) && !foreign;
  const qtyOf = new Map(table.lines.map((l) => [l.id, l.qty]));
  const fresh = (l) => l.qty - (l.sent || 0);
  const pending = table.lines.reduce((s, l) => s + fresh(l), 0);
  const items = table.lines.reduce((s, l) => s + l.qty, 0);
  const departmentOf = (id) => state.products.find((p) => p.id === id)?.department || "Tjetër";
  const lines = [...table.lines].sort((a, b) => (fresh(b) > 0) - (fresh(a) > 0));
  const tickets = state.tickets.filter((k) => k.table === table.id && !k.invoice && !k.cancelledAt);
  const stations = [...new Set(tickets.map((k) => k.department))].map((d) => ({
    department: d,
    ready: tickets.filter((k) => k.department === d).every((k) => k.doneAt),
  }));
  const minutes = hasOrder && table.occupiedSince
    ? Math.max(0, Math.round((Date.now() - new Date(table.occupiedSince)) / 60000))
    : null;
  const add = (productId) =>
    update("order.add", { tableId: table.id, productId, waiterId: ownerId });
  const remove = (productId) => update("order.remove", { tableId: table.id, productId });
  const product = (id) => state.products.find((p) => p.id === id);

  return (
    <section className="order" aria-label={`Porosia e tavolinës ${table.id}`}>
      <div className="order-heading" ref={heading}>
        <div className="order-heading-text">
          <h2 ref={headingRef} tabIndex={-1}>
            Tavolina {String(table.id).padStart(2, "0")}
          </h2>
          <p>
            <span>{table.area}</span>
            {isWaiter ? (
              owner && <span>{owner.name}</span>
            ) : (
              <span>
                <button
                  type="button"
                  className="waiter-chip"
                  aria-haspopup="menu"
                  aria-expanded={menu === "waiter"}
                  onClick={() => setMenu(menu === "waiter" ? null : "waiter")}
                >
                  {owner?.name || "Zgjidh kamarierin"}
                  <Icon name="chevronDown" size={13} />
                </button>
              </span>
            )}
            {minutes !== null && <span>{minutes} min</span>}
          </p>
        </div>
        <div className="order-heading-actions">
          {hasOrder && (
            <button
              className="icon-button"
              aria-label="Më shumë veprime"
              aria-haspopup="menu"
              aria-expanded={menu === "more"}
              onClick={() => setMenu(menu === "more" ? null : "more")}
            >
              <Icon name="more" />
            </button>
          )}
          <button className="icon-button" onClick={onClose} aria-label="Kthehu te tavolinat">
            <Icon name="close" />
          </button>
        </div>
        {menu === "more" && (
          <div className="order-popover right" role="menu">
            <button role="menuitem" onClick={() => (setMenu(null), onPrintBill(table))}>
              <Icon name="print" size={17} />
              Printo para-faturën
            </button>
            {!isWaiter && (
              <button role="menuitem" className="danger" onClick={() => (setMenu(null), setCancelling(true))}>
                <Icon name="close" size={17} />
                Anulo porosinë
              </button>
            )}
          </div>
        )}
        {menu === "waiter" && (
          <div className="order-popover" role="menu">
            {state.waiters
              .filter((w) => w.active || w.id === ownerId)
              .map((w) => (
                <button
                  key={w.id}
                  role="menuitemradio"
                  aria-checked={w.id === ownerId}
                  onClick={() => (setMenu(null), w.id !== ownerId && onWaiterChange(w.id))}
                >
                  {w.name}
                  {w.id === ownerId && <Icon name="check" size={16} />}
                </button>
              ))}
          </div>
        )}
      </div>

      <div className="order-body">
        {!state.waiters.some((w) => w.active) && (
          <p className="notice warning">Shtoni një kamarier aktiv te Kamarierët përpara porosisë.</p>
        )}
        {foreign && (
          <div className="claim-banner">
            <span>
              Kjo tavolinë është e <b>{owner?.name || "një kolegu"}</b>.
            </span>
            <button
              className="primary"
              onClick={() => update("order.assign", { tableId: table.id, waiterId: user.waiterId })}
            >
              Merre tavolinën
            </button>
          </div>
        )}
        {cancelling && (
          <form
            className="stack-form order-cancel-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const reason = new FormData(e.currentTarget).get("reason");
              const data = await update("order.cancel", { tableId: table.id, reason }, "Porosia u anulua dhe tavolina u lirua.");
              if (data) {
                setCancelling(false);
                onClose();
              }
            }}
          >
            <Field label="Arsyeja e anulimit" name="reason" minLength={3} maxLength={200} required placeholder="p.sh. Klienti u largua" autoFocus />
            <p className="helper">Anulohet porosia e papaguar; reparteve u shkon fleta "Anuluar".</p>
            <div className="actions">
              <button type="button" onClick={() => setCancelling(false)}>Kthehu</button>
              <button className="danger-button">Anulo porosinë</button>
            </div>
          </form>
        )}

        <div className="order-segment" role="tablist" aria-label="Pamja e porosisë">
          <button role="tab" aria-selected={mode === "add"} onClick={() => setMode("add")}>
            Menuja
          </button>
          <button role="tab" aria-selected={mode === "summary"} onClick={() => setMode("summary")}>
            Porosia
            {items > 0 && <span className="segment-count">{items}</span>}
          </button>
        </div>

        {mode === "add" ? (
          <div className="menu-view">
            <Search label="Kërko produkt" placeholder="Kërko në menu…" value={query} onChange={setQuery} />
            <div className="chip-row" aria-label="Kategoritë e menusë">
              {["Të gjitha", ...state.categories].map((c) => (
                <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>
                  {c}
                </button>
              ))}
            </div>
            <div className="menu-grid">
              {products.map((p) => {
                const qty = qtyOf.get(p.id) || 0;
                const out = available(p) <= 0;
                return (
                  <button
                    key={p.id}
                    className={`menu-tile ${qty ? "in-order" : ""}`}
                    disabled={!canAdd || out}
                    aria-label={`Shto ${p.name}, ${money(p.price)}${qty ? `, ${qty} në porosi` : ""}`}
                    onClick={() => add(p.id)}
                  >
                    <span className="menu-tile-name">{p.name}</span>
                    <span className="menu-tile-price">{out ? "Pa stok" : money(p.price)}</span>
                    {qty > 0 ? (
                      <span className="menu-tile-qty" key={qty}>{qty}</span>
                    ) : (
                      <span className="menu-tile-add" aria-hidden="true">
                        <Icon name="plus" size={14} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {!products.length && (
              <p className="inline-empty">Nuk u gjet asnjë produkt. Provoni një emër tjetër.</p>
            )}
          </div>
        ) : (
          <div className="order-view">
            {stations.length > 0 && (
              <div className="station-status" aria-label="Gjendja në repartet">
                {stations.map((s) => (
                  <span key={s.department} className={s.ready ? "ready" : ""}>
                    <DepartmentTag name={s.department} />
                    {s.ready ? (
                      <>
                        <Icon name="check" size={13} /> Gati
                      </>
                    ) : (
                      "Në përgatitje"
                    )}
                  </span>
                ))}
              </div>
            )}
            {hasOrder ? (
              <ul className="order-list">
                {lines.map((l) => {
                  const unsent = fresh(l);
                  const locked = isWaiter && unsent === 0;
                  return (
                    <li key={l.id} className={unsent > 0 ? "fresh" : ""}>
                      <div className="order-item-main">
                        <strong>{l.name}</strong>
                        <small>
                          <DepartmentTag name={departmentOf(l.id)} />
                          {unsent > 0 ? (
                            <span className="pending-mark">
                              {l.sent ? `${unsent} e re · ${l.sent} dërguar` : "E re"}
                            </span>
                          ) : (
                            <span className="sent-mark">
                              <Icon name="check" size={12} /> Dërguar
                            </span>
                          )}
                        </small>
                      </div>
                      <div className="quantity">
                        <button
                          disabled={locked || foreign}
                          title={locked ? "Dërguar në repart — vetëm menaxheri mund ta heqë" : undefined}
                          aria-label={`Hiq një ${l.name}`}
                          onClick={() => remove(l.id)}
                        >
                          −
                        </button>
                        <span>{l.qty}</span>
                        <button
                          disabled={!canAdd || !product(l.id) || available(product(l.id)) <= 0}
                          aria-label={`Shto një ${l.name}`}
                          onClick={() => add(l.id)}
                        >
                          +
                        </button>
                      </div>
                      <b>{money(l.price * l.qty)}</b>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty
                icon="coffee"
                title="Tavolina është bosh"
                action={
                  <button className="primary" onClick={() => setMode("add")}>
                    <Icon name="plus" size={16} /> Hap menunë
                  </button>
                }
              >
                Shtoni produktet nga menuja.
              </Empty>
            )}
          </div>
        )}
      </div>

      {hasOrder && (
        <div className="order-footer">
          <div className="order-footer-total">
            <span>
              {items} {items === 1 ? "artikull" : "artikuj"}
              {pending > 0 && <em> · {pending} pa dërguar</em>}
            </span>
            <strong>{money(total(table.lines))}</strong>
          </div>
          <div className={`order-footer-actions ${pending > 0 ? "split" : ""}`}>
            {pending > 0 ? (
              <>
                <button disabled={!state.shift || foreign} onClick={onPay}>
                  Paguaj
                </button>
                <button className="primary" disabled={!state.shift || foreign} onClick={() => onSend(table)}>
                  <Icon name="arrow" size={17} />
                  Dërgo në repartet · {pending}
                </button>
              </>
            ) : (
              <button className="primary" disabled={!state.shift || foreign} onClick={onPay}>
                <Icon name="check" size={17} />
                Paguaj · {money(total(table.lines))}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
