import React, { useEffect, useRef, useState } from "react";
import { Icon } from "./icons.jsx";
import { Stepper } from "./Dish.jsx";
import { price, unit, reducedMotion } from "./text.js";

// The basket, floating above the home indicator once something is in it.
export function BasketCapsule({ count, total, bump, onOpen, t }) {
  return (
    <button className="capsule basket" key={bump} onClick={onOpen}>
      <span className="capsule-count">{count}</span>
      <span className="capsule-label">{t.view}</span>
      <strong>{price(total)}</strong>
    </button>
  );
}

// The latest order's status, where the guest's eyes are while they keep browsing.
export function StatusCapsule({ order, raised, onDismiss, onOpen, t }) {
  const text = order.status === "pending" ? t.pending : order.status === "accepted" ? t.accepted : `${t.rejected}${order.reason ? `: ${order.reason}` : ""}`;
  return (
    <div className={`capsule status ${order.status} ${raised ? "raised" : ""}`} role="status">
      <span className="status-mark">
        {order.status === "accepted" ? <Icon name="check" size={15} /> : order.status === "rejected" ? <Icon name="alert" size={16} /> : null}
      </span>
      <button className="capsule-label status-open" onClick={onOpen}>{text}</button>
      {order.status !== "pending" && (
        <button aria-label={t.close} onClick={onDismiss}>
          <Icon name="close" size={18} />
        </button>
      )}
    </div>
  );
}

// A sheet that rises from the bottom and can be pulled back down by its grabber,
// following the finger 1:1 and closing on a far or fast enough pull.
export function Sheet({ open, onClose, label, children }) {
  const dialog = useRef(null);
  const [dy, setDy] = useState(0);
  const drag = useRef(null);
  useEffect(() => {
    if (open && !dialog.current.open) {
      setDy(0);
      dialog.current.showModal();
    }
  }, [open]);
  const dismiss = () => {
    if (reducedMotion()) return dialog.current.close();
    setDy(window.innerHeight);
    setTimeout(() => dialog.current?.close(), 240);
  };
  const handlers = {
    onPointerDown: (e) => {
      drag.current = { y: e.clientY, t: e.timeStamp, v: 0 };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e) => {
      if (!drag.current) return;
      const d = e.clientY - drag.current.y;
      drag.current.v = (d - (drag.current.last ?? 0)) / Math.max(1, e.timeStamp - (drag.current.lt ?? drag.current.t));
      drag.current.last = d;
      drag.current.lt = e.timeStamp;
      // Upward resists; downward follows the finger.
      setDy(d > 0 ? d : -Math.sqrt(-d) * 2);
    },
    onPointerUp: () => {
      const { last = 0, v } = drag.current || {};
      drag.current = null;
      if (last > 140 || v > 0.6) dismiss();
      else setDy(0);
    },
  };
  return (
    <dialog
      ref={dialog}
      className={`sheet ${drag.current ? "dragging" : ""}`}
      aria-label={label}
      style={{ transform: dy ? `translateY(${dy}px)` : undefined }}
      onClose={onClose}
      onCancel={(e) => (e.preventDefault(), dismiss())}
      onClick={(e) => e.target === e.currentTarget && dismiss()}
    >
      <div className="sheet-grab" {...handlers}>
        <span />
      </div>
      {children(dismiss)}
    </dialog>
  );
}

// Sent, the sheet closes on its own: the status capsule below takes over the news.
export function BasketContent({ lines, productOf, total, setQty, sending, error, onSend, t, tr }) {
  const [note, setNote] = useState("");
  return (
    <div className="sheet-body">
      <h2>{t.yourOrder}</h2>
      {lines.length ? (
        <ul className="basket-lines">
          {lines.map((l) => {
            const p = productOf(l.productId);
            return (
              <li key={l.uid}>
                <span className="basket-name">
                  <strong>{tr(p.name, p.nameEn)}</strong>
                  {(l.extras.length > 0 || l.note) && <small>{[l.extras.join(", "), l.note && `“${l.note}”`].filter(Boolean).join(" · ")}</small>}
                  <small className="basket-amount">{price(l.qty * unit(p, l.extras))}</small>
                </span>
                <Stepper value={l.qty} min={0} onChange={(qty) => setQty(l.uid, qty)} t={t} />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="basket-empty">{t.empty}</p>
      )}
      {lines.length > 0 && (
        <>
          <label className="plate-note">
            <span>{t.orderNote}</span>
            <input value={note} maxLength={200} placeholder={t.orderNotePlaceholder} onChange={(e) => setNote(e.target.value)} />
          </label>
          <p className="basket-total">
            <span>{t.total}</span>
            <strong>{price(total)}</strong>
          </p>
          {error && <p className="basket-error" role="alert">{error}</p>}
          <button className="primary wide" disabled={sending} onClick={() => onSend(note.trim())}>
            {sending ? t.sending : t.send}
          </button>
          <p className="basket-hint">{t.confirmHint}</p>
        </>
      )}
    </div>
  );
}

// Everything this phone ordered at this table, newest first, with where each order is.
export function MyOrders({ placed, productOf, t, tr, lang }) {
  const time = (at) => new Date(at).toLocaleTimeString(lang === "en" ? "en-GB" : "sq-AL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const sent = placed.filter((o) => o.status !== "rejected");
  return (
    <div className="sheet-body">
      <h2>{t.myOrders}</h2>
      <p className="basket-hint left">{t.myOrdersHint}</p>
      {[...placed].reverse().map((o) => (
        <section className={`my-order ${o.status}`} key={o.id}>
          <header>
            <strong>{t.orderNo} {time(o.at)}</strong>
            <span className="my-order-state">
              {o.status === "accepted" ? <Icon name="check" size={14} /> : o.status === "rejected" ? <Icon name="alert" size={14} /> : null}
              {o.status === "accepted" ? t.stateSent : o.status === "rejected" ? t.stateRejected : t.stateWaiting}
            </span>
          </header>
          {o.reason && <p className="my-order-reason">{o.reason}</p>}
          <ul>
            {(o.items || []).map((i, n) => {
              const p = productOf(i.productId);
              return (
                <li key={n}>
                  <span><b>{i.qty} ×</b> {p ? tr(p.name, p.nameEn) : "—"}{i.extras.length > 0 && <small> · {i.extras.join(", ")}</small>}</span>
                  {p && <span className="my-order-amount">{price(i.qty * unit(p, i.extras))}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="basket-total">
        <span>{t.soFar}</span>
        <strong>{price(sent.reduce((s, o) => s + (o.total || 0), 0))}</strong>
      </p>
      <p className="basket-hint">{t.estimate}</p>
    </div>
  );
}
