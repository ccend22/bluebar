import React, { useEffect, useRef, useState } from "react";
import * as m from "motion/react-m";
import { AnimatePresence, animate, useMotionValue, useReducedMotion } from "motion/react";
import clsx from "clsx";
import { Icon } from "./icons.jsx";
import { unit } from "./text.js";

const pop = { type: "spring", stiffness: 520, damping: 22 };
// The plate's flight between the card and the dish's page.
const fly = { type: "spring", stiffness: 260, damping: 30 };

// A rounded stepper: [−] n [+].
export function Stepper({ value, onChange, min = 1, t }) {
  return (
    <span className="stepper">
      <button type="button" aria-label={t.less} disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Icon name="minus" size={18} />
      </button>
      <span className="stepper-value" aria-live="polite">
        <AnimatePresence initial={false} mode="popLayout">
          <m.span key={value} initial={{ y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 14, opacity: 0 }} transition={pop}>{value}</m.span>
        </AnimatePresence>
      </span>
      <button type="button" aria-label={t.more} disabled={value >= 20} onClick={() => onChange(value + 1)}>
        <Icon name="plus" size={18} />
      </button>
    </span>
  );
}

// The dish's round photo, or its first letter on a tinted plate when it has none.
function Plate({ photo, name, className }) {
  return photo ? <img className={clsx("plate", className)} src={photo} alt="" loading="lazy" draggable="false" /> : <span className={clsx("plate plate-letter", className)} aria-hidden="true">{name.slice(0, 1)}</span>;
}

// One dish as a small card in the grid: photo, name, a line of description, price, add.
// It only fades in; nothing moves.
export function Card({ product: p, photo, hidden, canOrder, count, onOpen, onQuickAdd, t, tr }) {
  const name = tr(p, "name");
  const description = tr(p, "description");
  const textLang = name === p.name ? "sq" : undefined;
  return (
    <li className={clsx("card", !p.available && "sold-out")}>
      <button className="card-body" onClick={onOpen} aria-label={name}>
        <span className="card-plate">
          {/* The plate: tapped, it flies to the dish's page and turns into place. */}
          {!hidden && (
            <m.span layoutId={`plate-${p.id}`} className="plate-wrap" style={{ borderRadius: 999 }} transition={fly}>
              <Plate photo={photo} name={name} />
            </m.span>
          )}
        </span>
        {(!p.available || p.portion) && <span className="card-tag">{p.available ? p.portion : t.soldOut}</span>}
        <strong lang={textLang}>{name}</strong>
        {description && <span className="card-desc" lang={textLang}>{description}</span>}
        <Price text={t.money(p.price)} />
      </button>
      {canOrder && p.available && (
        <button
          className={clsx("card-add", count > 0 && "filled")}
          aria-label={`${t.add} ${name}${count ? ` (${t.inOrder(count)})` : ""}`}
          onClick={() => (p.extras.length ? onOpen() : onQuickAdd())}
        >
          {count > 0 ? count : <Icon name="plus" size={18} />}
        </button>
      )}
    </li>
  );
}

// The dish's page. On top the food itself: the plate, big, flown in from its card and
// turning into place, running off the screen's top and right edges so the dish fills the view,
// on a soft glow of the venue's colour. Over it rises a white panel: name, category and price,
// three fact tiles (calories, portion, extras), the extras to pick, the description; and at the
// bottom the quantity pill set into the dark "Add to cart" bar, which carries the total.
export function Detail({ product: p, photo, category, canOrder, onAdd, onClose, t, tr }) {
  const [qty, setQty] = useState(1);
  // Each group starts on its first option (the small pizza); add-ons start unticked.
  const groups = [...new Set(p.extras.filter((x) => x.group).map((x) => x.group))];
  const addOns = p.extras.filter((x) => !x.group);
  const [extras, setExtras] = useState(() => groups.map((g) => p.extras.find((x) => x.group === g).name));
  const choose = (x) => setExtras((list) => [...list.filter((n) => p.extras.find((y) => y.name === n)?.group !== x.group), x.name]);
  const [fav, setFav] = useState(() => favourites().includes(p.id));
  const page = useRef(null);
  const reduce = useReducedMotion();
  const name = tr(p, "name");
  const description = tr(p, "description");
  const textLang = name === p.name ? "sq" : undefined;
  const toggleExtra = (x) => setExtras((list) => (list.includes(x) ? list.filter((n) => n !== x) : [...list, x]));
  useEffect(() => {
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    page.current?.querySelector(".detail-back")?.focus({ preventScroll: true });
    const esc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => ((document.body.style.overflow = was), document.removeEventListener("keydown", esc));
  }, []);
  const toggleFav = () => {
    const next = fav ? favourites().filter((id) => id !== p.id) : [...favourites(), p.id];
    try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch {}
    setFav(!fav);
  };
  const ordering = canOrder && p.available;
  const total = qty * unit(p, extras);
  const facts = [
    p.calories != null && ["flame", t.calories, `${p.calories}`, "kcal"],
    p.portion && ["cup", t.portion, p.portion, ""],
    addOns.length > 0 && ["layers", t.extras, String(addOns.length), ""],
  ].filter(Boolean);
  const ease = [0.23, 1, 0.32, 1];
  return (
    <m.div
      ref={page}
      className="detail"
      role="dialog"
      aria-modal="true"
      aria-label={name}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.2 } }}
      exit={{ opacity: 0, transition: { duration: 0.16 } }}
    >
      <div className="detail-scroll">
        <div className="detail-hero">
          {/* The whole photo, edge to edge: it flies in from the card's round plate, opening
              into the full picture while it turns into place. */}
          <m.span layoutId={`plate-${p.id}`} className="plate-wrap detail-photo" style={{ borderRadius: 0 }} transition={fly}>
            <m.span
              className="plate-spin"
              initial={reduce ? false : { rotate: -18, scale: 1.35 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 70, damping: 16 }}
            >
              <Plate photo={photo} name={name} />
            </m.span>
          </m.span>
          <span className="detail-shade" aria-hidden="true" />
          <header className="detail-top">
            <button className="glass-button detail-back" aria-label={t.back} onClick={onClose}><Icon name="back" size={20} /></button>
            <button className={clsx("glass-button", fav && "on")} aria-label={t.favourite} aria-pressed={fav} onClick={toggleFav}>
              <m.span key={String(fav)} initial={{ scale: fav ? 0.6 : 1 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 15 }} style={{ display: "grid" }}>
                <Icon name="heart" size={20} />
              </m.span>
            </button>
          </header>
        </div>
        <m.section
          className="detail-panel"
          initial={{ opacity: 0, transform: "translateY(48px)" }}
          animate={{ opacity: 1, transform: "translateY(0px)" }}
          transition={{ duration: 0.45, ease, delay: 0.08 }}
        >
          <div className="detail-head">
            <div>
              {category && <span className="detail-cat">{category}</span>}
              <h1 lang={textLang}>{name}</h1>
            </div>
            <Price text={t.money(unit(p, extras))} className="detail-price" />
          </div>
          {!p.available && <span className="card-tag">{t.soldOut}</span>}
          {facts.length > 0 && (
            <ul className="detail-facts">
              {facts.map(([icon, label, value, small], i) => (
                <m.li key={label} initial={{ opacity: 0, transform: "translateY(10px)" }} animate={{ opacity: 1, transform: "translateY(0px)" }} transition={{ duration: 0.35, ease, delay: 0.2 + i * 0.05 }}>
                  <span className="fact-icon"><Icon name={icon} size={18} /></span>
                  <b>{value}{small && <small> {small}</small>}</b>
                  <span>{label}</span>
                </m.li>
              ))}
            </ul>
          )}
          {groups.map((g) => (
            <fieldset className="detail-options" key={g} disabled={!ordering}>
              <legend>{t.extra(p, g)}</legend>
              <div role="radiogroup" aria-label={t.extra(p, g)}>
                {p.extras.filter((x) => x.group === g).map((x) => {
                  const on = extras.includes(x.name);
                  return (
                    <button type="button" key={x.name} role="radio" aria-checked={on} onClick={() => choose(x)}>
                      {on && <m.span layoutId={`option-${g}`} className="option-ink" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                      <span>{t.extra(p, x.name)}</span>
                      {x.price > 0 && <small>+{t.money(x.price)}</small>}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
          {addOns.length > 0 && (
            <fieldset className="detail-extras" disabled={!ordering}>
              <legend>{t.extras}</legend>
              <div>
                {addOns.map((x) => {
                  const on = extras.includes(x.name);
                  return (
                    <button type="button" key={x.name} role="checkbox" aria-checked={on} onClick={() => toggleExtra(x.name)}>
                      <span className="extra-mark"><Icon name={on ? "check" : "plus"} size={14} /></span>
                      <span className="extra-name">{t.extra(p, x.name)}</span>
                      {x.price > 0 && <small>+{t.money(x.price)}</small>}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
          {description && (
            <div className="detail-about">
              <h2>{t.about}</h2>
              <p lang={textLang}>{description}</p>
            </div>
          )}
        </m.section>
      </div>
      {ordering && (
        <m.div className="detail-bar" initial={{ opacity: 0, transform: "translateY(24px)" }} animate={{ opacity: 1, transform: "translateY(0px)" }} transition={{ duration: 0.4, ease, delay: 0.16 }}>
          <Stepper value={qty} onChange={setQty} t={t} />
          <button className="cart-button" onClick={() => onAdd({ qty, extras: p.extras.filter((x) => extras.includes(x.name)).map((x) => x.name), note: "" })}>
            <Icon name="bag" size={18} />
            <span>{t.addToCart}</span>
            <span className="cart-total">{t.money(total)}</span>
          </button>
        </m.div>
      )}
    </m.div>
  );
}
const FAV_KEY = `menu-favourites:${window.location.pathname}`;
const favourites = () => {
  try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch { return []; }
};

// A price as the number with its currency small and coloured: "180 Lek" → 180 ˡᵉᵏ.
export function Price({ text, className = "card-price" }) {
  const m = text.match(/^([^\d]*)([\d.,\s\u00a0]+)([^\d]*)$/);
  if (!m) return <span className={className}>{text}</span>;
  const [, before, number, after] = m;
  return (
    <span className={className} aria-label={text}>
      {before.trim() && <sup>{before.trim()}</sup>}
      {number.trim()}
      {after.trim() && <sup>{after.trim()}</sup>}
    </span>
  );
}

// The categories as a wheel lying on an oval, drawn as a faint track behind them.
// Contract:  items = [{ key, label, photo?, icon?, all? }] in wheel order (the caller puts "All"
//   in the middle); active = the chosen key; onPick(key) when one is chosen.
// - Sideways swipe turns the wheel; up and down always scroll the page (touch-action: pan-y).
// - A tap chooses and turns that one to the front; ← / → choose the previous / next one.
// - Five bubbles stand fully on screen: the front one, two each side, smaller toward the edge;
//   any further out fade away before the edge instead of being cut.
// - With five or fewer, the wheel stands still.
const STEP = 30; // degrees between two bubbles
const FADE = [2 * STEP, 2.75 * STEP]; // fully shown up to the second neighbour, gone by here
export function Categories({ items, active, onPick, label }) {
  const box = useRef(null);
  const track = useRef(null);
  const middle = Math.max(0, items.findIndex((c) => c.all));
  const turning = items.length > 5;
  const at = useMotionValue(middle); // which bubble is at the front; fractional while turning
  const geo = useRef({ rx: 150, ry: 70 });
  const drag = useRef(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const place = () => {
      const { rx, ry } = geo.current;
      el.querySelectorAll(".arc-item").forEach((b, i) => {
        const deg = (i - at.get()) * STEP;
        const a = (deg * Math.PI) / 180;
        const far = Math.abs(deg);
        const opacity = far <= FADE[0] ? 1 : Math.max(0, 1 - (far - FADE[0]) / (FADE[1] - FADE[0]));
        b.style.transform = `translate3d(${(rx * Math.sin(a)).toFixed(1)}px, ${(ry * (1 - Math.cos(a))).toFixed(1)}px, 0) scale(${(0.74 + 0.26 * Math.cos(a)).toFixed(3)})`;
        b.style.opacity = opacity.toFixed(3);
        b.style.visibility = opacity ? "visible" : "hidden";
        b.style.zIndex = String(100 - Math.round(far));
        b.tabIndex = items[i].key === active ? 0 : -1;
      });
    };
    const measure = () => {
      const w = el.clientWidth;
      // The second neighbour's centre sits a bubble's half-width plus a gutter from the edge.
      const rx = (w / 2 - 44) / Math.sin((2 * STEP * Math.PI) / 180);
      const ry = 64;
      geo.current = { rx, ry };
      // The track: the same oval, through the bubbles' centres.
      const pts = [];
      for (let d = -80; d <= 80; d += 4) {
        const a = (d * Math.PI) / 180;
        pts.push(`${(w / 2 + rx * Math.sin(a)).toFixed(1)},${(36 + ry * (1 - Math.cos(a))).toFixed(1)}`);
      }
      track.current?.setAttribute("points", pts.join(" "));
      place();
    };
    measure();
    const stop = at.on("change", place);
    const resized = new ResizeObserver(measure);
    resized.observe(el);
    return () => (stop(), resized.disconnect());
  }, [items.length, active]);

  const settle = (to, velocity = 0) =>
    animate(at, Math.max(0, Math.min(items.length - 1, to)), reduce ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 34, velocity });
  // The chosen one turns to the front (Home included); a still wheel keeps "All" in front.
  useEffect(() => {
    if (!turning) return void at.set(middle);
    const i = items.findIndex((c) => c.key === active);
    if (i >= 0 && Math.abs(at.get() - i) > 0.01) settle(i);
  }, [active, turning, items.length]);

  const perStep = () => geo.current.rx * Math.sin((STEP * Math.PI) / 180);
  const down = (e) => {
    if (!turning || (e.pointerType === "mouse" && e.button !== 0)) return;
    at.stop();
    drag.current = { x: e.clientX, from: at.get(), moved: false, samples: [[e.timeStamp, e.clientX]] };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 8) return;
    if (!d.moved) (d.moved = true, box.current.setPointerCapture?.(e.pointerId));
    let next = d.from - dx / perStep();
    // Past either end the wheel gives a little, then resists.
    const last = items.length - 1;
    if (next < 0) next = -Math.sqrt(-next) * 0.3;
    if (next > last) next = last + Math.sqrt(next - last) * 0.3;
    at.set(next);
    d.samples.push([e.timeStamp, e.clientX]);
    while (d.samples.length > 2 && e.timeStamp - d.samples[0][0] > 90) d.samples.shift();
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    // Speed over the last ~90 ms, in bubbles per second; a flick carries a little further.
    const [t0, x0] = d.samples[0], [t1, x1] = d.samples.at(-1);
    const v = t1 > t0 ? -((x1 - x0) / perStep()) / ((t1 - t0) / 1000) : 0;
    settle(Math.round(at.get() + Math.max(-2, Math.min(2, v * 0.15))), v);
    box.current.dataset.dragged = "1";
    setTimeout(() => box.current && delete box.current.dataset.dragged, 80);
  };
  const keys = (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = items.findIndex((c) => c.key === active);
    const next = items[Math.max(0, Math.min(items.length - 1, i + step))];
    onPick(next.key);
    requestAnimationFrame(() => box.current?.querySelector(`[data-key="${CSS.escape(next.key)}"]`)?.focus({ preventScroll: true }));
  };

  return (
    <nav
      className={clsx("arc", turning && "turning")}
      aria-label={label}
      ref={box}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={keys}
      onClickCapture={(e) => box.current?.dataset.dragged && (e.stopPropagation(), e.preventDefault())}
    >
      <svg className="arc-track" aria-hidden="true"><polyline ref={track} /></svg>
      {items.map((c) => (
        <button key={c.key} data-key={c.key} className={clsx("arc-item", c.all && "all")} aria-current={active === c.key ? "true" : undefined} onClick={() => onPick(c.key)}>
          <span className="arc-bubble">
            {c.all ? <Icon name="grid" size={22} /> : c.photo ? <img src={c.photo} alt="" loading="lazy" draggable="false" /> : <Icon name={c.icon} size={24} />}
          </span>
          <span className="arc-label">{c.label}</span>
          {active === c.key && <m.span layoutId="arc-ink" className="arc-ink" transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }} />}
        </button>
      ))}
    </nav>
  );
}
