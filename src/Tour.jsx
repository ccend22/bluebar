import React, { useEffect, useRef, useState } from "react";
import { venueSlug } from "./api.js";
import { Icon } from "./components.jsx";

// First-run guide for managers: a pulsing dot on the button to use and a box beside it
// saying what it's for, step by step through the main setup. Seen once per device and
// venue; "Udhëzuesi" in the top bar runs it again.
export const tourSeenKey = `bluebar-tour-seen:${venueSlug}`;

// page/tab: where the step happens. sel + on: the element to point at (the first visible
// one whose text matches). No target, or not on screen (e.g. the phone layout): the box sits centred.
const STEPS = [
  {
    title: "Mirë se vini në BlueBar",
    text: "Ju tregojmë ku konfigurohet lokali, hap pas hapi. Mund ta mbyllni kurdo dhe ta rinisni nga \"Udhëzuesi\" lart.",
  },
  {
    page: "Tavolinat", sel: "nav button", on: "Produktet",
    title: "1. Produktet",
    text: "Menuja e lokalit. Hyni këtu për të shtuar çdo produkt me çmimin e tij.",
  },
  {
    page: "Produktet", sel: ".title-actions button", on: "Importo",
    title: "Importo menunë",
    text: "Keni menunë në letër ose PDF? Fotografojeni: AI lexon produktet dhe çmimet për ju.",
  },
  {
    page: "Produktet", sel: ".title-actions button", on: "Shto produkt",
    title: "Ose një nga një",
    text: "Emri, çmimi, kategoria dhe reparti ku përgatitet.",
  },
  {
    page: "Cilësimet", tab: "Repartet dhe kategoritë", sel: ".settings-tabs button", on: "Repartet dhe kategoritë",
    title: "2. Repartet dhe kategoritë",
    text: "Repartet: ku përgatitet porosia (bar, kuzhinë, ëmbëltore). Kategoritë: grupet e menusë.",
  },
  {
    page: "Tavolinat", sel: "button", on: "Ndrysho sallën",
    title: "3. Salla",
    text: "Vendosni tavolinat dhe zonat (Salla, Taraca) ashtu siç janë në lokal.",
  },
  {
    page: "Cilësimet", tab: "Kamarierët", sel: ".settings-tabs button", on: "Kamarierët",
    title: "4. Kamarierët",
    text: "Shtoni çdo kamarier dhe jepini PIN-in e vet. Me të hyn në telefon dhe merr porosi.",
  },
  {
    page: "Cilësimet", tab: "Printerët", sel: ".settings-tabs button", on: "Printerët",
    title: "5. Printerët · opsionale",
    text: "Lidhni printerin e faturave dhe të reparteve. Pa printer, fletët shihen te ekrani Repartet.",
  },
  {
    page: "Cilësimet", tab: "Fiskalizimi", sel: ".settings-tabs button", on: "Fiskalizimi",
    title: "6. Fiskalizimi · opsionale",
    text: "Lidhni BlueBill që faturat të shkojnë te tatimet. Provojeni fillimisht në mënyrën test.",
  },
  {
    page: "Tavolinat",
    title: "Gati!",
    text: "Kaq ishte. Kur të keni produktet, sallën dhe kamarierët, lokali është gati për shërbim.",
  },
];

const find = (s) =>
  s.sel && [...document.querySelectorAll(s.sel)].find((e) => e.textContent.includes(s.on) && e.getClientRects().length);

export function Tour({ go, onClose }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const box = useRef(null);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  useEffect(() => {
    if (step.page) go(step.page, step.tab);
    setRect(null);
    let el = null;
    // The page renders after go(), and the target may move (scroll, resize): follow it.
    const follow = () => {
      if (!el?.isConnected) {
        el = find(step);
        el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
      const r = el?.getBoundingClientRect();
      setRect((p) => (!r ? null : p && p.top === r.top && p.left === r.left && p.width === r.width ? p : { top: r.top, left: r.left, width: r.width, height: r.height }));
    };
    const timer = setInterval(follow, 150);
    follow();
    return () => clearInterval(timer);
  }, [i]);

  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, STEPS.length - 1));
      else if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);

  // The box beside the target: right of it if it fits, else below, else above; always on screen.
  const W = Math.min(340, innerWidth - 32);
  const H = box.current?.offsetHeight || 180;
  let pos = { left: (innerWidth - W) / 2, top: (innerHeight - H) / 2 };
  if (rect) {
    const pad = 18;
    if (rect.left + rect.width + pad + W < innerWidth - 16) pos = { left: rect.left + rect.width + pad, top: rect.top + rect.height / 2 - H / 2 };
    else if (rect.top + rect.height + pad + H < innerHeight - 16) pos = { left: rect.left + rect.width / 2 - W / 2, top: rect.top + rect.height + pad };
    else pos = { left: rect.left + rect.width / 2 - W / 2, top: rect.top - pad - H };
    pos.left = Math.max(16, Math.min(pos.left, innerWidth - W - 16));
    pos.top = Math.max(16, Math.min(pos.top, innerHeight - H - 16));
  }

  return (
    <div className="tour" aria-live="polite">
      <div
        className={`tour-spot ${rect ? "" : "none"}`}
        style={rect ? { top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 } : undefined}
      />
      {rect && <span className="tour-dot" style={{ top: rect.top - 6, left: rect.left + rect.width + 6 }} />}
      <div key={i} ref={box} className="tour-box" role="dialog" aria-labelledby="tour-title" style={{ ...pos, width: W }}>
        <div className="tour-head">
          <h2 id="tour-title">{step.title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Mbyll udhëzuesin">
            <Icon name="close" size={16} />
          </button>
        </div>
        <p>{step.text}</p>
        <div className="tour-foot">
          <span className="tour-dots" aria-label={`Hapi ${i + 1} nga ${STEPS.length}`}>
            {STEPS.map((_, n) => <i key={n} className={n === i ? "on" : undefined} />)}
          </span>
          {i > 0 && <button type="button" onClick={() => setI(i - 1)}>Prapa</button>}
          <button type="button" className="primary" autoFocus onClick={() => (last ? onClose() : setI(i + 1))}>
            {last ? "Përfundo" : i === 0 ? "Fillo" : "Tjetër"}
          </button>
        </div>
      </div>
    </div>
  );
}
