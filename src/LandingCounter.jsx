import React, { useEffect, useRef, useState } from "react";
import { parseOrder } from "./voice.js";

// One order through BlueBar's three screens, usable: the waiter's phone takes it, Repartet (the
// bar and kitchen screen, drawn like the app's) gets one slip per station and drops it on
// "Gati", the till takes the payment,
// prints the receipt and adds it to the day. Sample menu, prices, tables and day totals.
// Names are [English, Albanian]; t(en, sq) from the landing picks one.
const MENU = [
  { id: 1, names: ["Espresso", "Espresso"], price: 100, dept: "Bar" },
  { id: 2, names: ["Macchiato", "Makiato"], price: 120, dept: "Bar" },
  { id: 3, names: ["Aperol Spritz", "Aperol Spritz"], price: 600, dept: "Bar" },
  { id: 4, names: ["Korça beer", "Birrë Korça"], price: 250, dept: "Bar" },
  { id: 5, names: ["Club sandwich", "Sanduiç klub"], price: 550, dept: "Kuzhina" },
  { id: 6, names: ["Tiramisu", "Tiramisu"], price: 450, dept: "Kuzhina" },
];
const menu = (t) => MENU.map((m) => ({ ...m, name: t(...m.names) }));
const TABLES = [2, 3, 5, 8];
const DEPTS = ["Bar", "Kuzhina"];
const clock = (minsAgo = 0) => {
  const d = new Date(Date.now() - minsAgo * 60000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const SEED = () => [{ key: "seed", table: 6, dept: "Kuzhina", lines: { 5: 2 }, at: clock(4), mins: 4, who: "Erion Gashi" }];
const deptName = (d, t) => (d === "Kuzhina" ? t("Kitchen", "Kuzhina") : d);
const steps = (t) => [t("Pick a table", "Zgjidhni tavolinën"), t("Add products", "Shtoni produkte"), t("Send it", "Dërgojeni"), t("Mark it ready", "Shënojeni gati"), t("Take payment", "Merrni pagesën")];
const hints = (t) => [
  t("Tap a table on the phone", "Prekni një tavolinë në telefon"),
  t("Add from the menu, or tap the microphone and say it", "Shtoni nga menuja, ose prekni mikrofonin dhe thuajeni"),
  t("Tap “Send”", "Shtypni “Dërgo”"),
  t("On the stations screen, tap “Ready” on the table’s slips", "Te Repartet, shtypni “Gati” në fletët e tavolinës"),
  t("Choose Cash or Card", "Zgjidhni Cash ose Kartë"),
];

// What a waiter might say into the phone. Read by the app's own parser (voice.js), so the
// demo turns them into lines the same way BlueBar does after the recording.
export const phrases = (t) => t(
  ["two macchiatos and one tiramisu", "two korça beers, no, aperol, and one club sandwich", "three espressos and one tiramisu"],
  ["dy makiato dhe një tiramisu", "dy birra korça, jo, aperol, dhe një sanduiç klub", "tre espresso dhe një tiramisu"],
);
export const heard = (text, t) => parseOrder(text, menu(t)).map(({ product, qty }) => [product, qty]);

// Types a phrase out a letter at a time, like speech recognition filling in; calls onDone at
// the end. With reduced motion the whole phrase appears at once.
export function useTyping(text, onDone) {
  const [n, setN] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => setN(0), [text]);
  useEffect(() => {
    if (!text) return;
    if (n >= text.length) return void done.current?.();
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setN(still ? text.length : n + 1), still ? 0 : 42);
    return () => clearTimeout(t);
  }, [text, n]);
  return text ? text.slice(0, n) : "";
}
export function Mic({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
}
export function Wave({ on }) {
  return <span className={`tc-wave ${on ? "on" : ""}`} aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <i key={i} />)}</span>;
}

const byId = (id) => MENU.find((m) => m.id === Number(id));
const lek = (n) => `${n.toLocaleString("en-US")} Lek`;
const pad = (n) => String(n).padStart(2, "0");
const count = (lines) => Object.values(lines).reduce((s, q) => s + q, 0);
const sum = (lines) => Object.entries(lines).reduce((s, [id, q]) => s + byId(id).price * q, 0);
// On a phone the three screens stack, so bring the one that just changed into view.
const reveal = (el) => setTimeout(() => el?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }), 80);
const merge = (a, b) => Object.entries(b).reduce((all, [id, q]) => ({ ...all, [id]: (all[id] || 0) + q }), a);

export function Counter({ t }) {
  const MENU = menu(t);
  const PHRASES = phrases(t);
  const name = (id) => MENU.find((m) => m.id === Number(id)).name;
  const [table, setTable] = useState(null);
  const [cart, setCart] = useState({});
  const [sent, setSent] = useState({});
  const [tickets, setTickets] = useState(SEED);
  const [filter, setFilter] = useState("all");
  const [reprinted, setReprinted] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [day, setDay] = useState({ total: 48650, bills: 37, no: 129 });
  const [note, setNote] = useState("");
  const [saying, setSaying] = useState(null);
  const [said, setSaid] = useState(0);
  const typed = useTyping(saying, () => {
    const lines = heard(saying, t);
    setCart((c) => lines.reduce((all, [m, q]) => ({ ...all, [m.id]: (all[m.id] || 0) + q }), c));
    setNote(`${t("Added", "Shtova")}: ${lines.map(([m, q]) => `${q} ${m.name}`).join(", ")}.`);
    setTimeout(() => setSaying(null), 700);
  });
  const speak = () => {
    if (!table) return setNote(t("Pick a table first.", "Zgjidhni fillimisht tavolinën."));
    setSaying(PHRASES[said % PHRASES.length]);
    setSaid(said + 1);
  };
  const board = useRef(null);
  const foot = useRef(null);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(""), 2600);
    return () => clearTimeout(t);
  }, [note]);

  const mine = tickets.filter((t) => t.table === table && !t.leaving);
  const step = receipt ? 5 : !table ? 0 : count(cart) ? 2 : !count(sent) ? 1 : mine.length ? 3 : 4;
  const target = (n) => (step === n ? "tc-target" : "");

  const add = (m) => (table ? setCart({ ...cart, [m.id]: (cart[m.id] || 0) + 1 }) : setNote(t("Pick a table first.", "Zgjidhni fillimisht tavolinën.")));
  const minus = (id) => {
    const next = { ...cart, [id]: cart[id] - 1 };
    if (!next[id]) delete next[id];
    setCart(next);
  };
  const send = () => {
    const depts = DEPTS.filter((d) => Object.keys(cart).some((id) => byId(id).dept === d));
    const fresh = depts.map((dept) => ({
      key: `${Date.now()}-${dept}`, table, dept, at: clock(), mins: 0, who: "Ana Hoxha",
      lines: Object.fromEntries(Object.entries(cart).filter(([id]) => byId(id).dept === dept)),
    }));
    setTickets([...tickets, ...fresh]);
    setSent(merge(sent, cart));
    setCart({});
    setFilter("all");
    setNote(t(`Sent to ${depts.map((d) => deptName(d, t)).join(" and ")}.`, `U dërgua te ${depts.join(" dhe ")}.`));
    reveal(board.current);
  };
  // "Gati" takes the slip off the screen, as in the app; it slides out first.
  const ready = (slip) => {
    setTickets((all) => all.map((x) => (x.key === slip.key ? { ...x, leaving: true } : x)));
    setTimeout(() => setTickets((all) => all.filter((x) => x.key !== slip.key)), 320);
    if (slip.table === table) setNote(t(`Table ${pad(slip.table)}: ${deptName(slip.dept, t)} ready.`, `Tavolina ${pad(slip.table)}: ${slip.dept} gati.`));
    if (mine.length === 1 && mine[0].key === slip.key) reveal(foot.current);
  };
  const pay = (method) => {
    const total = sum(sent);
    const given = method === "cash" ? Math.ceil((total + 1) / 500) * 500 : null;
    setReceipt({ no: day.no, table, lines: sent, total, method, given });
    setDay({ total: day.total + total, bills: day.bills + 1, no: day.no + 1 });
    setTable(null);
    setSent({});
  };
  const again = () => {
    setReceipt(null);
    if (!tickets.length) setTickets(SEED());
  };
  const shown = tickets.filter((x) => filter === "all" || x.dept === filter);
  const table_ = (n) => t(`Table ${pad(n)}`, `Tavolina ${pad(n)}`);

  return (
    <div className="tc">
      <ol className="tc-steps" aria-label={t("Demo steps", "Hapat e provës")}>
        {steps(t).map((label, n) => (
          <li key={label} className={n < step ? "done" : n === step ? "now" : ""}><span>{n < step ? "✓" : n + 1}</span>{label}</li>
        ))}
      </ol>

      <div className="tc-stage">
        <figure className="tc-col">
          <figcaption>{t("The waiter’s phone", "Telefoni i kamarierit")}</figcaption>
          <div className="tc-phone">
            <div className="tc-phone-screen">
              <div className="tc-phone-top"><span>{t("Ana · Floor", "Ana · Salla")}</span><b>{table ? table_(table) : t("Pick a table", "Zgjidhni tavolinën")}</b></div>
              <div className={`tc-tables ${target(0)}`}>
                {TABLES.map((n) => (
                  <button key={n} type="button" aria-pressed={table === n} disabled={!!count(sent) || !!count(cart)} onClick={() => (setTable(n), setReceipt(null))}>{pad(n)}</button>
                ))}
              </div>
              <div className="tc-menu-head"><span>{t("Menu", "Menuja")}</span><button type="button" className={`tc-mic ${saying ? "on" : ""} ${step === 1 ? "tc-target" : ""}`} onClick={speak} disabled={!!saying}><Mic size={16} />{saying ? t("Listening…", "Po dëgjon…") : t("Order by voice", "Porosit me zë")}</button></div>
              <div className="tc-menu">
                {MENU.map((m) => (
                  <button key={m.id} type="button" onClick={() => add(m)} aria-label={`${t("Add", "Shto")} ${m.name}, ${lek(m.price)}`}>
                    <b>{m.name}</b><small>{lek(m.price)}</small>{cart[m.id] > 0 && <i key={cart[m.id]}>{cart[m.id]}</i>}
                  </button>
                ))}
              </div>
              <ul className="tc-lines">
                {Object.entries(sent).map(([id, q]) => <li key={`s${id}`} className="is-sent"><span>✓</span>{q} × {name(id)}<b>{lek(byId(id).price * q)}</b></li>)}
                {Object.entries(cart).map(([id, q]) => (
                  <li key={`c${id}`}><button type="button" aria-label={`${t("One less", "Një më pak")} ${name(id)}`} onClick={() => minus(id)}>−</button>{q} × {name(id)}<b>{lek(byId(id).price * q)}</b></li>
                ))}
                {table && !count(sent) && !count(cart) && <li className="tc-empty">{t("The order is empty.", "Porosia është bosh.")}</li>}
              </ul>
              <div className="tc-phone-foot" ref={foot}>
                <p><span>{t("Total", "Totali")}</span><b>{lek(sum(merge(sent, cart)))}</b></p>
                {count(cart) > 0 || !count(sent) ? (
                  <button type="button" className={`tc-primary ${target(2)}`} disabled={!count(cart)} onClick={send}>{t("Send", "Dërgo")}</button>
                ) : (
                  <div className={`tc-pay ${target(4)}`}>
                    <button type="button" onClick={() => pay("cash")}>Cash</button>
                    <button type="button" className="tc-primary" onClick={() => pay("card")}>{t("Card", "Kartë")}</button>
                  </div>
                )}
              </div>
              {note && <div className="tc-note" key={note}>{note}</div>}
              {saying && <div className="tc-voice" aria-live="polite"><Wave on={typed.length < saying.length} /><p>“{typed}<i aria-hidden="true" />”</p></div>}
            </div>
          </div>
        </figure>

        <figure className="tc-col tc-col-board">
          <figcaption>{t("Stations: the bar and kitchen screen", "Repartet: ekrani i barit dhe kuzhinës")}</figcaption>
          <div className="tc-board" ref={board}>
            <h4>{t("Waiting slips", "Fletët në pritje")}</h4>
            <p className="tc-board-sub">{t(`${tickets.length} slips to prepare · they leave when you tap “Ready”`, `${tickets.length} fletë për t’u përgatitur · largohen kur shtypni “Gati”`)}</p>
            <div className="tc-filter" role="group" aria-label={t("Filter by station", "Filtro repartin")}>
              {[["all", t("All", "Të gjitha")], ...DEPTS.map((d) => [d, deptName(d, t)])].map(([key, label]) => {
                const n = tickets.filter((x) => x.dept === key).length;
                return <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}{key !== "all" && n > 0 && <span>{n}</span>}</button>;
              })}
            </div>
            <div className="tc-queue">
              {shown.map((slip) => (
                <article key={slip.key} className={`tc-ticket ${slip.leaving ? "is-leaving" : ""} ${slip.table === table ? "is-mine" : ""}`}>
                  <small>{deptName(slip.dept, t).toUpperCase()}</small>
                  <header><strong>{table_(slip.table)}</strong><span>{t("Round 1", "Raundi 1")}</span></header>
                  <p className="tc-ticket-meta">{slip.at} · {slip.mins ? t(`${slip.mins} min ago`, `${slip.mins} min më parë`) : t("now", "tani")} · {slip.who}</p>
                  <ul>{Object.entries(slip.lines).map(([id, q]) => <li key={id}><b>{q}</b> × {name(id)}</li>)}</ul>
                  <div className="tc-ticket-actions">
                    <button type="button" className={slip.table === table && mine[0]?.key === slip.key ? "tc-target" : ""} disabled={slip.leaving} onClick={() => ready(slip)}>{t("Ready", "Gati")}</button>
                    <button type="button" className="tc-reprint" onClick={() => setReprinted(slip.key)}>{reprinted === slip.key ? t("Printed ✓", "U printua ✓") : t("Print again", "Printo sërish")}</button>
                  </div>
                </article>
              ))}
              {!shown.length && <p className="tc-quiet">{t("No slips waiting.", "Asnjë fletë në pritje.")}</p>}
            </div>
          </div>
        </figure>

        <figure className="tc-col">
          <figcaption>{t("The till", "Arka")}</figcaption>
          <div className="tc-till">
            <dl>
              <div><dt>{t("Today’s takings", "Xhiro sot")}</dt><dd key={day.total}>{lek(day.total)}</dd></div>
              <div><dt>{t("Bills", "Fatura")}</dt><dd key={day.bills}>{day.bills}</dd></div>
            </dl>
            <div className="tc-receipt-out">
              {receipt ? (
                <div className="tc-receipt" key={receipt.no}>
                  <strong>Bar Aurora</strong>
                  <span>{t("Bill", "Fatura")} D-{receipt.no} · {table_(receipt.table)}</span>
                  <hr />
                  {Object.entries(receipt.lines).map(([id, q]) => <p key={id}><span>{q} × {name(id)}</span><b>{lek(byId(id).price * q)}</b></p>)}
                  <hr />
                  <p className="tc-receipt-total"><span>{t("TOTAL", "TOTALI")}</span><b>{lek(receipt.total)}</b></p>
                  {receipt.given ? <><p><span>Cash</span><b>{lek(receipt.given)}</b></p><p><span>{t("Change", "Kusuri")}</span><b>{lek(receipt.given - receipt.total)}</b></p></> : <p><span>{t("Card", "Kartë")}</span><b>{lek(receipt.total)}</b></p>}
                  <span>{t("Fiscalized · Thank you!", "Fiskalizuar · Faleminderit!")}</span>
                </div>
              ) : <p className="tc-quiet">{t("The bill prints here after payment.", "Fatura del këtu pas pagesës.")}</p>}
            </div>
            {receipt && <button type="button" className="tc-again" onClick={again}>{t("Another order", "Edhe një porosi")}</button>}
          </div>
        </figure>
      </div>
      <p className="tc-hint" aria-live="polite">{step < 5 ? `${t("Step", "Hapi")} ${step + 1}: ${hints(t)[step]}` : t(`Done. Bill D-${receipt.no} printed and the table is free.`, `Gati. Fatura D-${receipt.no} u printua dhe tavolina u lirua.`)}</p>
    </div>
  );
}
