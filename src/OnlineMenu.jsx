import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { venueSlug, saveMenuSettings, fetchMenuTables, fetchProductPhoto, saveProductPhoto, deleteProductPhoto, fetchMenuBrand, saveMenuBrand, saveMenuLogo, deleteMenuLogo, translateMenu } from "./api.js";
import { ACCENTS } from "./menu/accents.js";
import { Icon } from "./components.jsx";

const menuUrl = (table, key) => `${window.location.origin}/menu/${venueSlug}${table ? `?t=${table}&k=${key}` : ""}`;

// The photo is shrunk in the browser (longest side 1000px, WebP, JPEG where the browser
// can't write WebP), so a phone photo of several MB becomes ~100 KB before it is sent.
async function shrink(file, { size = 1000, alpha = false } = {}) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.82, 0.65, 0.5]) {
    let url = canvas.toDataURL("image/webp", quality);
    // A logo keeps its transparency: PNG where the browser can't write WebP.
    if (!url.startsWith("data:image/webp")) url = canvas.toDataURL(alpha ? "image/png" : "image/jpeg", quality);
    if (url.length < 540000) return url;
  }
  throw new Error("Fotoja është shumë e madhe edhe pas zvogëlimit.");
}

// Produktet → editor: the product's photo on the online menu.
export function ProductPhoto({ product, onChanged }) {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setPreview(null);
    if (product.photoAt) fetchProductPhoto(product.id).then((r) => setPreview(r.dataUrl)).catch(() => {});
  }, [product.id, product.photoAt]);
  const run = async (action) => {
    setBusy(true);
    setError("");
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="field product-photo">
      <span>Fotoja në menunë online</span>
      <div className="product-photo-row">
        <div className="product-photo-frame">{preview ? <img src={preview} alt="" /> : <Icon name="coffee" size={24} />}</div>
        <div className="product-photo-actions">
          <label className={`button-like ${busy ? "disabled" : ""}`}>
            {busy ? "Po ngarkohet…" : preview ? "Ndrysho foton" : "Ngarko foto"}
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files[0];
                e.target.value = "";
                if (file) run(async () => {
                  const dataUrl = await shrink(file);
                  await saveProductPhoto(product.id, dataUrl);
                  setPreview(dataUrl);
                });
              }}
            />
          </label>
          {preview && (
            <button type="button" className="text-button" disabled={busy} onClick={() => run(async () => { await deleteProductPhoto(product.id); setPreview(null); })}>
              Hiq foton
            </button>
          )}
        </div>
      </div>
      {error && <small className="warning-text">{error}</small>}
    </div>
  );
}

function Qr({ text }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    import("qrcode-generator").then(({ default: qrcode }) => {
      const qr = qrcode(0, "M");
      qr.addData(text);
      qr.make();
      setSrc(`data:image/svg+xml,${encodeURIComponent(qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }))}`);
    });
  }, [text]);
  return src ? <img className="qr" src={src} alt={`Kodi QR për ${text}`} /> : <span className="qr" />;
}

// Cilësimet → Menuja online → the menu's identity: what a guest sees at the top.
function MenuIdentity({ venueName }) {
  const [brand, setBrand] = useState(null);
  const [tagline, setTagline] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState({ text: "", error: false });
  useEffect(() => {
    fetchMenuBrand().then((b) => (setBrand(b), setTagline(b.tagline))).catch((e) => setNote({ text: e.message, error: true }));
  }, []);
  const run = async (action, done) => {
    setBusy(true);
    setNote({ text: "", error: false });
    try {
      await action();
      if (done) setNote({ text: done, error: false });
    } catch (e) {
      setNote({ text: e.message, error: true });
    } finally {
      setBusy(false);
    }
  };
  if (!brand) return null;
  const initials = venueName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <section className="panel menu-identity" style={{ "--accent": ACCENTS[brand.accent].hex }}>
      <h2>Identiteti i menusë</h2>
      <p className="helper">Çfarë sheh klienti në krye të menusë: logoja, emri, një rresht mirëseardhjeje dhe ngjyra e lokalit.</p>
      <div className="identity-row">
        <span className="identity-logo">{brand.logo ? <img src={brand.logo} alt="Logoja" /> : <b>{initials}</b>}</span>
        <div className="product-photo-actions">
          <label className={`button-like ${busy ? "disabled" : ""}`}>
            {brand.logo ? "Ndrysho logon" : "Ngarko logon"}
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files[0];
                e.target.value = "";
                if (file) run(async () => {
                  const dataUrl = await shrink(file, { size: 512, alpha: true });
                  await saveMenuLogo(dataUrl);
                  setBrand((b) => ({ ...b, logo: dataUrl }));
                }, "Logoja u ruajt.");
              }}
            />
          </label>
          {brand.logo && (
            <button type="button" className="text-button" disabled={busy} onClick={() => run(async () => { await deleteMenuLogo(); setBrand((b) => ({ ...b, logo: null })); }, "Logoja u hoq.")}>
              Hiq logon
            </button>
          )}
        </div>
      </div>
      <p className="helper">Pa logo, menuja tregon inicialet e lokalit ({initials}) me ngjyrën e zgjedhur.</p>
      <label className="field">
        <span>Rreshti i mirëseardhjes</span>
        <input value={tagline} maxLength={90} placeholder="p.sh. Kafe dhe kuzhinë mesdhetare që nga 2012" onChange={(e) => setTagline(e.target.value)} />
      </label>
      <fieldset className="accent-picker">
        <legend>Ngjyra e lokalit</legend>
        {Object.entries(ACCENTS).map(([id, a]) => (
          <label key={id} className="accent-swatch" style={{ "--swatch": a.hex }}>
            <input type="radio" name="accent" checked={brand.accent === id} onChange={() => setBrand((b) => ({ ...b, accent: id }))} />
            <span aria-hidden="true" />
            {a.sq}
          </label>
        ))}
      </fieldset>
      <div className="actions">
        <button className="primary" disabled={busy} onClick={() => run(() => saveMenuBrand({ tagline: tagline.trim(), accent: brand.accent }), "Identiteti u ruajt. Menuja përditësohet brenda një minute.")}>
          Ruaj identitetin
        </button>
      </div>
      <div className="menu-translate">
        <strong>Anglisht për turistët</strong>
        {brand.translation ? (
          <>
            <p className="helper">
              Emrat dhe përshkrimet përkthehen vetë në anglisht sa herë ruani një produkt. Për produktet që ekzistonin
              më parë, përktheni të gjitha njëherësh.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(async () => {
                const r = await translateMenu();
                setNote({ text: r.products || r.categories ? `U përkthyen ${r.products} produkte dhe ${r.categories} kategori.` : "Gjithçka është e përkthyer.", error: false });
              }, "")}
            >
              Përkthe menunë
            </button>
          </>
        ) : (
          <p className="helper">Përkthimi automatik nuk është aktiv në këtë server: menuja në anglisht tregon emrat ashtu siç i shkruani.</p>
        )}
      </div>
      {note.text && <p className={note.error ? "warning-text" : "helper"} role="status">{note.text}</p>}
    </section>
  );
}

// Cilësimet → Menuja online: on/off, the link, English category names and table QR codes.
export function OnlineMenuSettings({ venue, state, update, onVenueChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const enabled = Boolean(venue?.menuEnabled);
  const ordering = Boolean(venue?.menuOrdering);
  // Signed per table by the server; a QR code without its key opens the menu but can't order.
  const [keys, setKeys] = useState(null);
  const activeIds = state.tables.filter((t) => t.active).map((t) => t.id).join(",");
  useEffect(() => {
    fetchMenuTables().then((r) => setKeys(Object.fromEntries(r.tables.map((t) => [t.id, t.key])))).catch((e) => setError(e.message));
  }, [activeIds]);
  const tables = keys ? state.tables.filter((t) => t.active && keys[t.id]).sort((a, b) => a.id - b.id) : [];
  const hidden = state.products.filter((p) => p.menuVisible === false).length;
  const cards = tables.map((t) => (
    <figure className="qr-card" key={t.id}>
      <Qr text={menuUrl(t.id, keys[t.id])} />
      <figcaption>
        <strong>Tavolina {String(t.id).padStart(2, "0")}</strong>
        <span>Skanoni për menunë · Scan for the menu</span>
      </figcaption>
    </figure>
  ));
  const save = async (body) => {
    setBusy(true);
    setError("");
    try {
      const r = await saveMenuSettings(body);
      onVenueChange({ ...venue, ...r });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <section className="panel online-menu-panel">
        <div className="online-menu-head">
          <div>
            <h2>Menuja online</h2>
            <p className="helper">Klientët e hapin nga telefoni, në shqip ose anglisht. Çmimet dhe produktet vijnë nga Produktet.</p>
          </div>
          <button className={enabled ? "" : "primary"} onClick={() => save({ enabled: !enabled })} disabled={busy} aria-pressed={enabled}>
            {enabled ? "Çaktivizo menunë" : "Aktivizo menunë"}
          </button>
        </div>
        {error && <div className="notice error" role="alert">{error}</div>}
        <div className={`online-menu-link ${enabled ? "" : "off"}`}>
          <Icon name="location" size={16} />
          <code>{menuUrl()}</code>
          <button
            onClick={() => navigator.clipboard?.writeText(menuUrl()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
          >
            {copied ? "U kopjua" : "Kopjo"}
          </button>
          {enabled && <a className="button-like" href={menuUrl()} target="_blank" rel="noreferrer">Hape</a>}
        </div>
        <p className="helper">
          {enabled ? "Menuja është publike." : "Menuja është e fikur: lidhja tregon \"jo e disponueshme\"."}{" "}
          {state.products.length - hidden} produkte shfaqen{hidden ? `, ${hidden} të fshehura` : ""}. Foton, përshkrimin dhe emrin në anglisht i vendosni te Produktet.
        </p>
      </section>
      <MenuIdentity venueName={venue?.name || "BlueBar"} />
      <section className="panel">
        <div className="online-menu-head">
          <div>
            <h2>Porositë nga klientët</h2>
            <p className="helper">
              Klienti skanon kodin QR të tavolinës, zgjedh produktet dhe dërgon porosinë. Ajo shkon direkt te tavolina dhe
              te repartet (bar, kuzhinë), dhe kamarieri merr njoftim me tingull te Tavolinat. Pagesa bëhet si zakonisht.
            </p>
          </div>
          <button className={ordering ? "" : "primary"} onClick={() => save({ ordering: !ordering })} disabled={busy || !enabled} aria-pressed={ordering}>
            {ordering ? "Ndalo porositë" : "Lejo porositë"}
          </button>
        </div>
        <p className="helper">
          {!enabled
            ? "Aktivizoni fillimisht menunë online."
            : ordering
              ? "Klientët mund të porosisin vetëm nga kodi QR i tavolinës së tyre, dhe vetëm kur turni i kasës është i hapur."
              : "Tani klientët vetëm e shohin menunë."}
        </p>
      </section>
      <section className="panel">
        <h2>Kategoritë në anglisht</h2>
        <p className="helper">Si shfaqen kategoritë kur klienti zgjedh English. Bosh: mbetet emri shqip.</p>
        <div className="category-en-list">
          {state.categories.map((c) => (
            <label className="field" key={c}>
              <span>{c}</span>
              <input
                defaultValue={state.categoryEn?.[c] || ""}
                maxLength={40}
                placeholder={c}
                onBlur={(e) => {
                  const nameEn = e.target.value.trim();
                  if (nameEn !== (state.categoryEn?.[c] || "")) update("category.translate", { name: c, nameEn }, "Kategoria u përkthye.");
                }}
              />
            </label>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="online-menu-head">
          <div>
            <h2>Kodet QR të tavolinave</h2>
            <p className="helper">Printojini dhe vendosini në tavolina: klienti skanon dhe hap menunë.</p>
          </div>
          <button
            onClick={() => {
              // The app is hidden when printing; only this sheet (portalled to <body>) prints.
              document.body.classList.add("qr-print");
              window.addEventListener("afterprint", () => document.body.classList.remove("qr-print"), { once: true });
              window.print();
            }}
            disabled={!tables.length}
          >
            <Icon name="print" size={17} />
            Printo kodet QR
          </button>
        </div>
        <div className="qr-sheet">{cards}</div>
      </section>
      {createPortal(<div className="qr-sheet qr-print-sheet">{cards}</div>, document.body)}
    </>
  );
}

const ago = (date) => {
  const min = Math.floor((Date.now() - new Date(date)) / 60000);
  return min < 1 ? "tani" : `${min} min më parë`;
};
// A short chime when a new guest order arrives: the staff may be across the room.
function chime() {
  try {
    const ctx = new AudioContext();
    for (const [i, f] of [880, 1320].entries()) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.16);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.16 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.16 + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.16);
      o.stop(ctx.currentTime + i * 0.16 + 0.32);
    }
  } catch {}
}

// Anywhere in the app: chime when a new guest order comes in.
// The waiter may be across the room or on another page: chime, buzz, show it in the tab
// title and, where the device allows notifications, as a system notification.
export function GuestOrderAlert({ count, latest }) {
  const seen = React.useRef(count);
  useEffect(() => {
    if (count > seen.current) {
      chime();
      navigator.vibrate?.([120, 80, 120]);
      if (typeof Notification !== "undefined" && Notification.permission === "granted" && latest)
        try {
          new Notification(`Porosi e re · Tavolina ${String(latest.table).padStart(2, "0")}`, {
            body: latest.items.map((i) => `${i.qty} × ${i.name}`).join(", "),
            tag: `guest-${latest.id}`,
            icon: "/apple-touch-icon.png",
          });
        } catch {}
    }
    seen.current = count;
  }, [count]);
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = count ? `(${count}) ${base}` : base;
  }, [count]);
  return null;
}

// Tavolinat: orders guests placed from the menu, waiting for staff. Accept puts them on
// the table and sends them to the stations; reject tells the guest why.
function GuestItems({ order, product }) {
  return (
    <>
      <ul>
        {order.items.map((i, n) => (
          <li key={n}>
            <b>{i.qty} ×</b> {product(i.productId)?.name || "Produkt i hequr"}
            {i.extras.length > 0 && <small> · {i.extras.join(", ")}</small>}
            {i.note && <small className="guest-order-note"> “{i.note}”</small>}
          </li>
        ))}
      </ul>
      {order.note && <p className="guest-order-note">Shënim: “{order.note}”</p>}
    </>
  );
}

// Orders guests sent from the menu straight to the stations: the waiter sees what
// arrived at which table and taps "E pashë".
function GuestAlerts({ alerts, state, update, product }) {
  return alerts.map((g) => {
    const table = state.tables.find((t) => t.id === g.table);
    const owner = table?.waiter ? state.waiters.find((w) => w.id === table.waiter) : null;
    return (
      <article className="guest-order sent" key={`a${g.id}`}>
        <header>
          <strong>Tavolina {String(g.table).padStart(2, "0")}</strong>
          <span>{ago(g.date)}</span>
        </header>
        <p className="guest-order-sent"><Icon name="check" size={15} /> Dërguar te repartet{owner ? ` · ${owner.name}` : ""}</p>
        <GuestItems order={g} product={product} />
        <button type="button" className="primary" onClick={() => update("guest.seen", { id: g.id })}>E pashë</button>
      </article>
    );
  });
}

export function GuestOrders({ state, user, update }) {
  const orders = state.guestOrders || [];
  const alerts = state.guestAlerts || [];
  const [canNotify, setCanNotify] = useState(() => typeof Notification !== "undefined" && Notification.permission === "default");
  const [rejecting, setRejecting] = useState(null);
  const [waiterFor, setWaiterFor] = useState({});
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  if (!orders.length && !alerts.length) return null;
  const product = (id) => state.products.find((p) => p.id === id);
  const count = orders.length + alerts.length;
  return (
    <section className="guest-orders" aria-label="Porosi nga klientët">
      <h2>
        <span className="guest-orders-dot" aria-hidden="true" />
        {count === 1 ? "1 porosi e re nga menuja" : `${count} porosi të reja nga menuja`}
        {canNotify && (
          <button type="button" className="text-button" onClick={() => Notification.requestPermission().then(() => setCanNotify(false))}>
            Njoftime në këtë pajisje
          </button>
        )}
      </h2>
      <div className="guest-orders-list">
        <GuestAlerts alerts={alerts} state={state} update={update} product={product} />
        {orders.map((g) => {
          const table = state.tables.find((t) => t.id === g.table);
          const owner = table?.waiter ? state.waiters.find((w) => w.id === table.waiter) : null;
          const colleague = user.role === "waiter" && owner && owner.id !== user.waiterId;
          const needsWaiter = user.role === "manager" && !owner;
          const waiterId = waiterFor[g.id] ?? state.waiters.find((w) => w.active)?.id;
          const total = g.items.reduce((s, i) => {
            const p = product(i.productId);
            return s + i.qty * ((p?.price || 0) + (p?.extras || []).filter((x) => i.extras.includes(x.name)).reduce((a, x) => a + x.price, 0));
          }, 0);
          return (
            <article className="guest-order" key={g.id}>
              <header>
                <strong>Tavolina {String(g.table).padStart(2, "0")}</strong>
                <span>{ago(g.date)}</span>
              </header>
              <p className="guest-order-wait">Nuk kaloi vetë (p.sh. mbaroi stoku): pranojeni ose refuzojeni.</p>
              <GuestItems order={g} product={product} />
              <p className="guest-order-total">
                <span>{owner ? `Tavolina e ${owner.name}` : "Tavolinë e lirë"}</span>
                <strong>≈ {new Intl.NumberFormat("sq-AL").format(total)} Lek</strong>
              </p>
              {colleague ? (
                <p className="helper">Kjo tavolinë është e {owner.name}: ai/ajo e pranon.</p>
              ) : rejecting?.id === g.id ? (
                <form
                  className="guest-order-reject"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await update("guest.reject", { id: g.id, reason: rejecting.reason }, "Porosia u refuzua.")) setRejecting(null);
                  }}
                >
                  <input
                    autoFocus
                    maxLength={200}
                    placeholder="Arsyeja për klientin (opsionale)"
                    value={rejecting.reason}
                    onChange={(e) => setRejecting({ id: g.id, reason: e.target.value })}
                  />
                  <div className="actions">
                    <button type="button" onClick={() => setRejecting(null)}>Kthehu</button>
                    <button className="danger-button">Refuzo</button>
                  </div>
                </form>
              ) : (
                <>
                  {needsWaiter && (
                    <label className="field">
                      <span>Kamarieri i tavolinës</span>
                      <select value={waiterId ?? ""} onChange={(e) => setWaiterFor((m) => ({ ...m, [g.id]: Number(e.target.value) }))}>
                        {state.waiters.filter((w) => w.active).map((w) => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="actions">
                    <button type="button" onClick={() => setRejecting({ id: g.id, reason: "" })}>Refuzo</button>
                    <button
                      type="button"
                      className="primary"
                      onClick={() =>
                        update("guest.accept", { id: g.id, ...(needsWaiter ? { waiterId } : {}) }, `Porosia e tavolinës ${g.table} u pranua dhe u dërgua.`)
                      }
                    >
                      <Icon name="check" size={17} />
                      Prano dhe dërgo
                    </button>
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
