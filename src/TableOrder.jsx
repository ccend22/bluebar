import React, { useEffect, useRef, useState } from "react";
import { bill, COURSES, money, pendingUnits, posOf, shiftFor, tableShift } from "./domain.js";
import { ChoiceField } from "./ChoiceField.jsx";
import { DepartmentTag, Empty, Field, Icon, Search } from "./components.jsx";
import { OrderHistory } from "./OrderHistory.jsx";
import { venueSlug } from "./api.js";

const WIDE = "(min-width: 900px)";
// "09.10 · 13:21": day.month, 24-hour, never ambiguous.
const billDate = (since) => {
  const d = new Date(since || Date.now());
  const two = (n) => String(n).padStart(2, "0");
  return `${two(d.getDate())}.${two(d.getMonth() + 1)} · ${two(d.getHours())}:${two(d.getMinutes())}`;
};
const photoOf = (p) => (p.photoAt ? `/api/product-photo/${p.id}?b=${encodeURIComponent(venueSlug)}&v=${encodeURIComponent(p.photoAt)}` : null);

// The waiter's whole job at a table, in one large popup: the menu with photos, the order
// being built beside it (stacked behind a switch on phones), and the footer's buttons —
// "Dërgo" while something hasn't gone to a station yet, else "Paguaj".
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
  // One inline form at a time: move, handover, discount, comps.
  const [panel, setPanel] = useState(null);
  // The line being edited or voided, and the course new items go to.
  const [editKey, setEditKey] = useState(null);
  const [voidKey, setVoidKey] = useState(null);
  const [course, setCourse] = useState(0);
  const heading = useRef(null);
  // Wide enough for menu and order side by side; a phone keeps the Menuja / Porosia switch.
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const change = () => setWide(mq.matches);
    mq.addEventListener("change", change);
    return () => mq.removeEventListener("change", change);
  }, []);
  // Escape closes the popup, unless a menu, an inline form or the payment dialog is open.
  useEffect(() => {
    const escape = (e) => e.key === "Escape" && !menu && !panel && !document.querySelector("dialog[open]") && onClose();
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [menu, panel, onClose]);
  useEffect(() => (setMenu(null), setPanel(null), setEditKey(null), setVoidKey(null), setCourse(0)), [table.id]);
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
  const shiftOpen = Boolean(tableShift(state, table));
  const canAdd = shiftOpen && Boolean(ownerId) && !foreign;
  const qtyOf = new Map(table.lines.map((l) => [l.id, l.qty]));
  const fresh = (l) => l.qty - (l.sent || 0);
  const pending = table.lines.reduce((s, l) => s + fresh(l), 0);
  // What "Dërgo" sends now; what waits (on hold, or a course not started yet).
  const sendable = pendingUnits(table).reduce((s, l) => s + fresh(l), 0);
  const nextCourse = Math.min(
    ...table.lines.filter((l) => fresh(l) > 0 && !l.hold && l.course > (table.course || 1)).map((l) => l.course),
  );
  const waitingCourse = Number.isFinite(nextCourse) ? nextCourse : null;
  const waitingUnits = waitingCourse ? table.lines.filter((l) => fresh(l) > 0 && !l.hold && l.course === waitingCourse).reduce((s, l) => s + fresh(l), 0) : 0;
  const items = table.lines.reduce((s, l) => s + l.qty, 0);
  const b = bill(table);
  const isOwner = !isWaiter || table.waiter === user.waiterId;
  const tillName = (id) => state.pointsOfSale.find((k) => k.id === id)?.name;
  const here = posOf(state, table);
  const open = (name) => (setMenu(null), setPanel(panel === name ? null : name));
  const departmentOf = (id) => state.products.find((p) => p.id === id)?.department || "Tjetër";
  const lines = [...table.lines].sort((a, b) => (fresh(b) > 0) - (fresh(a) > 0));
  const [showHistory, setShowHistory] = useState(false);
  const tickets = state.tickets.filter((k) => k.table === table.id && !k.invoice && !k.cancelledAt && !k.void);
  // One chip per place preparing this order: its station (if stations are set up), else its department.
  const placeOf = (k) => (state.stations || []).find((x) => x.id === k.station)?.name || k.department;
  const stations = [...new Set(tickets.map(placeOf))].map((place) => {
    const own = tickets.filter((k) => placeOf(k) === place);
    return { key: place, department: own[0].department, label: place !== own[0].department ? place : null, ready: own.every((k) => k.doneAt) };
  });
  const minutes = hasOrder && table.occupiedSince
    ? Math.max(0, Math.round((Date.now() - new Date(table.occupiedSince)) / 60000))
    : null;
  // From the menu: a plain unit of the chosen course. From a line's "+": one more made the same way.
  const add = (productId, details = course ? { course } : {}) =>
    update("order.add", { tableId: table.id, productId, waiterId: ownerId, ...details });
  const sameAs = (l) => ({
    ...(l.course ? { course: l.course } : {}),
    ...(l.note ? { note: l.note } : {}),
    ...(l.allergy ? { allergy: l.allergy } : {}),
    ...(l.extras?.length ? { extras: l.extras.map((x) => x.name) } : {}),
    ...(l.hold ? { hold: true } : {}),
  });
  const remove = (line) => {
    // Every unit already at its station: a void needs a reason (and whether it was made).
    if (fresh(line) === 0) return setVoidKey(line.key);
    update("order.remove", { tableId: table.id, productId: line.id, lineKey: line.key });
  };
  const product = (id) => state.products.find((p) => p.id === id);
  const menuView = (
          <div className="menu-view">
            {/* Search, and — only for courses — which course new items go to. */}
            <div className="menu-tools">
              <Search label="Kërko produkt" placeholder="Kërko në menu…" value={query} onChange={setQuery} />
              <ChoiceField
                compact
                label="Kursi"
                value={String(course)}
                options={COURSES.map((c, i) => ({ value: String(i), label: c }))}
                onChange={(v) => setCourse(Number(v))}
              />
            </div>
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
                const off = p.available === false;
                const out = off || available(p) <= 0;
                return (
                  <button
                    key={p.id}
                    className={`menu-tile ${qty ? "in-order" : ""}`}
                    disabled={!canAdd || out}
                    aria-label={`Shto ${p.name}, ${money(p.price)}${qty ? `, ${qty} në porosi` : ""}`}
                    onClick={() => add(p.id)}
                  >
                    <span className="menu-tile-photo" aria-hidden="true">
                      {photoOf(p) ? <img src={photoOf(p)} alt="" loading="lazy" /> : <b>{p.name.slice(0, 1)}</b>}
                    </span>
                    <span className="menu-tile-name">{p.name}</span>
                    <span className="menu-tile-price">{off ? "Jo në dispozicion" : out ? "Pa stok" : money(p.price)}</span>
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
  );
  // Total and the next step (Paguaj / Dërgo): at the foot of the order column when the
  // menu sits beside it, at the bottom of the popup on a phone.
  const footer = hasOrder && (
        <div className="order-footer">
          <div className="order-footer-total">
            <span>
              {items} {items === 1 ? "artikull" : "artikuj"}
              {pending > 0 && <em> · {pending} pa dërguar</em>}
            </span>
            <strong>{money(b.remaining)}</strong>
          </div>
          {(b.comps > 0 || b.discount > 0 || b.paid > 0) && (
            <dl className="bill-lines" aria-label="Llogaria">
              {(b.comps > 0 || b.discount > 0) && (<><dt>Artikujt</dt><dd>{money(b.subtotal)}</dd></>)}
              {b.comps > 0 && (<><dt>Qerasje</dt><dd>−{money(b.comps)}</dd></>)}
              {b.discount > 0 && (<><dt>Ulje{table.discount?.kind === "percent" ? ` ${table.discount.value}%` : ""}</dt><dd>−{money(b.discount)}</dd></>)}
              <dt>Totali</dt><dd>{money(b.due)}</dd>
              {b.paid > 0 && (<><dt>Paguar</dt><dd>{money(b.paid)}</dd><dt className="bill-left">Mbetur</dt><dd className="bill-left">{money(b.remaining)}</dd></>)}
            </dl>
          )}
          <div className={`order-footer-actions ${sendable > 0 || waitingCourse ? "split" : ""}`}>
            {sendable > 0 ? (
              <>
                <button disabled={!shiftOpen || foreign} onClick={onPay}>
                  Paguaj
                </button>
                <button className="primary" disabled={!shiftOpen || foreign} onClick={() => onSend(table)}>
                  <Icon name="arrow" size={17} />
                  Dërgo në repartet · {sendable}
                </button>
              </>
            ) : waitingCourse ? (
              <>
                <button disabled={!shiftOpen || foreign} onClick={onPay}>
                  Paguaj
                </button>
                <button
                  className="primary"
                  disabled={!shiftOpen || foreign}
                  onClick={() => update("order.fire", { tableId: table.id, course: waitingCourse }, `filloi kursi: ${COURSES[waitingCourse]}.`)}
                >
                  <Icon name="arrow" size={17} />
                  Fillo: {COURSES[waitingCourse]} · {waitingUnits}
                </button>
              </>
            ) : (
              <button className="primary" disabled={!shiftOpen || foreign} onClick={onPay}>
                <Icon name="check" size={17} />
                Paguaj · {money(b.remaining)}
              </button>
            )}
          </div>
        </div>
  );
  const orderView = (
          <div className="order-view">
            {(table.allergy || table.note) && (
              <p className="order-note">
                {table.allergy && <b className="allergy-mark">ALERGJI: {table.allergy}</b>}
                {table.note && <span>{table.note}</span>}
              </p>
            )}
            {editKey && table.lines.some((l) => l.key === editKey) && (
              <LinePanel
                key={editKey}
                table={table}
                line={table.lines.find((l) => l.key === editKey)}
                product={product(table.lines.find((l) => l.key === editKey).id)}
                update={update}
                onClose={() => setEditKey(null)}
              />
            )}
            {voidKey && table.lines.some((l) => l.key === voidKey) && (
              <VoidPanel
                table={table}
                line={table.lines.find((l) => l.key === voidKey)}
                update={update}
                onClose={() => setVoidKey(null)}
              />
            )}
            {stations.length > 0 && (
              <div className="station-status" aria-label="Gjendja në repartet">
                {stations.map((s) => (
                  <span key={s.key} className={s.ready ? "ready" : ""}>
                    <DepartmentTag name={s.department} />
                    {s.label && <b>{s.label}</b>}
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
              // Printed like the bill it becomes: table, waiter and time on top, the lines,
              // and the total at the foot, on a strip of receipt paper.
              <div className="order-bill">
                <header className="order-bill-head">
                  <strong>Tavolina {String(table.id).padStart(2, "0")}</strong>
                  <span>{table.area}{owner ? ` · ${owner.name}` : ""}</span>
                  <span>{billDate(table.occupiedSince)}</span>
                </header>
              <ul className="order-list">
                {lines.map((l) => {
                  const unsent = fresh(l);
                  const locked = isWaiter && unsent === 0;
                  return (
                    <li key={l.key || l.id} className={unsent > 0 ? "fresh" : ""}>
                      <div className="order-item-main">
                        <button
                          type="button"
                          className="line-name"
                          disabled={foreign}
                          aria-label={`Ndrysho ${l.name}: shënim, shtesa, kurs`}
                          onClick={() => setEditKey(editKey === l.key ? null : l.key)}
                        >
                          {l.name}
                        </button>
                        {(l.extras?.length > 0 || l.note || l.allergy || l.course > 0 || (l.hold && unsent > 0)) && (
                          <span className="line-details">
                            {l.course > 0 && <span className="course-mark">{COURSES[l.course]}</span>}
                            {l.hold && unsent > 0 && <span className="hold-mark">Në pritje</span>}
                            {l.allergy && <b className="allergy-mark">ALERGJI: {l.allergy}</b>}
                            {l.extras?.map((x) => <span key={x.name}>+ {x.name}</span>)}
                            {l.note && <em>{l.note}</em>}
                          </span>
                        )}
                        <small>
                          <DepartmentTag name={departmentOf(l.id)} />
                          {l.comp > 0 && <span className="comp-mark">{l.comp} qerasur</span>}
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
                          onClick={() => remove(l)}
                        >
                          −
                        </button>
                        <span>{l.qty}</span>
                        <button
                          disabled={!canAdd || !product(l.id) || available(product(l.id)) <= 0}
                          aria-label={`Shto një ${l.name}`}
                          onClick={() => add(l.id, sameAs(l))}
                        >
                          +
                        </button>
                      </div>
                      <b>{money(l.price * (l.qty - (l.comp || 0)))}</b>
                    </li>
                  );
                })}
              </ul>
                <div className="order-bill-sum">
                  {(b.comps > 0 || b.discount > 0) && <p><span>Artikujt</span><span>{money(b.subtotal)}</span></p>}
                  {b.comps > 0 && <p><span>Qerasje</span><span>−{money(b.comps)}</span></p>}
                  {b.discount > 0 && <p><span>Ulje</span><span>−{money(b.discount)}</span></p>}
                  <p className="order-bill-total"><span>Totali</span><span>{money(b.due)}</span></p>
                  {b.paid > 0 && <p><span>Paguar</span><span>−{money(b.paid)}</span></p>}
                </div>
              </div>
            ) : (
              <Empty
                icon="coffee"
                title="Tavolina është bosh"
                action={
                  !wide && (
                    <button className="primary" onClick={() => setMode("add")}>
                      <Icon name="plus" size={16} /> Hap menunë
                    </button>
                  )
                }
              >
                {wide ? "Prekni një produkt majtas për ta shtuar në porosi." : "Shtoni produktet nga menuja."}
              </Empty>
            )}
            {hasOrder && showHistory && (
              <section className="order-history-panel" aria-label="Historiku i porosisë">
                <h3>Historiku</h3>
                <OrderHistory tableId={table.id} refreshKey={JSON.stringify(table.lines) + table.waiter} />
              </section>
            )}
          </div>
  );

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
            {/* The order: note, bill, history. */}
            {isOwner && (
              <button role="menuitem" onClick={() => open("note")}>
                <Icon name="edit" size={17} />
                Shënim / alergji
              </button>
            )}
            <button role="menuitem" onClick={() => (setMenu(null), onPrintBill(table))}>
              <Icon name="print" size={17} />
              Printo para-faturën
            </button>
            <button role="menuitem" onClick={() => (setMenu(null), setMode("summary"), setShowHistory(!showHistory))}>
              <Icon name="clock" size={17} />
              {showHistory ? "Fshih historikun" : "Historiku"}
            </button>
            {/* The table: where it sits and who serves it. */}
            {isOwner && <hr className="menu-sep" />}
            {isOwner && (
              <button role="menuitem" onClick={() => open("move")}>
                <Icon name="arrow" size={17} />
                Zhvendos ose bashko
              </button>
            )}
            {isOwner && (
              <button role="menuitem" onClick={() => open("handover")}>
                <Icon name="people" size={17} />
                Dorëzo te kolegu
              </button>
            )}
            {/* The manager's: money and cancellations. */}
            {!isWaiter && <hr className="menu-sep" />}
            {!isWaiter && (
              <button role="menuitem" onClick={() => open("comp")}>
                <Icon name="check" size={17} />
                Qerasje
              </button>
            )}
            {!isWaiter && (
              <button role="menuitem" onClick={() => open("discount")}>
                <Icon name="receipt" size={17} />
                {table.discount ? "Ndrysho uljen" : "Ulje"}
              </button>
            )}
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

        {panel === "move" && (
          <MovePanel
            state={state}
            table={table}
            here={here}
            tillName={tillName}
            onCancel={() => setPanel(null)}
            onMove={async (to, merge) => {
              const data = await update(
                "order.move",
                { tableId: table.id, toTableId: to, merge },
                merge ? `llogaria u bashkua me Tavolinën ${to}.` : `porosia kaloi te Tavolina ${to}.`,
              );
              if (data) (setPanel(null), onClose());
            }}
          />
        )}
        {panel === "handover" && (
          <form
            className="stack-form order-panel"
            onSubmit={async (e) => {
              e.preventDefault();
              const waiterId = Number(new FormData(e.currentTarget).get("waiterId"));
              const name = state.waiters.find((w) => w.id === waiterId)?.name;
              if (await update("order.handover", { tableId: table.id, waiterId }, `tavolina iu dorëzua ${name}.`)) setPanel(null);
            }}
          >
            <ChoiceField
              label="Dorëzo te"
              name="waiterId"
              options={state.waiters
                .filter((w) => w.active && w.id !== table.waiter && (!w.posId || w.posId === here))
                .map((w) => ({ value: String(w.id), label: w.name }))}
            />
            <p className="helper">Kolegu e merr tavolinën me gjithë porosinë dhe pagesat e bëra.</p>
            <div className="actions">
              <button type="button" onClick={() => setPanel(null)}>Kthehu</button>
              <button className="primary">Dorëzo</button>
            </div>
          </form>
        )}
        {panel === "discount" && (
          <form
            className="stack-form order-panel"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const payload = { tableId: table.id, kind: f.get("kind"), value: Number(f.get("value")), reason: f.get("reason") || "" };
              if (await update("order.discount", payload, payload.value ? "ulja u vendos." : "ulja u hoq.")) setPanel(null);
            }}
          >
            <ChoiceField
              label="Lloji i uljes"
              name="kind"
              defaultValue={table.discount?.kind || "percent"}
              options={[
                { value: "percent", label: "Përqindje (%)" },
                { value: "amount", label: "Shumë (Lek)" },
              ]}
            />
            <Field label="Vlera (0 e heq uljen)" name="value" type="number" min="0" required defaultValue={table.discount?.value ?? ""} autoFocus />
            <Field label="Arsyeja" name="reason" maxLength={120} defaultValue={table.discount?.reason || ""} placeholder="p.sh. klient i rregullt" />
            <div className="actions">
              <button type="button" onClick={() => setPanel(null)}>Kthehu</button>
              <button className="primary">Ruaj uljen</button>
            </div>
          </form>
        )}

        {panel === "note" && <OrderNotePanel table={table} state={state} update={update} onClose={() => setPanel(null)} />}
        {panel === "comp" && (
          <CompPanel table={table} update={update} onClose={() => setPanel(null)} />
        )}

        {!wide && (
        <div className="order-segment" role="tablist" aria-label="Pamja e porosisë">
          <button role="tab" aria-selected={mode === "add"} onClick={() => setMode("add")}>
            Menuja
          </button>
          <button role="tab" aria-selected={mode === "summary"} onClick={() => setMode("summary")}>
            Porosia
            {items > 0 && <span className="segment-count">{items}</span>}
          </button>
        </div>
        )}

        {wide ? (
          <div className="order-split">
            <div className="order-split-menu">{menuView}</div>
            <div className="order-split-order" aria-label="Porosia">
              <div className="order-split-scroll">{orderView}</div>
              {footer}
            </div>
          </div>
        ) : mode === "add" ? (
          menuView
        ) : (
          orderView
        )}
      </div>

      {!wide && footer}
    </section>
  );
}

// Where the order goes: an empty table takes it; a table with an order merges the two
// bills, after a second tap. Between tills it says where the bill will be paid.
function MovePanel({ state, table, here, tillName, onCancel, onMove }) {
  const [to, setTo] = useState("");
  const target = state.tables.find((t) => t.id === Number(to));
  const otherTill = target && posOf(state, target) !== here;
  const options = state.tables
    .filter((t) => t.active && t.id !== table.id)
    .map((t) => ({
      value: String(t.id),
      label: `Tavolina ${String(t.id).padStart(2, "0")} · ${t.area}${t.lines.length ? " · ka porosi" : " · e lirë"}`,
    }));
  return (
    <div className="stack-form order-panel">
      <ChoiceField label="Zhvendos te" value={to} options={[{ value: "", label: "Zgjidhni tavolinën" }, ...options]} onChange={setTo} />
      {target && (
        <p className="helper">
          {target.lines.length
            ? `Tavolina ${target.id} ka porosinë e vet: dy llogaritë bashkohen në një.`
            : `Porosia, pagesat dhe fletët e reparteve kalojnë te Tavolina ${target.id}.`}
          {otherTill &&
            ` Tavolina ${target.id} i përket kasës "${tillName(posOf(state, target))}": llogaria do të paguhet atje.${
              table.payments?.length ? " Kjo llogari ka pagesa të pjesshme, prandaj nuk mund të kalojë në kasë tjetër." : ""
            }${!shiftFor(state, posOf(state, target)) ? " Ajo kasë nuk ka turn të hapur." : ""}`}
        </p>
      )}
      <div className="actions">
        <button type="button" onClick={onCancel}>Kthehu</button>
        <button className="primary" disabled={!target} onClick={() => onMove(target.id, target.lines.length > 0)}>
          {target?.lines.length ? "Bashko llogaritë" : "Zhvendos"}
        </button>
      </div>
    </div>
  );
}

// Comps (qerasje), manager only: one reason, then +/− per line. Kept off the order lines
// so every line reads the same.
function CompPanel({ table, update, onClose }) {
  const [reason, setReason] = useState("");
  const comp = (l, delta) =>
    update("order.comp", { tableId: table.id, productId: l.id, delta, ...(delta > 0 && { reason }) }, delta > 0 ? `1 × ${l.name} u qeras.` : `hoqi 1 qerasje.`);
  return (
    <div className="stack-form order-panel">
      <Field label="Arsyeja e qerasjes" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} placeholder="p.sh. ditëlindje" autoFocus />
      <ul className="comp-list">
        {table.lines.map((l) => (
          <li key={l.key || l.id}>
            <span>{l.name}</span>
            <small>{l.comp || 0}/{l.qty} qerasur</small>
            <div className="quantity">
              <button type="button" aria-label={`Hiq 1 qerasje nga ${l.name}`} disabled={!l.comp} onClick={() => comp(l, -1)}>−</button>
              <span>{l.comp || 0}</span>
              <button type="button" aria-label={`Qeras 1 ${l.name}`} disabled={(l.comp || 0) >= l.qty || reason.trim().length < 3} onClick={() => comp(l, 1)}>+</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="actions">
        <button type="button" onClick={onClose}>Mbyll</button>
      </div>
    </div>
  );
}

// A line's details. Before sending: just corrected. After: a reason, and the station gets
// a correction slip; "Ripërgatit" sends a remake (the first one is a loss).
function LinePanel({ table, line, product, update, onClose }) {
  const unsent = line.qty - (line.sent || 0);
  const [one, setOne] = useState(false);
  const extras = product?.extras || [];
  const save = async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const payload = {
      tableId: table.id,
      lineKey: line.key,
      note: f.get("note") || "",
      allergy: f.get("allergy") || "",
      extras: f.getAll("extras"),
      ...(line.sent ? {} : { course: Number(f.get("course") || 0) }),
      ...(unsent ? { hold: f.get("hold") === "on" } : {}),
      ...(one ? { one: true, course: Number(f.get("course") || 0) } : {}),
      ...(f.get("reason") ? { reason: f.get("reason") } : {}),
    };
    if (await update("order.edit", payload, `${line.name}: u ndryshua.`)) onClose();
  };
  return (
    <form className="stack-form order-panel line-panel" onSubmit={save}>
      <strong>{line.name}</strong>
      {line.qty > 1 && unsent > 0 && (
        <label className="check-row">
          <input type="checkbox" checked={one} onChange={(e) => setOne(e.target.checked)} />
          Vetëm për 1 copë (rresht më vete)
        </label>
      )}
      <Field label="Shënim" name="note" defaultValue={line.note || ""} maxLength={200} placeholder="p.sh. pa qepë, mesatar" />
      <Field label="Alergji" name="allergy" defaultValue={line.allergy || ""} maxLength={200} placeholder="p.sh. arra, gluten" />
      {extras.length > 0 && (
        <fieldset className="printer-choice">
          <legend>Variante dhe shtesa</legend>
          {extras.map((x) => (
            <label key={x.name}>
              <input type="checkbox" name="extras" value={x.name} defaultChecked={(line.extras || []).some((y) => y.name === x.name)} />
              {x.name}
              {x.price > 0 && <small> +{money(x.price)}</small>}
            </label>
          ))}
        </fieldset>
      )}
      {(!line.sent || one) && (
        <ChoiceField
          label="Kursi"
          name="course"
          defaultValue={String(line.course || 0)}
          options={COURSES.map((c, i) => ({ value: String(i), label: c }))}
        />
      )}
      {unsent > 0 && (
        <label className="check-row">
          <input type="checkbox" name="hold" defaultChecked={Boolean(line.hold)} />
          Mbaje në pritje (nuk dërgohet derisa ta lëshoni)
        </label>
      )}
      {line.sent > 0 && !one && (
        <Field
          label={`Arsyeja (${line.sent} copë janë te reparti: merr njoftim)`}
          name="reason"
          maxLength={200}
          placeholder="p.sh. klienti ndryshoi kërkesën"
        />
      )}
      <div className="actions">
        <button type="button" onClick={onClose}>Mbyll</button>
        {line.sent > 0 && (
          <button
            type="button"
            onClick={async (e) => {
              const reason = e.currentTarget.form.elements.reason?.value || "";
              if (await update("order.remake", { tableId: table.id, lineKey: line.key, reason }, `1 × ${line.name} po ripërgatitet.`)) onClose();
            }}
          >
            Ripërgatit 1
          </button>
        )}
        <button className="primary">Ruaj</button>
      </div>
    </form>
  );
}

// Voiding a unit the station already has: why, and whether it was already made (a loss).
function VoidPanel({ table, line, update, onClose }) {
  return (
    <form
      className="stack-form order-panel"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const payload = { tableId: table.id, productId: line.id, lineKey: line.key, reason: f.get("reason"), prepared: f.get("prepared") === "yes" };
        if (await update("order.remove", payload, `1 × ${line.name} u anulua; reparti u njoftua.`)) onClose();
      }}
    >
      <strong>Anulo 1 × {line.name}</strong>
      <Field label="Arsyeja" name="reason" minLength={3} maxLength={200} required placeholder="p.sh. klienti ndryshoi mendje" autoFocus />
      <div className="payment-methods" role="radiogroup" aria-label="A ishte përgatitur?">
        <label className="refund-method">
          <input type="radio" name="prepared" value="no" defaultChecked />
          Ende jo: ndaloni përgatitjen
        </label>
        <label className="refund-method">
          <input type="radio" name="prepared" value="yes" />
          Po: hidhet (humbje stoku)
        </label>
      </div>
      <div className="actions">
        <button type="button" onClick={onClose}>Kthehu</button>
        <button className="danger-button">Anulo 1 copë</button>
      </div>
    </form>
  );
}

// The order's own note and allergy; once anything is at a station, a change needs a
// reason and every station is told.
function OrderNotePanel({ table, state, update, onClose }) {
  const sent = state.tickets.some((k) => k.table === table.id && !k.invoice && !k.cancelledAt);
  return (
    <form
      className="stack-form order-panel"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const payload = { tableId: table.id, note: f.get("note") || "", allergy: f.get("allergy") || "", ...(f.get("reason") ? { reason: f.get("reason") } : {}) };
        if (await update("order.note", payload, "shënimi i porosisë u ruajt.")) onClose();
      }}
    >
      <Field label="Shënim për porosinë" name="note" defaultValue={table.note || ""} maxLength={200} placeholder="p.sh. ditëlindje, sillni tortën në fund" autoFocus />
      <Field label="Alergji (vlen për gjithë tavolinën)" name="allergy" defaultValue={table.allergy || ""} maxLength={200} placeholder="p.sh. celiak" />
      {sent && <Field label="Arsyeja (repartet marrin njoftim)" name="reason" maxLength={200} />}
      <div className="actions">
        <button type="button" onClick={onClose}>Kthehu</button>
        <button className="primary">Ruaj</button>
      </div>
    </form>
  );
}
