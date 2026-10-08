import React, { useState } from "react";
import * as m from "motion/react-m";
import { AnimatePresence } from "motion/react";
import clsx from "clsx";
import { Icon } from "./icons.jsx";
import { price, unit } from "./text.js";

const press = { type: "spring", stiffness: 520, damping: 22 };

// A printed form stepper: [−] n [+].
export function Stepper({ value, onChange, min = 1, t }) {
  return (
    <span className="stepper">
      <button type="button" aria-label={t.less} disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Icon name="minus" size={18} />
      </button>
      <span className="stepper-value" aria-live="polite">{value}</span>
      <button type="button" aria-label={t.more} disabled={value >= 20} onClick={() => onChange(value + 1)}>
        <Icon name="plus" size={18} />
      </button>
    </span>
  );
}

// The quantity box at the start of every ruled line: tapping it writes the dish onto the
// check, and the number is stamped into the box.
function QtyBox({ count, name, onPress, t }) {
  return (
    <button className={clsx("qty-box", count > 0 && "filled")} aria-label={`${t.add} ${name}${count ? ` (${t.inOrder(count)})` : ""}`} onClick={onPress}>
      <AnimatePresence initial={false} mode="popLayout">
        {count > 0 ? (
          <m.span key={count} className="qty-mark" initial={{ scale: 1.9, rotate: -14, opacity: 0 }} animate={{ scale: 1, rotate: -4, opacity: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={press}>
            {count}
          </m.span>
        ) : (
          <m.span key="plus" className="qty-plus" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Icon name="plus" size={16} />
          </m.span>
        )}
      </AnimatePresence>
    </button>
  );
}

// One dish as a ruled line of the pad. Opened, the line unfolds into a slip right where
// it is (a shared layout animation), with extras as form checkboxes, a note and the quantity.
export function Line({ product: p, photo, open, onToggle, canOrder, count, onQuickAdd, onAdd, t, tr }) {
  const name = tr(p.name, p.nameEn);
  const description = tr(p.description, p.descriptionEn);
  return (
    <m.li layout="position" className={clsx("line", !p.available && "sold-out", open && "open")} id={`line-${p.id}`}>
      <div className="line-row">
        {canOrder && p.available ? (
          <QtyBox count={count} name={name} t={t} onPress={() => (p.extras.length ? !open && onToggle() : onQuickAdd())} />
        ) : (
          <span className="qty-box blank" aria-hidden="true" />
        )}
        <button className="line-body" aria-expanded={open} onClick={onToggle}>
          <span className="line-text">
            <strong>{name}</strong>
            {description && !open && <span className="line-desc">{description}</span>}
            {!p.available && <span className="line-sold">{t.soldOut}</span>}
          </span>
          {photo && !open && <m.img layoutId={`photo-${p.id}`} className="line-photo" src={photo} alt="" loading="lazy" width="64" height="64" />}
          <span className="line-price">{price(p.price)}</span>
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <Slip key="slip" p={p} photo={photo} name={name} description={description} canOrder={canOrder && p.available} onAdd={onAdd} onToggle={onToggle} t={t} />
        )}
      </AnimatePresence>
    </m.li>
  );
}

function Slip({ p, photo, name, description, canOrder, onAdd, onToggle, t }) {
  const [qty, setQty] = useState(1);
  const [extras, setExtras] = useState([]);
  const [note, setNote] = useState("");
  const toggleExtra = (x) => setExtras((list) => (list.includes(x) ? list.filter((n) => n !== x) : [...list, x]));
  return (
    <m.div
      className="slip"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 36 }}
    >
      <div className="slip-inner">
        {photo && <m.img layoutId={`photo-${p.id}`} className="slip-photo" src={photo} alt={name} />}
        {description && <p className="slip-desc">{description}</p>}
        {p.extras.length > 0 && (
          <fieldset className="slip-extras" disabled={!canOrder}>
            <legend>{t.extras}</legend>
            {p.extras.map((x) => (
              <button type="button" key={x.name} role="checkbox" aria-checked={extras.includes(x.name)} onClick={() => toggleExtra(x.name)}>
                <span className="form-check"><Icon name="check" size={15} /></span>
                <span className="extra-name">{x.name}</span>
                {x.price > 0 && <span className="extra-price">+{price(x.price)}</span>}
              </button>
            ))}
          </fieldset>
        )}
        {canOrder && (
          <>
            <label className="write-line">
              <span>{t.note}</span>
              <input value={note} maxLength={120} placeholder={t.notePlaceholder} onChange={(e) => setNote(e.target.value)} />
            </label>
            <div className="slip-actions">
              <Stepper value={qty} onChange={setQty} t={t} />
              <button
                className="stamp-button"
                onClick={() => onAdd({ qty, extras: p.extras.filter((x) => extras.includes(x.name)).map((x) => x.name), note: note.trim() })}
              >
                {t.add} · {price(qty * unit(p, extras))}
              </button>
            </div>
          </>
        )}
        <button className="slip-close" onClick={onToggle}>
          <Icon name="chevronDown" size={18} style={{ rotate: "180deg" }} /> {t.collapse}
        </button>
      </div>
    </m.div>
  );
}
