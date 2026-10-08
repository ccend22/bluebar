// The guests' online menu (/menu/<business>?t=<table>&k=<key>): the venue's own guest-check
// pad. A separate page from BlueBar: it reads the public menu and, when the business allows
// it and the table's QR code carries its key, sends orders straight to the stations.
import "../uuid.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, LazyMotion, MotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { Toaster, toast } from "sonner";
import { Line } from "./Line.jsx";
import { CheckContent, Copies, Sheet, Stub } from "./Check.jsx";
import { useOrder } from "./useOrder.js";
import { TEXT, clock } from "./text.js";
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function Menu() {
  const [menu, setMenu] = useState(null);
  const [failed, setFailed] = useState(false);
  const [lang, setLang] = useState(savedLang || (navigator.language?.toLowerCase().startsWith("sq") ? "sq" : "en"));
  const [openId, setOpenId] = useState(null);
  const [active, setActive] = useState("");
  const [checkOpen, setCheckOpen] = useState(false);
  const [copiesOpen, setCopiesOpen] = useState(false);
  const [tearing, setTearing] = useState(false);
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
  // English where the manager wrote it, Albanian otherwise.
  const tr = (sq, en) => (lang === "en" && en) || sq;
  const sections = useMemo(
    () => (menu ? menu.categories.map((c) => ({ ...c, products: menu.products.filter((p) => p.category === c.name) })) : []),
    [menu],
  );
  // The category being read: the last whose heading passed under the tab strip.
  useEffect(() => {
    if (!sections.length) return;
    const onScroll = () => {
      const all = [...document.querySelectorAll("[data-category]")];
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const passed = atEnd ? all : all.filter((el) => el.getBoundingClientRect().top <= 90);
      setActive((passed.at(-1) || all[0])?.dataset.category || "");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [sections]);
  useEffect(() => {
    // Centre the tab by scrolling only the strip: scrollIntoView would also move the page.
    const strip = document.querySelector(".tabs");
    const tab = strip?.querySelector(`[data-tab="${CSS.escape(active)}"]`);
    if (tab) strip.scrollTo({ left: tab.offsetLeft - (strip.clientWidth - tab.clientWidth) / 2, behavior: "smooth" });
  }, [active]);
  const toggle = (id) => {
    const next = openId === id ? null : id;
    setOpenId(next);
    if (next) setTimeout(() => document.getElementById(`line-${next}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 380);
  };

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
  return (
    <>
      <div className="pad">
        <header className="masthead">
          <span className="logo-stamp">
            {menu.brand?.logo ? <img src={`/api/menu/${slug}/logo?v=${menu.brand.logo}`} alt="" /> : <b>{initials}</b>}
          </span>
          <h1>{menu.name}</h1>
          {menu.brand?.tagline && <p className="tagline">{menu.brand.tagline}</p>}
          <div className="form-boxes">
            {table && <span className="form-box"><small>{t.table}</small>{String(table).padStart(2, "0")}</span>}
            <span className="form-box"><small>{t.time}</small>{clock(Date.now())}</span>
            {order.placed.length > 0 && (
              <button className="form-box action" onClick={() => setCopiesOpen(true)}>
                <small>{t.copies}</small>{order.placed.length}
              </button>
            )}
            <div className="form-box lang" role="group" aria-label={t.language}>
              <small>{t.language}</small>
              <span>
                {["sq", "en"].map((l) => (
                  <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
                ))}
              </span>
            </div>
          </div>
        </header>
        <nav className="tabs" aria-label={t.categories}>
          {sections.map((s) => (
            <a
              key={s.name}
              href={`#${encodeURIComponent(s.name)}`}
              data-tab={s.name}
              aria-current={active === s.name ? "true" : undefined}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(s.name)?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              {tr(s.name, s.nameEn)}
              {active === s.name && <m.span layoutId="tab-ink" className="tab-ink" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
            </a>
          ))}
        </nav>
        <main className={`lines ${order.count ? "with-stub" : ""}`}>
          {menu.ordering && (!table || (order.tableState && !order.tableState.open)) && (
            <p className="notice">{{ off: t.orderingOff, closed: t.venueClosed }[order.tableState?.reason] || t.scan}</p>
          )}
          {sections.map((s) => (
            <section key={s.name} id={s.name} data-category={s.name}>
              <h2>
                <span>{tr(s.name, s.nameEn)}</span>
                <small>{s.products.length}</small>
              </h2>
              <ul>
                {s.products.map((p) => (
                  <Line
                    key={p.id}
                    product={p}
                    photo={photoUrl(p)}
                    open={openId === p.id}
                    onToggle={() => toggle(p.id)}
                    canOrder={order.canOrder}
                    count={order.lines.filter((l) => l.productId === p.id).reduce((n, l) => n + l.qty, 0)}
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
      </div>
      <AnimatePresence>
        {order.count > 0 && !checkOpen && <Stub key="stub" count={order.count} total={order.total} table={table} onOpen={() => setCheckOpen(true)} t={t} />}
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
