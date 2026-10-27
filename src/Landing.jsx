import React, { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import "./landing.css";
import { Counter, Mic, Wave, heard, phrases, useTyping } from "./LandingCounter.jsx";

const REGISTER = "/?regjistro";
const SIGN_IN = "/?hyr";

// English by default; the visitor's choice is kept in this browser.
const LANG_KEY = "bluebar-landing-lang";
function savedLang() {
  try { return localStorage.getItem(LANG_KEY) === "sq" ? "sq" : "en"; } catch { return "en"; }
}

function Symbol({ name, size = 20 }) {
  const paths = {
    check: <path d="m5 12 4 4L19 6" />,
    plus: <path d="M5 12h14m-7-7v14" />,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    box: <path d="M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5 9-5m-9 5v8" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7m2 3a6.5 6.5 0 0 1 3.5 5.5" /></>,
    list: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
    key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9m-4 4 3 3m-5-1 2 2" /></>,
    devices: <><rect x="2" y="4" width="14" height="11" rx="2" /><rect x="17.5" y="8" width="4.5" height="12" rx="1.5" /><path d="M6 19h7" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function Brand({ t }) {
  return <a className="lp-brand" href="/" aria-label={t("BlueBar, home", "BlueBar, faqja kryesore")}><span className="lp-mark" aria-hidden="true">b.</span>BlueBar</a>;
}

// What BlueBar does, one screen at a time. Pictures are real screens from the sample venue
// Bar Aurora, cropped to the page itself (no sidebar or top bar).
const features = (t) => [
  {
    id: "salla", tab: t("Floor", "Salla"),
    title: t("One look at the floor and you know who's waiting for the bill.", "Një shikim te salla dhe e dini kush pret llogarinë."),
    points: t(
      ["Occupied tables light up, with the waiter's name and the amount", "Main room, terrace or upstairs, laid out the way your venue is", "The total of open orders stays at the top all evening"],
      ["Tavolinat e zëna dalin me ngjyrë, me emrin e kamarierit dhe shumën", "Salla, tarraca ose kati i dytë, ashtu si i keni në lokal", "Totali i porosive të hapura qëndron lart gjithë mbrëmjen"],
    ),
    img: ["/landing/page-salla.webp", 2574, 1604, t("The floor plan with 10 tables in the main room and on the terrace, round, square and long.", "Plani i sallës me 10 tavolina në sallë dhe në tarracë, të rrumbullakëta, katrore dhe të gjata.")],
  },
  {
    id: "porosia", tab: t("Ordering", "Porosia"),
    title: t("The waiter takes the order at the table and stops running to the counter.", "Kamarieri e merr porosinë te tavolina dhe s’vrapon më te banaku."),
    points: t(
      ["Search the menu, change quantities, add notes like “no sugar”", "Or just say it: “two macchiatos and a water”", "On the second round only the new items are sent"],
      ["Kërkon në menu, ndryshon sasinë, shton shënime si “pa sheqer”", "Ose e thotë me zë: “dy makiato dhe një ujë”", "Në raundin e dytë dërgohen vetëm artikujt e rinj"],
    ),
    img: ["/landing/page-porosia.webp", 2476, 1700, t("Table 10's order: menu on the left, order on the right, ready to send to the stations.", "Porosia e Tavolinës 10: menuja majtas, porosia djathtas, gati për t’u dërguar në repartet.")],
  },
  {
    id: "repartet", tab: t("Bar and kitchen", "Bari dhe kuzhina"),
    title: t("The bar gets the drinks, the kitchen gets the plates, and nobody reads the other's slip.", "Bari merr pijet, kuzhina pjatat, dhe askush s’lexon fletën e tjetrit."),
    points: t(
      ["Every item goes straight to its own station", "The kitchen taps “Ready” and the waiter sees it on their phone", "Prints directly, without the browser's print window"],
      ["Çdo artikull shkon vetë te reparti i vet", "Kuzhina shtyp “Gati” dhe kamarieri e sheh në telefon", "Printon direkt, pa dritaren e printimit të shfletuesit"],
    ),
    img: ["/landing/page-repartet.webp", 2354, 1109, t("Slips waiting for the Bar and the Kitchen.", "Fletët në pritje për Barin dhe Kuzhinën.")],
  },
  {
    id: "faturat", tab: t("Payments", "Pagesat"),
    title: t("Cash, card or “everyone pays their own”: the bill comes out right.", "Cash, kartë apo “secili të vetën”: llogaria del e saktë."),
    points: t(
      ["BlueBar works out the change, not the waiter in their head", "Fiscalization through BlueBill", "A manager can correct a closed bill, but has to write down why"],
      ["Kusurin e llogarit BlueBar, jo kamarieri me mend", "Fiskalizim përmes BlueBill", "Menaxheri mund ta korrigjojë një faturë të mbyllur, por duhet të shkruajë arsyen"],
    ),
    img: ["/landing/page-faturat.webp", 2354, 1267, t("The bill register with bill D-8 open.", "Regjistri i faturave me faturën D-8 të hapur.")],
  },
  {
    id: "raportet", tab: t("Reports", "Raportet"),
    title: t("Close the shift and know what should be in the till before you count it.", "Mbyllni turnin dhe e dini sa duhet të ketë arka, para se ta numëroni."),
    points: t(
      ["Sales by hour, by waiter and by product", "Cash and card kept apart", "One CSV for your accountant, in one click"],
      ["Shitjet sipas orës, kamarierit dhe produktit", "Cash dhe kartë veç e veç", "Një CSV për kontabilistin, me një klik"],
    ),
    img: ["/landing/page-raportet.webp", 2354, 921, t("The day's report: sales, cash, card and best sellers.", "Raporti i ditës: shitjet, cash, kartë dhe produktet më të shitura.")],
  },
  {
    id: "menuja", tab: t("Online menu", "Menuja online"),
    title: t("Tourists scan the QR code and read the menu in their own language.", "Turisti skanon kodin QR dhe e lexon menunë në gjuhën e vet."),
    points: t(
      ["Six languages, translated automatically", "Prices in euros too, if you want", "When guests order themselves, the waiter approves it before it reaches the bar"],
      ["Gjashtë gjuhë, të përkthyera automatikisht", "Çmimet edhe në euro, po ta doni", "Kur klienti porosit vetë, kamarieri e miraton para se të shkojë te bari"],
    ),
    phone: ["/landing/phone-menuja.webp", 1170, 2532, t("Bar Aurora's online menu, in English.", "Menuja online e Bar Aurora, në anglisht.")],
  },
];

function Shot({ f }) {
  return (
    <div className={`lp-shot ${f.phone ? "is-phone" : ""}`} key={f.id}>
      {f.img && <div className="lp-browser"><div className="lp-browser-bar" aria-hidden="true"><i /><i /><i /></div><img src={f.img[0]} width={f.img[1]} height={f.img[2]} alt={`BlueBar: ${f.img[3]}`} loading="lazy" /></div>}
      {f.phone && <img className="lp-phone" src={f.phone[0]} width={f.phone[1]} height={f.phone[2]} alt={`BlueBar: ${f.phone[3]}`} loading="lazy" />}
    </div>
  );
}

// A numbered list on the left, one open at a time; its screen sits beside it (inside it on a
// phone, where there's no room beside).
function Features({ t }) {
  const [open, setOpen] = useState(0);
  const FEATURES = features(t);
  return (
    <div className="lp-features">
      <div className="lp-acc">
        {FEATURES.map((f, i) => (
          <div key={f.id} className={`lp-acc-item ${i === open ? "is-open" : ""}`}>
            <h3><button type="button" aria-expanded={i === open} aria-controls={i === open ? `acc-${f.id}` : undefined} onClick={() => setOpen(i)}><span>{String(i + 1).padStart(2, "0")}</span>{f.tab}</button></h3>
            {i === open && (
              <div className="lp-acc-body" id={`acc-${f.id}`}>
                <p className="lp-acc-title">{f.title}</p>
                <ul>{f.points.map((p) => <li key={p}><Symbol name="check" size={18} />{p}</li>)}</ul>
                <div className="lp-acc-inline"><Shot f={f} /></div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="lp-features-media"><Shot f={FEATURES[open]} /></div>
    </div>
  );
}

// Ordering by voice: a phrase types itself out as if heard, then turns into order lines through
// the app's own parser. Plays once when it comes into view; the examples replay it.
function Voice({ t }) {
  const PHRASES = phrases(t);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const card = useRef(null);
  const typed = useTyping(playing ? PHRASES[i] : null, () => setPlaying(false));
  const play = (n) => (setI(n), setPlaying(true));
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (play(0), io.disconnect()), { threshold: 0.6 });
    io.observe(card.current);
    return () => io.disconnect();
  }, []);
  useEffect(() => setPlaying(false), [t]);
  const lines = playing ? [] : heard(PHRASES[i], t);
  return (
    <div className="lp-voice-card" ref={card}>
      <div className="lp-voice-top"><span><Mic size={16} />{t("Table 11 · Ana", "Tavolina 11 · Ana")}</span><Wave on={playing} /></div>
      <p className="lp-voice-said">“{playing ? typed : PHRASES[i]}{playing && <i aria-hidden="true" />}”</p>
      <ul className="lp-voice-lines" aria-live="polite">
        {lines.map(([m, q]) => <li key={m.id}><b>{q} ×</b> {m.name}<span>{(m.price * q).toLocaleString("en-US")} Lek</span></li>)}
        {playing && <li className="lp-voice-wait">{t("Listening…", "Po dëgjon…")}</li>}
      </ul>
      <div className="lp-voice-try" role="group" aria-label={t("Hear an example", "Dëgjoni një shembull")}>
        {PHRASES.map((p, n) => <button key={p} type="button" aria-pressed={n === i} disabled={playing} onClick={() => play(n)}>“{p}”</button>)}
      </div>
    </div>
  );
}

const facts = (t) => [
  [t("By voice", "Me zë"), t("the waiter says the order instead of typing it", "kamarieri e thotë porosinë, s’e shkruan")],
  [t("6 languages", "6 gjuhë"), t("on the online menu with a QR code", "në menunë online me kod QR")],
  ["BlueBill", t("fiscalizes every bill", "për fiskalizimin e çdo fature")],
  [t("0 installs", "0 instalime"), t("opens in the browser, on any device", "hapet në shfletues, në çdo pajisje")],
];
const steps = (t) => [
  [t("Register your venue", "Regjistroni lokalin"), t("The venue's name, a code for your staff and your PIN. About two minutes.", "Emri i lokalit, një kod për stafin dhe PIN-i juaj. Rreth dy minuta.")],
  [t("Add your menu and tables", "Shtoni menunë dhe tavolinat"), t("Products with prices, categories, the main room and the terrace. If your menu is in Excel, import it as it is.", "Produktet me çmimet, kategoritë, salla dhe tarraca. Nëse menuja është në Excel, e importoni siç është.")],
  [t("Open the shift", "Hapni turnin"), t("Waiters sign in with a PIN from their own phones. Printers can be connected later.", "Kamarierët hyjnë me PIN nga telefonat e tyre. Printerët mund t’i lidhni edhe më vonë.")],
];
const more = (t) => [
  ["box", t("Inventory", "Inventari"), t("Every sale lowers the stock by itself; deliveries and waste are logged with a reason.", "Çdo shitje e ul stokun vetë; furnizimet dhe humbjet shënohen me arsye.")],
  ["clock", t("Shifts and the till", "Turnet dhe arka"), t("Opening float, cash in, cash out and the count at the end of the shift.", "Fondi i fillimit, hyrjet, daljet dhe numërimi në fund të turnit.")],
  ["users", t("Staff", "Stafi"), t("Waiters sign in with a PIN or pattern, and only from the venue's network.", "Kamarierët hyjnë me PIN ose pattern, dhe vetëm nga rrjeti i lokalit.")],
  ["list", t("Audit log", "Auditimi"), t("Who changed what and when, for every action without exception.", "Kush ndryshoi çfarë dhe kur, për çdo veprim pa përjashtim.")],
  ["key", t("Sign in with LuxHotel", "Hyrje me LuxHotel"), t("For hotels that run on LuxHotel System.", "Për hotelet që punojnë me LuxHotel System.")],
  ["devices", t("On any device", "Në çdo pajisje"), t("Phone, tablet or the till computer. Install it as an app if you like.", "Telefon, tablet ose kompjuteri i kasës. Po deshët, instalohet si aplikacion.")],
];
const questions = (t) => [
  [t("How much does it cost?", "Sa kushton?"), t("It depends on your venue: how many tables you have and how many devices you'll use. Write to us and we'll send you an offer.", "Varet nga lokali: sa tavolina keni dhe sa pajisje do të përdorni. Na shkruani dhe ju dërgojmë ofertën.")],
  [t("What do I need to get started?", "Çfarë më duhet për të filluar?"), t("A phone, tablet or computer with internet. Receipt and station printers are optional; add them when you need them.", "Një telefon, tablet ose kompjuter me internet. Printerët e faturave dhe të reparteve janë opsionalë; mund t’i shtoni kur t’ju duhen.")],
  [t("Does it work with the printers I have?", "A punon me printerët që kam?"), t("With network printers and those connected to the till computer, but it depends on the model. Run a test print in Settings before your first shift.", "Me printerët e rrjetit dhe me ata të lidhur te kompjuteri i kasës, por varet nga modeli. Bëni një provë printimi te Cilësimet para turnit të parë.")],
  [t("How does fiscalization work?", "Si funksionon fiskalizimi?"), t("Through BlueBill, once you connect your business account. You see the status of every bill in the app.", "Përmes BlueBill, pasi të lidhni llogarinë e biznesit. Statusin e çdo fature e shihni në aplikacion.")],
  [t("Does it work offline?", "A punon pa internet?"), t("No. Orders and payments are saved on the server; when the connection drops, BlueBar tells you and never treats an action as done without confirmation.", "Jo. Porositë dhe pagesat ruhen në server; kur bie lidhja, BlueBar ju lajmëron dhe nuk e quan asnjë veprim të kryer pa konfirmim.")],
];

export function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [lang, setLang] = useState(savedLang);
  const t = useCallback((en, sq) => (lang === "sq" ? sq : en), [lang]);
  // The page cross-fades into the other language where the browser can; otherwise it just swaps.
  const switchLang = (next) => {
    if (next === lang) return;
    if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return setLang(next);
    document.startViewTransition(() => flushSync(() => setLang(next)));
  };
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t("BlueBar · In step with your venue", "BlueBar · Në ritmin e lokalit tuaj");
    try { localStorage.setItem(LANG_KEY, lang); } catch {}
  }, [lang, t]);
  const nav = [["#vecorite", t("Features", "Veçoritë")], ["#provo", t("Try it", "Provojeni")], ["#fillimi", t("Getting started", "Si fillohet")], ["#pyetje", t("Questions", "Pyetje")]];
  return (
    <div className="lp">
      <a className="lp-skip" href="#permbajtja">{t("Skip to content", "Kalo te përmbajtja")}</a>
      <header className="lp-header">
        <div className="lp-wrap lp-header-inner">
          <Brand t={t} />
          <nav className="lp-nav" aria-label={t("Main navigation", "Navigimi kryesor")}>{nav.map(([h, l]) => <a key={h} href={h}>{l}</a>)}</nav>
          <div className="lp-header-actions">
            <div className="lp-lang" data-lang={lang} role="group" aria-label="Language · Gjuha">
              <button type="button" lang="en" aria-label="English" aria-pressed={lang === "en"} onClick={() => switchLang("en")}>EN</button>
              <button type="button" lang="sq" aria-label="Shqip" aria-pressed={lang === "sq"} onClick={() => switchLang("sq")}>SQ</button>
            </div>
            <a className="lp-login" href={SIGN_IN}>{t("Sign in", "Hyr")}</a>
            <a className="lp-button lp-button-small" href={REGISTER}>{t("Register your venue", "Regjistro lokalin")}</a>
            <button className="lp-menu-toggle" type="button" aria-label={menuOpen ? t("Close menu", "Mbyll menunë") : t("Open menu", "Hap menunë")} aria-expanded={menuOpen} aria-controls="lp-mobile-nav" onClick={() => setMenuOpen(!menuOpen)}><Symbol name={menuOpen ? "close" : "menu"} /></button>
          </div>
        </div>
        {menuOpen && <nav className="lp-mobile-nav" id="lp-mobile-nav" aria-label={t("Mobile navigation", "Navigimi në telefon")}>{nav.map(([h, l]) => <a key={h} href={h} onClick={() => setMenuOpen(false)}>{l}</a>)}<a href={SIGN_IN}>{t("Sign in to your account", "Hyr në llogari")}</a><a href={REGISTER}>{t("Register your venue", "Regjistro lokalin")}</a></nav>}
      </header>
      <main id="permbajtja" tabIndex={-1}>
        <section className="lp-hero">
          <div className="lp-wrap lp-hero-inner">
            <div className="lp-hero-copy">
              <p className="lp-eyebrow lp-live">{t("Point of sale for bars, cafés and restaurants", "Arka për bare, kafene dhe restorante")}</p>
              <h1>{t("Full house, ", "Salla plot, ")}<em>{t("till in order.", "arka në rregull.")}</em></h1>
              <p className="lp-lead">{t("The waiter takes the order on their phone, by touch or by voice; the bar and the kitchen each get their own slip, and when you close the shift you know what should be in the till before you count it.", "Kamarieri e merr porosinë në telefon, me prekje ose me zë; bari dhe kuzhina marrin secili fletën e vet, dhe kur mbyllni turnin e dini sa duhet të ketë arka para se ta numëroni.")}</p>
              <div className="lp-actions">
                <a className="lp-button" href={REGISTER}>{t("Register your venue", "Regjistro lokalin")}</a>
                <a className="lp-button lp-button-ghost" href="#provo">{t("Try it here, no account needed", "Provojeni këtu, pa llogari")}</a>
              </div>
            </div>
            <div className="lp-hero-media">
              <div className="lp-browser"><div className="lp-browser-bar" aria-hidden="true"><i /><i /><i /></div><img src="/landing/app-tavolinat.webp" width="2880" height="1520" alt={t("BlueBar: Bar Aurora's floor, 7 occupied tables with their waiter and amount.", "BlueBar: salla e Bar Aurora, 7 tavolina të zëna me kamarierin dhe shumën.")} fetchPriority="high" /></div>
              <img className="lp-phone lp-hero-phone" src="/landing/phone-porosia.webp" width="1170" height="2100" alt={t("BlueBar on the waiter's phone: Table 11's order.", "BlueBar në telefonin e kamarierit: porosia e Tavolinës 11.")} />
            </div>
          </div>
          <dl className="lp-wrap lp-facts">{facts(t).map(([big, small]) => <div key={big}><dt>{big}</dt><dd>{small}</dd></div>)}</dl>
        </section>

        <section className="lp-section" id="vecorite" aria-labelledby="features-heading">
          <div className="lp-wrap">
            <div className="lp-head-split">
              <div><p className="lp-eyebrow">{t("What it does", "Çfarë bën")}</p><h2 id="features-heading">{t("Everyone in the venue sees ", "Secili në lokal sheh ")}<em>{t("only what they need.", "vetëm atë që i duhet.")}</em></h2></div>
              <p className="lp-sub">{t("Pick a part and see the real screen. The data comes from Bar Aurora, our sample venue.", "Zgjidhni një pjesë dhe shihni ekranin e vërtetë. Të dhënat janë nga Bar Aurora, lokali ynë shembull.")}</p>
            </div>
            <Features t={t} />
          </div>
        </section>

        <section className="lp-section lp-section-night lp-voice" id="zeri" aria-labelledby="voice-heading">
          <div className="lp-wrap lp-voice-inner">
            <div>
              <p className="lp-eyebrow">{t("Ordering by voice", "Porosia me zë")}</p>
              <h2 id="voice-heading">{t("The waiter says it, ", "Kamarieri e thotë, ")}<em>{t("BlueBar writes it down.", "BlueBar e shkruan.")}</em></h2>
              <p className="lp-sub">{t("On the order screen, the waiter taps the microphone and says what the table asked for, the way they normally would. BlueBar turns it into items from your menu, with quantities, and the waiter checks the list before sending it.", "Te porosia, kamarieri shtyp mikrofonin dhe thotë atë që kërkoi tavolina, ashtu si e thotë zakonisht. BlueBar e kthen në artikuj nga menuja juaj, me sasitë, dhe kamarieri e sheh listën para se ta dërgojë.")}</p>
              <ul className="lp-voice-points">
                <li><Symbol name="check" size={18} />{t("Understands corrections too: “two Korça beers, no, Aperol”", "Kupton edhe korrigjimet: “dy birra Korça, jo, Aperol”")}</li>
                <li><Symbol name="check" size={18} />{t("Anything not on the menu isn’t added", "Çfarë s’është në menu nuk shtohet")}</li>
                <li><Symbol name="check" size={18} />{t("Up to 30 seconds per order", "Deri në 30 sekonda për një porosi")}</li>
              </ul>
            </div>
            <Voice t={t} />
          </div>
        </section>

        <section className="lp-section lp-try" id="provo" aria-labelledby="try-heading">
          <div className="lp-wrap lp-head-split">
            <div><p className="lp-eyebrow lp-live">{t("Try it", "Provojeni")}</p><h2 id="try-heading">{t("Take an order, ", "Merrni një porosi, ")}<em>{t("right here, right now.", "tani, këtu.")}</em></h2></div>
            <p className="lp-sub">{t("Order from the waiter’s phone and watch the slip arrive at the stations. Mark it ready, take the payment, and the bill prints at the till along with the day’s takings. It takes less than a minute.", "Porositni nga telefoni i kamarierit dhe shihni si mbërrin fleta te Repartet. Shënojeni gati, merrni pagesën, dhe fatura del te arka bashkë me xhiron e ditës. Zgjat më pak se një minutë.")}</p>
          </div>
          <Counter t={t} />
        </section>

        <section className="lp-section lp-section-night" id="fillimi" aria-labelledby="start-heading">
          <div className="lp-wrap">
            <p className="lp-eyebrow">{t("Getting started", "Si fillohet")}</p>
            <h2 id="start-heading">{t("Three steps to ", "Tre hapa deri te ")}<em>{t("your first order.", "porosia e parë.")}</em></h2>
            <ol className="lp-steps">{steps(t).map(([t, d], i) => <li key={t}><span>{i + 1}</span><h3>{t}</h3><p>{d}</p></li>)}</ol>
            <div className="lp-actions"><a className="lp-button" href={REGISTER}>{t("Register your venue", "Regjistro lokalin")}</a></div>
          </div>
        </section>

        <section className="lp-section" aria-labelledby="more-heading">
          <div className="lp-wrap">
            <p className="lp-eyebrow">{t("Also included", "Edhe këto")}</p>
            <h2 id="more-heading">{t("The things nobody asks for, ", "Gjërat që s’i kërkon askush, ")}<em>{t("until they need them.", "derisa i duhen.")}</em></h2>
            <dl className="lp-more">{more(t).map(([icon, t, d]) => <div key={t}><dt><Symbol name={icon} size={22} />{t}</dt><dd>{d}</dd></div>)}</dl>
          </div>
        </section>

        <section className="lp-section lp-section-cream" id="pyetje" aria-labelledby="faq-heading">
          <div className="lp-wrap lp-faq">
            <p className="lp-eyebrow">{t("Questions", "Pyetje")}</p>
            <h2 id="faq-heading">{t("Before you ", "Para se të ")}<em>{t("write to us.", "na shkruani.")}</em></h2>
            <div className="lp-questions">{questions(t).map(([q, a]) => <details key={q}><summary>{q}<Symbol name="plus" size={18} /></summary><p>{a}</p></details>)}</div>
          </div>
        </section>

        <section className="lp-cta">
          <div className="lp-wrap">
            <div className="lp-cta-card">
              <div>
                <h2>{t("Your first shift with BlueBar ", "Turni i parë me BlueBar ")}<em>{t("could be tonight.", "mund të jetë sonte.")}</em></h2>
                <p>{t("Registration takes about two minutes. Staff sign in with the venue code and their own PIN.", "Regjistrimi zgjat rreth dy minuta. Stafi hyn me kodin e lokalit dhe PIN-in e vet.")}</p>
              </div>
              <div className="lp-actions"><a className="lp-button lp-button-light" href={REGISTER}>{t("Register your venue", "Regjistro lokalin")}</a><a className="lp-cta-link" href={SIGN_IN}>{t("I have an account", "Kam llogari")}</a></div>
            </div>
          </div>
        </section>
      </main>
      <footer className="lp-footer"><div className="lp-wrap lp-footer-inner"><Brand t={t} /><span>{t("In step with your venue.", "Në ritmin e lokalit tuaj.")}</span><nav aria-label={t("Footer links", "Lidhje në fund")}>{nav.map(([h, l]) => <a key={h} href={h}>{l}</a>)}<a href={SIGN_IN}>{t("Sign in", "Hyr")}</a></nav></div></footer>
    </div>
  );
}
