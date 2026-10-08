import React, { useEffect, useRef, useState } from "react";
import * as m from "motion/react-m";
import { AnimatePresence, useDragControls, useReducedMotion } from "motion/react";
import NumberFlow from "@number-flow/react";
import clsx from "clsx";
import { Icon } from "./icons.jsx";
import { Stepper } from "./Line.jsx";
import { clock, price, unit } from "./text.js";

const lek = { maximumFractionDigits: 0 };
const sheetSpring = { type: "spring", stiffness: 420, damping: 40 };

// The torn-off stub of the check, docked at the bottom once something is written on it.
export function Stub({ count, total, onOpen, table, t }) {
  return (
    <m.button
      className="stub"
      onClick={onOpen}
      aria-label={t.checkOpen}
      initial={{ y: 120 }}
      animate={{ y: 0 }}
      exit={{ y: 120 }}
      transition={sheetSpring}
      whileTap={{ scale: 0.98 }}
    >
      <span className="stub-label">
        {t.check}
        {table && <small>{t.table} {String(table).padStart(2, "0")}</small>}
      </span>
      <span className="stub-count form-box"><small>{t.qty}</small><NumberFlow value={count} /></span>
      <strong className="stub-total"><NumberFlow value={total} locales="sq-AL" format={lek} suffix=" Lek" /></strong>
      <Icon name="chevronDown" size={18} style={{ rotate: "180deg" }} />
    </m.button>
  );
}

// A sheet of pad paper rising from the bottom. It follows the finger from its grabber
// (drag with the release velocity) and closes on a far or fast pull.
export function Sheet({ open, onClose, label, tearing = false, children }) {
  const dialog = useRef(null);
  const controls = useDragControls();
  const reduce = useReducedMotion();
  useEffect(() => {
    if (open && !dialog.current.open) dialog.current.showModal();
  }, [open]);
  return (
    <dialog ref={dialog} className="sheet" aria-label={label} onCancel={(e) => (e.preventDefault(), onClose())} onClick={(e) => e.target === e.currentTarget && onClose()}>
      {/* The dialog closes only once the paper has slid away. */}
      <AnimatePresence onExitComplete={() => dialog.current?.close()}>
        {open && (
          <m.div
            className="sheet-paper"
            initial={{ y: reduce ? 0 : "100%", opacity: reduce ? 0 : 1 }}
            // Sent: the whole sheet, perforated edge and all, is torn off the pad and leaves upward.
            animate={tearing ? { y: "-115vh", rotate: -3, opacity: 1 } : { y: 0, rotate: 0, opacity: 1 }}
            transition={tearing ? { duration: 0.45, ease: [0.55, 0, 0.85, 0.35] } : sheetSpring}
            exit={tearing ? { opacity: 0, transition: { duration: 0 } } : { y: reduce ? 0 : "100%", opacity: reduce ? 0 : 1 }}
            drag="y"
            dragListener={false}
            dragControls={controls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.9 }}
            onDragEnd={(_, info) => (info.offset.y > 140 || info.velocity.y > 700) && onClose()}
          >
            {/* The perforated top edge is where the paper is held: pull it down to put it away. */}
            <div className="sheet-edge" onPointerDown={(e) => controls.start(e)} aria-hidden="true" />
            <div className="sheet-scroll">{children}</div>
          </m.div>
        )}
      </AnimatePresence>
    </dialog>
  );
}

// The guest check itself: ruled columns, the total, and sending, which tears it off.
export function CheckContent({ lines: live, productOf, total: liveTotal, setQty, sending, error, onSend, table, t, tr }) {
  const [note, setNote] = useState("");
  // While the sent check tears away it keeps showing what was written on it.
  const [frozen, setFrozen] = useState(null);
  const lines = frozen?.lines || live;
  const total = frozen?.total ?? liveTotal;
  const send = async () => {
    setFrozen({ lines: live, total: liveTotal });
    if (!(await onSend(note.trim()))) setFrozen(null);
  };
  return (
    <div className="check">
      <header className="check-head">
        <h2>{t.check}</h2>
        <div className="form-boxes">
          {table && <span className="form-box"><small>{t.table}</small>{String(table).padStart(2, "0")}</span>}
          <span className="form-box"><small>{t.time}</small>{clock(Date.now())}</span>
        </div>
      </header>
      {lines.length ? (
        <>
          <div className="check-cols" aria-hidden="true">
            <span>{t.qty}</span><span>{t.item}</span><span>{t.price}</span>
          </div>
          <ul className="check-lines">
            <AnimatePresence initial={false}>
              {lines.map((l) => {
                const p = productOf(l.productId);
                return (
                  <m.li key={l.uid} layout initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }} transition={sheetSpring}>
                    <Stepper value={l.qty} min={0} onChange={(qty) => setQty(l.uid, qty)} t={t} />
                    <span className="check-item">
                      <strong>{tr(p.name, p.nameEn)}</strong>
                      {(l.extras.length > 0 || l.note) && <small>{[l.extras.join(", "), l.note && `“${l.note}”`].filter(Boolean).join(" · ")}</small>}
                    </span>
                    <span className="check-amount"><NumberFlow value={l.qty * unit(p, l.extras)} locales="sq-AL" format={lek} /></span>
                  </m.li>
                );
              })}
            </AnimatePresence>
          </ul>
          <label className="write-line">
            <span>{t.orderNote}</span>
            <input value={note} maxLength={200} placeholder={t.orderNotePlaceholder} onChange={(e) => setNote(e.target.value)} />
          </label>
          <p className="check-total">
            <span>{t.total}</span>
            <strong><NumberFlow value={total} locales="sq-AL" format={lek} suffix=" Lek" /></strong>
          </p>
          {error && <p className="check-error" role="alert">{error}</p>}
          <button className="stamp-button wide" disabled={sending} onClick={send}>
            {sending ? t.sending : t.send}
          </button>
          <p className="check-hint">{t.sentHint}</p>
        </>
      ) : (
        <p className="check-empty">{t.empty}</p>
      )}
    </div>
  );
}

// The carbon copies left on the pad: every order sent from this phone, newest on top,
// each stamped with where it is.
export function Copies({ placed, productOf, t, tr }) {
  const sent = placed.filter((o) => o.status !== "rejected");
  const stamp = { accepted: t.stampSent, pending: t.stampWaiting, rejected: t.stampRejected };
  return (
    <div className="copies">
      <h2>{t.copies}</h2>
      <p className="check-hint left">{t.copiesHint}</p>
      {[...placed].reverse().map((o) => (
        <section className={clsx("copy", o.status)} key={o.id}>
          <header>
            <strong>{t.check} Nr. {o.id} · {clock(o.at)}</strong>
            <span className="rubber-stamp">{stamp[o.status]}</span>
          </header>
          {o.reason && <p className="copy-reason">{o.reason}</p>}
          <ul>
            {(o.items || []).map((i, n) => {
              const p = productOf(i.productId);
              return (
                <li key={n}>
                  <span className="copy-qty">{i.qty}</span>
                  <span className="copy-item">{p ? tr(p.name, p.nameEn) : "—"}{i.extras.length > 0 && <small> · {i.extras.join(", ")}</small>}</span>
                  {p && <span className="copy-amount">{price(i.qty * unit(p, i.extras))}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="check-total">
        <span>{t.soFar}</span>
        <strong>{price(sent.reduce((s, o) => s + (o.total || 0), 0))}</strong>
      </p>
      <p className="check-hint">{t.estimate}</p>
    </div>
  );
}
