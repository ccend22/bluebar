import React, { useState } from "react";
import { Icon } from "./icons.jsx";
import { price, unit } from "./text.js";

export function Stepper({ value, onChange, min = 1, t }) {
  return (
    <span className="stepper">
      <button type="button" aria-label={t.less} disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Icon name="minus" size={18} />
      </button>
      <span aria-live="polite">{value}</span>
      <button type="button" aria-label={t.more} disabled={value >= 20} onClick={() => onChange(value + 1)}>
        <Icon name="plus" size={18} />
      </button>
    </span>
  );
}

// One dish. Closed, it is a row with its photo on the right; tapped, it grows into the
// whole plate right where it is (the photo morphs, see Menu's toggle), with its extras,
// a note, the quantity and Add. Only the open dish carries a view-transition name.
export function Dish({ product: p, photo, open, morph, onToggle, canOrder, inCart, onQuickAdd, onAdd, t, tr }) {
  const name = tr(p.name, p.nameEn);
  const description = tr(p.description, p.descriptionEn);
  const transition = morph ? { viewTransitionName: "dish-photo" } : undefined;
  const add = canOrder && p.available && (
    <button
      className={`dish-add ${photo ? "" : "bare"} ${inCart ? "counted" : ""}`}
      aria-label={`${t.add} ${name}`}
      // With extras to choose the dish opens first; otherwise straight into the order.
      onClick={() => (p.extras.length ? onToggle() : onQuickAdd())}
    >
      {inCart ? <span>{inCart}</span> : <Icon name="plus" size={20} />}
    </button>
  );
  const priceTag = p.available ? <span className="dish-price">{price(p.price)}</span> : <span className="dish-sold">{t.soldOut}</span>;
  if (!open)
    return (
      <li className={`dish ${p.available ? "" : "sold-out"}`}>
        <button className="dish-row" aria-expanded="false" onClick={onToggle}>
          <span className="dish-text">
            <strong>{name}</strong>
            {description && <span className="dish-desc">{description}</span>}
            {priceTag}
          </span>
          {photo && <img className="dish-thumb" src={photo} alt="" loading="lazy" width="96" height="96" style={transition} />}
        </button>
        {add}
      </li>
    );
  return <Plate p={p} photo={photo} name={name} description={description} transition={transition} {...{ onToggle, canOrder, onAdd, t }} />;
}

function Plate({ p, photo, name, description, transition, onToggle, canOrder, onAdd, t }) {
  const [qty, setQty] = useState(1);
  const [extras, setExtras] = useState([]);
  const [note, setNote] = useState("");
  const toggleExtra = (x) => setExtras((list) => (list.includes(x) ? list.filter((n) => n !== x) : [...list, x]));
  return (
    <li className={`dish open ${photo ? "" : "no-photo"}`} id={`dish-${p.id}`}>
      <div className="plate-media">
        {photo && <img className="plate-photo" src={photo} alt={name} style={transition} />}
        <button className="plate-close" aria-label={t.collapse} onClick={onToggle}>
          <Icon name="chevronDown" size={20} />
        </button>
      </div>
      <div className="plate-body">
        <h3>{name}</h3>
        <p className="plate-price">{p.available ? price(p.price) : t.soldOut}</p>
        {description && <p className="plate-desc">{description}</p>}
        {p.extras.length > 0 && (
          <fieldset className="plate-extras" disabled={!canOrder}>
            <legend>{t.extras}</legend>
            {p.extras.map((x) => (
              <button type="button" key={x.name} role="checkbox" aria-checked={extras.includes(x.name)} onClick={() => toggleExtra(x.name)}>
                <span className="extra-check"><Icon name="check" size={15} /></span>
                <span className="extra-name">{x.name}</span>
                {x.price > 0 && <span className="extra-price">+{price(x.price)}</span>}
              </button>
            ))}
          </fieldset>
        )}
        {canOrder && p.available && (
          <>
            <label className="plate-note">
              <span>{t.note}</span>
              <input value={note} maxLength={120} placeholder={t.notePlaceholder} onChange={(e) => setNote(e.target.value)} />
            </label>
            <div className="plate-actions">
              <Stepper value={qty} onChange={setQty} t={t} />
              <button
                className="primary"
                onClick={() => onAdd({ qty, extras: p.extras.filter((x) => extras.includes(x.name)).map((x) => x.name), note: note.trim() })}
              >
                {t.add} · {price(qty * unit(p, extras))}
              </button>
            </div>
          </>
        )}
      </div>
    </li>
  );
}
