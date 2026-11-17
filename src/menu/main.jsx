// The guests' online menu (/menu/<business>?t=<table>&k=<key>): the venue's own guest-check
// pad. A separate page from BlueBar: it reads the public menu and, when the business allows
// it and the table's QR code carries its key, sends orders straight to the stations.
import "../uuid.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, LazyMotion, MotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { Toaster, toast } from "sonner";
import { Card, Categories, Detail } from "./Line.jsx";
import { CheckContent, Copies, Sheet, Stub } from "./Check.jsx";
import { useOrder } from "./useOrder.js";
import { Icon } from "./icons.jsx";
import { LANGS, TEXT, currency } from "./text.js";
import { ACCENTS } from "./accents.js";
import "./fonts.css";
import "./menu.css";

const slug = window.location.pathname.split("/")[2] || "";
const query = new URLSearchParams(window.location.search);
const table = Number(query.get("t")) || null;
const tableKey = query.get("k") || "";
const savedLang = (() => {
  try { return localStorage.getItem("menu-lang"); } catch { return null; }
})();
const photoUrl = (p) => (p.photo ? `/api/menu/${slug}/photo/${p.id}?v=${p.photo}` : null);
// Springs, layout and drag load after first paint: the menu shows before motion arrives.
const motionFeatures = () => import("motion/react").then((r) => r.domMax);
// Lower case, without marks: ç → c, ë → e.
const plain = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// A category without a photo shows a drawn icon that fits its name (Albanian or English).
const ICONS = [
  [/ver|wine/, "wine"], [/koktej|cocktail|aperit/, "cocktail"], [/birr|beer/, "beer"], [/caj|tea|kafe|coffee/, "cup"],
  [/pij|drink|leng|juice|uj|water/, "bottle"], [/pic|pizza/, "pizza"], [/embel|dessert|tort|cake/, "cake"],
];
const categoryIcon = (name) => ICONS.find(([re]) => re.test(plain(name)))?.[1] || "plate";

// The language: the form's last box, written like TAVOLINA and ORA. Tapped, a slip of
// pad paper with the six languages drops from it (from its own corner, not the centre).
function LangBox({ lang, onChange, label }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => !box.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && (setOpen(false), box.current?.querySelector("button")?.focus());
    // Scrolling away closes it too: left open it would float over the category tabs.
    const scrolled = () => setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", scrolled, { passive: true, once: true });
    return () => (document.removeEventListener("pointerdown", away), document.removeEventListener("keydown", esc), window.removeEventListener("scroll", scrolled));
  }, [open]);
  return (
    <div className="form-box lang" ref={box}>
      <button type="button" className="lang-trigger" aria-label={`${label}: ${LANGS[lang]}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <small>{label}</small>
        <Icon name="globe" size={19} />
      </button>
      <AnimatePresence>
        {open && (
          <m.ul
            className="lang-menu"
            role="menu"
            aria-label={label}
            initial={{ opacity: 0, transform: "translateY(-4px) scale(0.97)" }}
            animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
            exit={{ opacity: 0, transform: "translateY(-4px) scale(0.97)", transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          >
            {Object.entries(LANGS).map(([l, name]) => (
              <li key={l} role="none">
                <button type="button" role="menuitemradio" aria-checked={l === lang} lang={l} onClick={() => (onChange(l), setOpen(false))}>
                  {name}
                  {l === lang && <Icon name="check" size={16} />}
                </button>
              </li>
            ))}
          </m.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function Menu() {
  const [menu, setMenu] = useState(null);
  const [failed, setFailed] = useState(false);
  // The phone's language when the menu speaks it, else English.
  const [lang, setLang] = useState(() => {
    const phone = navigator.language?.slice(0, 2).toLowerCase();
    return TEXT[savedLang] ? savedLang : TEXT[phone] ? phone : "en";
  });
  const [detailId, setDetailId] = useState(null);
  const [cat, setCat] = useState("all");
  const [search, setSearch] = useState("");
  const [checkOpen, setCheckOpen] = useState(false);
  const [copiesOpen, setCopiesOpen] = useState(false);
  const [tearing, setTearing] = useState(false);
  const t = {
    ...TEXT[lang], ...currency(lang, menu?.euroRate),
    // An extra in the guest's language; the order still names it in Albanian.
    extra: (p, x) => p?.i18n?.[lang]?.extras?.[x] || x,
  };
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
    // The pad is printed in the venue's own ink.
    const accent = ACCENTS[menu.brand?.accent] || ACCENTS.blue;
    document.documentElement.style.setProperty("--ink-brand", accent.hex);
    document.documentElement.style.setProperty("--ink-brand-press", accent.press);
  }, [menu]);
  // A waiting order the staff decide on: tell the guest wherever they are on the page.
  const seenStatus = useRef({});
  useEffect(() => {
    for (const o of order.placed) {
      const was = seenStatus.current[o.id];
      if (was === "pending" && o.status === "accepted") toast.success(t.accepted);
      if (was === "pending" && o.status === "rejected") toast.error(`${t.rejected}${o.reason ? `: ${o.reason}` : ""}`);
      seenStatus.current[o.id] = o.status;
    }
  }, [order.placed]);
  // The guest's language where the translator wrote it, Albanian otherwise.
  const tr = (item, field) => item.i18n?.[lang]?.[field] || item[field];
  // Search matches the Albanian and the guest's language, ignoring case and marks
  // ("caj" finds "Çaj"); categories left empty drop out of the tabs and the pad.
  const sections = useMemo(() => {
    if (!menu) return [];
    const q = plain(search.trim());
    const match = (p) => !q || plain(`${p.name} ${p.description} ${tr(p, "name")} ${tr(p, "description")}`).includes(q);
    return menu.categories
      .map((c) => ({ ...c, products: menu.products.filter((p) => p.category === c.name && match(p)) }))
      .filter((s) => s.products.length);
  }, [menu, search, lang]);
  if (failed)
    return (
      <main className="state">
        <img src="/favicon.svg" alt="" width="60" height="60" />
        <p>{t.unavailable}</p>
        <button className="stamp-button" onClick={load}>{t.retry}</button>
      </main>
    );
  if (!menu)
    return (
      <main className="state" aria-busy="true">
        <span className="skeleton title" />
        {[0, 1, 2, 3].map((i) => <span className="skeleton row" key={i} />)}
      </main>
    );
  const initials = menu.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  // The categories, "All" first, each with one of its dishes' photos.
  const bubbles = sections.map((s) => ({ key: s.name, label: tr(s, "name"), icon: categoryIcon(s.name), photo: photoUrl(s.products.find((p) => p.photo) || {}) }));
  const half = Math.ceil(bubbles.length / 2);
  const cats = [...bubbles.slice(0, half), { key: "all", label: t.all, all: true }, ...bubbles.slice(half)];
  const chosen = cat === "all" || sections.some((s) => s.name === cat) ? cat : "all";
  const shown = chosen === "all" ? sections : sections.filter((s) => s.name === chosen);
  const detail = detailId && menu.products.find((p) => p.id === detailId);
  return (
    <>
      <div className="pad">
        <header className="masthead">
          <div className="top-row">
            <span className="logo-stamp">
              {menu.brand?.logo ? <img src={`/api/menu/${slug}/logo?v=${menu.brand.logo}`} alt="" /> : <b>{initials}</b>}
            </span>
            <span className="top-where">
              <small>{table ? t.welcome : menu.name}</small>
              <strong>{table ? `${t.table} ${String(table).padStart(2, "0")}` : t.welcome}</strong>
            </span>
            {order.placed.length > 0 && (
              <button className="round-button" onClick={() => setCopiesOpen(true)} aria-label={t.copies}>
                <Icon name="receipt" size={19} />
                <span className="round-count">{order.placed.length}</span>
              </button>
            )}
            <LangBox lang={lang} onChange={setLang} label={t.language} />
            <button className="round-button" onClick={() => setCheckOpen(true)} aria-label={t.checkOpen}>
              <Icon name="bag" size={19} />
              {order.count > 0 && <span className="round-count">{order.count}</span>}
            </button>
          </div>
          <h1>
            {menu.name} <span>{menu.brand?.tagline || t.headline}</span>
          </h1>
          <label className="search-line">
            <Icon name="search" size={18} />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.search} aria-label={t.search} enterKeyHint="search" />
            {search && (
              <button type="button" onClick={() => setSearch("")} aria-label={t.close}>
                <Icon name="close" size={16} />
              </button>
            )}
          </label>
        </header>
        <div className="stage">
        {sections.length > 1 && <Categories items={cats} active={chosen} onPick={setCat} label={t.categories} />}
        <main className={`lines ${order.count ? "with-stub" : ""}`} key={chosen}>
          {menu.ordering && (!table || (order.tableState && !order.tableState.open)) && (
            <p className="notice">{{ off: t.orderingOff, closed: t.venueClosed }[order.tableState?.reason] || t.scan}</p>
          )}
          {shown.map((s) => (
            <section key={s.name} id={s.name}>
              {chosen === "all" && (
                <h2>
                  <span>{tr(s, "name")}</span>
                  <small>{s.products.length}</small>
                </h2>
              )}
              <ul className="cards">
                {s.products.map((p) => (
                  <Card
                    key={p.id}
                    product={p}
                    photo={photoUrl(p)}
                    hidden={detailId === p.id}
                    canOrder={order.canOrder}
                    count={order.lines.filter((l) => l.productId === p.id).reduce((n, l) => n + l.qty, 0)}
                    onOpen={() => setDetailId(p.id)}
                    onQuickAdd={() => order.add(p)}
                    t={t}
                    tr={tr}
                  />
                ))}
              </ul>
            </section>
          ))}
          {!sections.length && <p className="no-results">{t.noResults}</p>}
          <footer className="foot">{t.priceNote}</footer>
        </main>
        </div>
      </div>
      <AnimatePresence>
        {detail && (
          <Detail
            key={detail.id}
            product={detail}
            photo={photoUrl(detail)}
            category={tr(menu.categories.find((c) => c.name === detail.category) || { name: detail.category }, "name")}
            canOrder={order.canOrder}
            onAdd={(choice) => {
              order.add(detail, choice);
              setDetailId(null);
              // Added: one tap from here to the order, which is sent from its sheet.
              toast.success(t.addedToCart, { action: { label: t.orderNow, onClick: () => setCheckOpen(true) } });
            }}
            onClose={() => setDetailId(null)}
            t={t}
            tr={tr}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {order.count > 0 && !checkOpen && !detail && <Stub key="stub" count={order.count} total={order.total} table={table} onOpen={() => setCheckOpen(true)} t={t} />}
      </AnimatePresence>
      <Sheet open={checkOpen} onClose={() => setCheckOpen(false)} label={t.check} tearing={tearing}>
        <CheckContent
          {...order}
          table={table}
          onSend={async (note) => {
            const ok = await order.send(note);
            if (ok) {
              setTearing(true);
              await wait(460);
              setCheckOpen(false);
              // Only once the torn sheet is gone: its exit must not slide back down.
              setTimeout(() => setTearing(false), 500);
              toast.success(t.sentToast, { action: { label: t.copies, onClick: () => setCopiesOpen(true) } });
            }
            return ok;
          }}
          t={t}
          tr={tr}
        />
      </Sheet>
      <Sheet open={copiesOpen} onClose={() => setCopiesOpen(false)} label={t.copies}>
        <Copies placed={order.placed} productOf={order.productOf} t={t} tr={tr} />
      </Sheet>
      <Toaster position="top-center" offset={14} toastOptions={{ unstyled: true, classNames: { toast: "toast", actionButton: "toast-action" } }} />
    </>
  );
}

createRoot(document.getElementById("menu")).render(
  <LazyMotion features={motionFeatures} strict>
    <MotionConfig reducedMotion="user">
      <Menu />
    </MotionConfig>
  </LazyMotion>,
);
