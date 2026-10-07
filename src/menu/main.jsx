// The guests' online menu (/menu/<business>?t=<table>&k=<key>). A separate page from
// BlueBar: it reads the public menu, and — when the business allows it and the table's QR
// code carries its key — sends an order that waits for a waiter's confirmation.
import "../uuid.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Dish } from "./Dish.jsx";
import { BasketCapsule, BasketContent, MyOrders, Sheet, StatusCapsule } from "./Basket.jsx";
import { Icon } from "./icons.jsx";
import { useOrder } from "./useOrder.js";
import { TEXT, reducedMotion } from "./text.js";
import { ACCENTS } from "./accents.js";
import "./menu.css";

const slug = window.location.pathname.split("/")[2] || "";
const query = new URLSearchParams(window.location.search);
const table = Number(query.get("t")) || null;
const tableKey = query.get("k") || "";
const savedLang = (() => {
  try { return localStorage.getItem("menu-lang"); } catch { return null; }
})();
const photoUrl = (p) => (p.photo ? `/api/menu/${slug}/photo/${p.id}?v=${p.photo}` : null);

function Menu() {
  const [menu, setMenu] = useState(null);
  const [failed, setFailed] = useState(false);
  const [lang, setLang] = useState(savedLang || (navigator.language?.toLowerCase().startsWith("sq") ? "sq" : "en"));
  const [openId, setOpenId] = useState(null);
  const [morphId, setMorphId] = useState(null);
  const [active, setActive] = useState("");
  const [compact, setCompact] = useState(false);
  const [basketOpen, setBasketOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const titleRef = useRef(null);
  const t = TEXT[lang];
  const order = useOrder({ slug, table, tableKey, menu, t, lang });
  const load = () => {
    setFailed(false);
    fetch(`/api/menu/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setMenu)
      .catch(() => setFailed(true));
  };
  useEffect(load, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem("menu-lang", lang); } catch {}
  }, [lang]);
  useEffect(() => {
    if (!menu) return;
    document.title = menu.name;
    // The venue's own colour drives every pressable thing on the page.
    const accent = ACCENTS[menu.brand?.accent] || ACCENTS.blue;
    document.documentElement.style.setProperty("--blue", accent.hex);
    document.documentElement.style.setProperty("--blue-press", accent.press);
  }, [menu]);
  // English where the manager wrote it, Albanian otherwise.
  const tr = (sq, en) => (lang === "en" && en) || sq;
  const sections = useMemo(
    () => (menu ? menu.categories.map((c) => ({ ...c, products: menu.products.filter((p) => p.category === c.name) })) : []),
    [menu],
  );
  // The large title gives way to the compact bar once it scrolls under it.
  useEffect(() => {
    if (!titleRef.current) return;
    const seen = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting), { rootMargin: "-44px 0px 0px 0px" });
    seen.observe(titleRef.current);
    return () => seen.disconnect();
  }, [menu]);
  // The category being read: the last whose heading passed under the bar (or the last one at the very bottom).
  useEffect(() => {
    if (!sections.length) return;
    const onScroll = () => {
      const all = [...document.querySelectorAll("[data-category]")];
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const passed = atEnd ? all : all.filter((el) => el.getBoundingClientRect().top <= 140);
      setActive((passed.at(-1) || all[0])?.dataset.category || "");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [sections]);
  useEffect(() => {
    // Centre the pill by scrolling only the bar: scrollIntoView would also move the page.
    const bar = document.querySelector(".pills");
    const pill = bar?.querySelector(`[data-pill="${CSS.escape(active)}"]`);
    if (pill) bar.scrollTo({ left: pill.offsetLeft - (bar.clientWidth - pill.clientWidth) / 2, behavior: "smooth" });
  }, [active]);

  // Open or fold a dish where it is: the photo morphs between the row and the plate.
  const toggle = (id) => {
    const next = openId === id ? null : id;
    const reveal = () => next && document.getElementById(`dish-${next}`)?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
    if (!document.startViewTransition || reducedMotion()) {
      setOpenId(next);
      return requestAnimationFrame(reveal);
    }
    flushSync(() => setMorphId(id));
    document.startViewTransition(() => flushSync(() => setOpenId(next))).finished.then(reveal);
  };

  if (failed)
    return (
      <main className="state">
        <img src="/favicon.svg" alt="" width="60" height="60" />
        <p>{t.unavailable}</p>
        <button className="primary" onClick={load}>{t.retry}</button>
      </main>
    );
  if (!menu)
    return (
      <main className="state" aria-busy="true">
        <span className="skeleton title" />
        <span className="skeleton row" />
        <span className="skeleton row" />
      </main>
    );
  const { latest } = order;
  const showStatus = latest && !latest.dismissed;
  return (
    <>
      <div className={`topbar ${compact ? "shown" : ""}`}>
        <span aria-hidden={!compact}>{menu.name}</span>
        {order.placed.length > 0 && compact && (
          <button className="topbar-orders" aria-label={t.myOrders} onClick={() => setOrdersOpen(true)}>
            <Icon name="receipt" size={20} />
            <span>{order.placed.length}</span>
          </button>
        )}
      </div>
      <header className="hero">
        <div className="hero-meta">
          {table && <span className="table-tag">{t.table} {String(table).padStart(2, "0")}</span>}
          {order.placed.length > 0 && (
            <button className="my-orders-tag" onClick={() => setOrdersOpen(true)}>
              <Icon name="receipt" size={16} /> {t.myOrders} · {order.placed.length}
            </button>
          )}
          <div className="lang" role="group" aria-label={t.language}>
            {["sq", "en"].map((l) => (
              <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
            ))}
          </div>
        </div>
        {/* The venue's card: its logo (or its initials in its colour), name and welcome. */}
        <span className="hero-logo">
          {menu.brand?.logo ? (
            <img src={`/api/menu/${slug}/logo?v=${menu.brand.logo}`} alt="" />
          ) : (
            <b>{menu.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</b>
          )}
        </span>
        <h1 ref={titleRef}>{menu.name}</h1>
        {menu.brand?.tagline && <p className="hero-tagline">{menu.brand.tagline}</p>}
      </header>
      <div className={`nav ${compact ? "stuck" : ""}`}>
        <nav className="pills" aria-label={t.categories}>
          {sections.map((s) => (
            <a
              key={s.name}
              href={`#${encodeURIComponent(s.name)}`}
              data-pill={s.name}
              aria-current={active === s.name ? "true" : undefined}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(s.name)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth" });
              }}
            >
              {tr(s.name, s.nameEn)}
            </a>
          ))}
        </nav>
      </div>
      <main className={`list ${order.count || showStatus ? "with-capsule" : ""}`}>
        {menu.ordering && (!table || (order.tableState && !order.tableState.open)) && (
          <p className="notice">
            {{ off: t.orderingOff, closed: t.venueClosed }[order.tableState?.reason] || t.scan}
          </p>
        )}
        {sections.map((s) => (
          <section key={s.name} id={s.name} data-category={s.name}>
            <h2>{tr(s.name, s.nameEn)}</h2>
            <ul className="group">
              {s.products.map((p) => (
                <Dish
                  key={p.id}
                  product={p}
                  photo={photoUrl(p)}
                  open={openId === p.id}
                  morph={morphId === p.id}
                  onToggle={() => toggle(p.id)}
                  canOrder={order.canOrder}
                  inCart={order.lines.filter((l) => l.productId === p.id).reduce((n, l) => n + l.qty, 0)}
                  onQuickAdd={() => order.add(p)}
                  onAdd={(choice) => (order.add(p, choice), toggle(p.id))}
                  t={t}
                  tr={tr}
                />
              ))}
            </ul>
          </section>
        ))}
        <footer className="foot">{t.prices}</footer>
      </main>
      {showStatus && <StatusCapsule order={latest} raised={order.count > 0} onDismiss={order.dismiss} onOpen={() => setOrdersOpen(true)} t={t} />}
      {order.count > 0 && <BasketCapsule count={order.count} total={order.total} bump={order.bump} onOpen={() => setBasketOpen(true)} t={t} />}
      <Sheet open={basketOpen} onClose={() => setBasketOpen(false)} label={t.yourOrder}>
        {(dismiss) => (
          <BasketContent {...order} onSend={async (note) => (await order.send(note)) && dismiss()} t={t} tr={tr} />
        )}
      </Sheet>
      <Sheet open={ordersOpen} onClose={() => setOrdersOpen(false)} label={t.myOrders}>
        {() => <MyOrders placed={order.placed} productOf={order.productOf} t={t} tr={tr} lang={lang} />}
      </Sheet>
    </>
  );
}

createRoot(document.getElementById("menu")).render(<Menu />);
