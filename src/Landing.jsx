import React, { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import "./landing.css";
import "./landing-salla.css";
import { Counter, Mic, Wave, heard, phrases, useTyping } from "./LandingCounter.jsx";

const REGISTER = "/?regjistro";
const SIGN_IN = "/?hyr";

// English by default; the visitor's choice is kept in this browser.
const LANG_KEY = "bluebar-landing-lang";
// The page's look is "salla" (landing-salla.css re-inks landing.css): light, a floor plan
// behind the hero, night navy for dark, following the visitor's light / dark / system choice.
const THEME_KEY = "bluebar-landing-theme";
function savedTheme() {
  try { return ["light", "dark"].includes(localStorage.getItem(THEME_KEY)) ? localStorage.getItem(THEME_KEY) : "system"; } catch { return "system"; }
}
// A corner of a floor plan, drawn behind the hero and the closing block:
// tables in outline, a few occupied. Decoration only.
const MOTIF = [
  ["r", 40, 40, 64, 64, 1], ["r", 140, 40, 64, 64], ["c", 272, 72, 34], ["r", 340, 40, 64, 64, 1], ["r", 440, 40, 120, 64],
  ["c", 72, 186, 34], ["r", 140, 154, 64, 64, 1], ["r", 240, 154, 64, 64], ["c", 372, 186, 34], ["r", 440, 154, 64, 64, 1],
  ["r", 40, 268, 164, 56], ["c", 272, 296, 34, 1], ["r", 340, 268, 64, 64], ["r", 440, 268, 120, 56],
];
export function FloorMotif({ className }) {
  return (
    <svg className={className} viewBox="0 0 600 360" aria-hidden="true" focusable="false">
      {MOTIF.map(([kind, x, y, a, b, on], i) => kind === "r"
        ? <rect key={i} x={x} y={y} width={a} height={b} rx="14" className={on ? "on" : undefined} />
        : <circle key={i} cx={x} cy={y} r={a} className={b ? "on" : undefined} />)}
    </svg>
  );
}

// One button that cycles the theme: system → light → dark. Shared with sign-up and sign-in.
export function ThemeButton({ theme, setTheme, t = (en, sq) => sq }) {
  const labels = { system: t("Match system", "Sipas sistemit"), light: t("Light", "E çelët"), dark: t("Dark", "E errët") };
  const next = { system: "light", light: "dark", dark: "system" }[theme];
  const label = `${t("Theme", "Pamja")}: ${labels[theme]}`;
  return <button type="button" className="lp-theme-cycle" aria-label={label} title={label} onClick={() => setTheme(next)}><Symbol name={theme === "system" ? "system" : theme === "light" ? "sun" : "moon"} size={18} /></button>;
}

// The theme the page actually shows: the visitor's choice, or the device's while on "system".
export function useTheme() {
  const [theme, setTheme] = useState(savedTheme);
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = (e) => setSystemDark(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  useEffect(() => {
    try { theme === "system" ? localStorage.removeItem(THEME_KEY) : localStorage.setItem(THEME_KEY, theme); } catch {}
  }, [theme]);
  return [theme, setTheme, theme === "dark" || (theme === "system" && systemDark) ? "dark" : "light"];
}
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
    system: <><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" /></>,
    sun: <><circle cx="12" cy="12" r="3.5" /><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></>,
    moon: <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z" />,
    qr: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" /></>,
    download: <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" />,
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
    img: ["/landing/page-salla.webp", 2552, 1240, t("The floor plan with 12 tables; 7 are occupied, each with its waiter and amount, 4,780 Lek open in total.", "Plani i sallës me 12 tavolina; 7 të zëna, secila me kamarierin dhe shumën, 4,780 Lek të hapura gjithsej.")],
  },
  {
    id: "porosia", tab: t("Ordering", "Porosia"),
    title: t("The waiter takes the order at the table and stops running to the counter.", "Kamarieri e merr porosinë te tavolina dhe s’vrapon më te banaku."),
    points: t(
      ["Search the menu, change quantities, add notes like “no sugar”", "Or just say it: “two macchiatos and a water”", "On the second round only the new items are sent"],
      ["Kërkon në menu, ndryshon sasinë, shton shënime si “pa sheqer”", "Ose e thotë me zë: “dy makiato dhe një ujë”", "Në raundin e dytë dërgohen vetëm artikujt e rinj"],
    ),
    img: ["/landing/page-porosia.webp", 2464, 1664, t("Table 07's order: the menu with photos on the left, the order on the right, ready to send to the stations.", "Porosia e Tavolinës 07: menuja me foto majtas, porosia djathtas, gati për t’u dërguar në repartet.")],
  },
  {
    id: "repartet", tab: t("Bar and kitchen", "Bari dhe kuzhina"),
    title: t("The bar gets the drinks, the kitchen gets the plates, and nobody reads the other's slip.", "Bari merr pijet, kuzhina pjatat, dhe askush s’lexon fletën e tjetrit."),
    points: t(
      ["Every item goes straight to its own station", "The kitchen taps “Ready” and the waiter sees it on their phone", "Prints directly, without the browser's print window"],
      ["Çdo artikull shkon vetë te reparti i vet", "Kuzhina shtyp “Gati” dhe kamarieri e sheh në telefon", "Printon direkt, pa dritaren e printimit të shfletuesit"],
    ),
    img: ["/landing/page-repartet.webp", 2338, 1038, t("Slips waiting at the bar, the kitchen and the pizza oven.", "Fletët në pritje te bari, kuzhina dhe furra e picave.")],
  },
  {
    id: "faturat", tab: t("Payments", "Pagesat"),
    title: t("Cash, card or “everyone pays their own”: the bill comes out right.", "Cash, kartë apo “secili të vetën”: llogaria del e saktë."),
    points: t(
      ["BlueBar works out the change, not the waiter in their head", "Fiscalization through BlueBill", "A manager can correct a closed bill, but has to write down why"],
      ["Kusurin e llogarit BlueBar, jo kamarieri me mend", "Fiskalizim përmes BlueBill", "Menaxheri mund ta korrigjojë një faturë të mbyllur, por duhet të shkruajë arsyen"],
    ),
    img: ["/landing/page-faturat.webp", 2338, 1482, t("The bill register with the day's paid bills, cash and card.", "Regjistri i faturave me faturat e paguara të ditës, cash dhe kartë.")],
  },
  {
    id: "raportet", tab: t("Reports", "Raportet"),
    title: t("Close the shift and know what should be in the till before you count it.", "Mbyllni turnin dhe e dini sa duhet të ketë arka, para se ta numëroni."),
    points: t(
      ["Sales by hour, by waiter and by product", "Cash and card kept apart", "One CSV for your accountant, in one click"],
      ["Shitjet sipas orës, kamarierit dhe produktit", "Cash dhe kartë veç e veç", "Një CSV për kontabilistin, me një klik"],
    ),
    img: ["/landing/page-raportet.webp", 2338, 1532, t("The day's report: sales, cash, card and best sellers.", "Raporti i ditës: shitjet, cash, kartë dhe produktet më të shitura.")],
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

// "Download for …": BlueBar runs in the browser, so this installs it as an app on this device.
// Where the browser offers its own install (Chrome, Edge, Android) that prompt opens; elsewhere a
// short how-to for this system and browser appears under the buttons.
function device() {
  const ua = navigator.userAgent;
  const platform = (navigator.userAgentData?.platform || navigator.platform || "").toLowerCase();
  if (/iphone|ipad|ipod/i.test(ua) || (platform.includes("mac") && navigator.maxTouchPoints > 1)) return "iphone";
  if (/android/i.test(ua)) return "android";
  if (platform.includes("win")) return "windows";
  if (platform.includes("mac")) return "mac";
  return "linux";
}
const OS_NAME = { mac: "Mac", windows: "Windows", linux: "Linux", iphone: "iPhone", android: "Android" };
const safari = () => /safari/i.test(navigator.userAgent) && !/chrome|chromium|crios|edg|android/i.test(navigator.userAgent);
const chromium = () => /chrome|chromium|edg/i.test(navigator.userAgent);
let installPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
});
function howTo(os, t) {
  if (os === "iphone") return t("In Safari, tap Share, then “Add to Home Screen”.", "Në Safari, prekni Shpërndaj, pastaj “Shto në ekranin bazë”.");
  if (os === "android") return t("Open the browser menu ⋮ and tap “Install app”.", "Hapni menunë e shfletuesit ⋮ dhe prekni “Instalo aplikacionin”.");
  if (os === "mac" && safari()) return t("In Safari, choose File → Add to Dock.", "Në Safari, zgjidhni File → Add to Dock.");
  if (chromium()) return t("Click the install icon at the right end of the address bar.", "Klikoni ikonën e instalimit në fund të shiritit të adresës.");
  return t("Open this page in Chrome or Edge, then click the install icon in the address bar.", "Hapeni këtë faqe në Chrome ose Edge, pastaj klikoni ikonën e instalimit te shiriti i adresës.");
}
function DownloadButton({ t, className = "lp-button", onHelp }) {
  const os = useState(device)[0];
  const click = async () => {
    if (!installPrompt) return onHelp(howTo(os, t));
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    installPrompt = null;
    if (outcome === "accepted") onHelp(t("BlueBar is installed. Open it like any other app.", "BlueBar u instalua. Hapeni si çdo aplikacion tjetër."));
  };
  return <button type="button" className={className} onClick={click}><Symbol name="download" size={18} />{t(`Download for ${OS_NAME[os]}`, `Shkarko për ${OS_NAME[os]}`)}</button>;
}

// The whole system, full width, leaning toward the mouse like a sheet on a table. The tilt is
// written straight to the element (no re-render) and only on mouse-driven screens.
function TiltScreen({ t }) {
  const el = useRef(null);
  useEffect(() => {
    const node = el.current;
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const move = (e) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = node.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        node.style.setProperty("--rx", `${(-y * 7).toFixed(2)}deg`);
        node.style.setProperty("--ry", `${(x * 9).toFixed(2)}deg`);
        node.style.setProperty("--gx", `${((x + 0.5) * 100).toFixed(1)}%`);
        node.style.setProperty("--gy", `${((y + 0.5) * 100).toFixed(1)}%`);
        node.classList.add("is-tilting");
      });
    };
    const leave = () => {
      cancelAnimationFrame(frame);
      node.classList.remove("is-tilting");
      node.style.setProperty("--rx", "0deg");
      node.style.setProperty("--ry", "0deg");
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerleave", leave);
    };
  }, []);
  return (
    <div className="lp-tilt-stage">
      <div className="lp-tilt" ref={el}>
        <div className="lp-browser"><div className="lp-browser-bar" aria-hidden="true"><i /><i /><i /></div><img src="/landing/app-tavolinat.webp" width="2880" height="1520" alt={t("BlueBar: Bar Aurora's floor, occupied tables with their waiter and amount, the menu on the left.", "BlueBar: salla e Bar Aurora, tavolinat e zëna me kamarierin dhe shumën, menuja majtas.")} fetchPriority="high" /></div>
        <span className="lp-tilt-glare" aria-hidden="true" />
      </div>
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
  ["qr", t("Online menu", "Menuja online"), t("Guests scan the table's QR code and read the menu in six languages, with prices in euros too.", "Klienti skanon kodin QR të tavolinës dhe e lexon menunë në gjashtë gjuhë, me çmimet edhe në euro.")],
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
  const [theme, setTheme, shown] = useTheme();
  const [help, setHelp] = useState("");
  const [help2, setHelp2] = useState("");
  const FEATURES = features(t);
  const nav = [["#vecorite", t("Features", "Veçoritë")], ["#provo", t("Try it", "Provojeni")], ["#fillimi", t("Getting started", "Si fillohet")], ["#pyetje", t("Questions", "Pyetje")]];
  return (
    <div className="lp lp-salla" data-theme={shown}>
      <a className="lp-skip" href="#permbajtja">{t("Skip to content", "Kalo te përmbajtja")}</a>
      <header className="lp-header">
        <div className="lp-wrap lp-header-inner">
          <Brand t={t} />
          <nav className="lp-nav" aria-label={t("Main navigation", "Navigimi kryesor")}>{nav.map(([h, l]) => <a key={h} href={h}>{l}</a>)}</nav>
          <div className="lp-header-actions">
            <ThemeButton theme={theme} setTheme={setTheme} t={t} />
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
        <section className="lp-start">
          <FloorMotif className="lp-motif" />
          <div className="lp-wrap lp-start-copy">
            <h1>{t("Full house, ", "Salla plot, ")}<em>{t("till in order.", "arka në rregull.")}</em></h1>
            <p className="lp-lead">{t("The waiter takes the order on their phone, by touch or by voice; the bar and the kitchen each get their own slip, and when you close the shift you know what should be in the till before you count it.", "Kamarieri e merr porosinë në telefon, me prekje ose me zë; bari dhe kuzhina marrin secili fletën e vet, dhe kur mbyllni turnin e dini sa duhet të ketë arka para se ta numëroni.")}</p>
            <div className="lp-actions">
              <DownloadButton t={t} onHelp={setHelp} />
              <a className="lp-button lp-button-ghost" href="#provo">{t("Try it", "Provojeni")}</a>
            </div>
            <p className="lp-help" role="status">{help}</p>
          </div>
          <TiltScreen t={t} />
        </section>

        <section className="lp-parts" aria-label={t("What BlueBar covers", "Çfarë mbulon BlueBar")}>
          <div className="lp-wrap">
            <nav className="lp-chips">{[...FEATURES.map((f) => [`#${f.id}`, f.tab]), ["#zeri", t("By voice", "Me zë")], ["#edhe", t("Online menu", "Menuja online")]].map(([h, l]) => <a key={h} href={h}>{l}</a>)}</nav>
            <p>{t("Every screen on this page is real, from Bar Aurora, our sample venue.", "Çdo ekran në këtë faqe është i vërtetë, nga Bar Aurora, lokali ynë shembull.")}</p>
          </div>
        </section>

        <div id="vecorite">
          {[FEATURES[0], "voice", FEATURES[2]].map((f, i) => f === "voice" ? (
            <section className="lp-split is-flipped" id="zeri" key="voice" aria-labelledby="voice-heading">
              <div className="lp-wrap lp-split-inner">
                <div className="lp-split-copy">
                  <p className="lp-eyebrow">{t("Ordering by voice", "Porosia me zë")}</p>
                  <h2 id="voice-heading">{t("The waiter says it, ", "Kamarieri e thotë, ")}<em>{t("BlueBar writes it down.", "BlueBar e shkruan.")}</em></h2>
                  <ul className="lp-points">
                    {FEATURES[1].points.map((p) => <li key={p}><Symbol name="check" size={18} />{p}</li>)}
                    <li><Symbol name="check" size={18} />{t("Anything not on the menu isn’t added", "Çfarë s’është në menu nuk shtohet")}</li>
                  </ul>
                </div>
                <Voice t={t} />
              </div>
            </section>
          ) : (
            <section className={`lp-split${i % 2 ? " is-flipped" : ""}`} id={f.id} key={f.id} aria-labelledby={`${f.id}-heading`}>
              <div className="lp-wrap lp-split-inner">
                <div className="lp-split-copy">
                  <p className="lp-eyebrow">{f.tab}</p>
                  <h2 id={`${f.id}-heading`}>{f.title}</h2>
                  <ul className="lp-points">{f.points.map((p) => <li key={p}><Symbol name="check" size={18} />{p}</li>)}</ul>
                </div>
                <div className="lp-split-media"><Shot f={f} /></div>
              </div>
            </section>
          ))}

          <section className="lp-duo" aria-label={t("Payments and reports", "Pagesat dhe raportet")}>
            <div className="lp-wrap lp-duo-grid">
              {FEATURES.slice(3).map((f) => (
                <article className="lp-duo-card" id={f.id} key={f.id}>
                  <p className="lp-eyebrow">{f.tab}</p>
                  <h3>{f.title}</h3>
                  <p>{f.points.join(". ")}.</p>
                  <img src={f.img[0]} width={f.img[1]} height={f.img[2]} alt={`BlueBar: ${f.img[3]}`} loading="lazy" />
                </article>
              ))}
            </div>
          </section>
        </div>

        <section className="lp-section" id="edhe" aria-labelledby="more-heading">
          <div className="lp-wrap">
            <p className="lp-eyebrow">{t("Also included", "Edhe këto")}</p>
            <h2 id="more-heading">{t("The things nobody asks for, ", "Gjërat që s’i kërkon askush, ")}<em>{t("until they need them.", "derisa i duhen.")}</em></h2>
            <dl className="lp-grid">{more(t).map(([icon, title, d]) => <div key={title}><dt><Symbol name={icon} size={20} />{title}</dt><dd>{d}</dd></div>)}</dl>
          </div>
        </section>

        <section className="lp-section lp-try" id="provo" aria-labelledby="try-heading">
          <div className="lp-wrap lp-head-split">
            <div><p className="lp-eyebrow">{t("Try it", "Provojeni")}</p><h2 id="try-heading">{t("Take an order, ", "Merrni një porosi, ")}<em>{t("right here, right now.", "tani, këtu.")}</em></h2></div>
            <p className="lp-sub">{t("Order from the waiter’s phone, mark it ready at the stations, take the payment. Less than a minute.", "Porositni nga telefoni i kamarierit, shënojeni gati te Repartet, merrni pagesën. Më pak se një minutë.")}</p>
          </div>
          <Counter t={t} />
        </section>

        <section className="lp-section" id="pyetje" aria-labelledby="faq-heading">
          <div className="lp-wrap lp-faq">
            <div className="lp-faq-head">
              <p className="lp-eyebrow">{t("Questions", "Pyetje")}</p>
              <h2 id="faq-heading">{t("Before you ", "Para se të ")}<em>{t("write to us.", "na shkruani.")}</em></h2>
            </div>
            <div className="lp-questions">{questions(t).map(([q, a]) => <details key={q}><summary>{q}<Symbol name="plus" size={18} /></summary><p>{a}</p></details>)}</div>
          </div>
        </section>

        <section className="lp-get" id="fillimi" aria-labelledby="get-heading">
          <FloorMotif className="lp-motif" />
          <div className="lp-wrap">
            <span className="lp-get-mark" aria-hidden="true">b.</span>
            <h2 id="get-heading">{t("Your first shift with BlueBar ", "Turni i parë me BlueBar ")}<em>{t("could be tonight.", "mund të jetë sonte.")}</em></h2>
            <p className="lp-sub">{t("Registration takes about two minutes.", "Regjistrimi zgjat rreth dy minuta.")}</p>
            <div className="lp-actions">
              <a className="lp-button" href={REGISTER}>{t("Register your venue", "Regjistro lokalin")}</a>
              <DownloadButton t={t} className="lp-button lp-button-ghost" onHelp={setHelp2} />
            </div>
            <p className="lp-help" role="status">{help2}</p>
            <ol className="lp-get-steps">{steps(t).map(([title, d], i) => <li key={title}><span>{i + 1}</span><div><h3>{title}</h3><p>{d}</p></div></li>)}</ol>
          </div>
        </section>
      </main>
      <footer className="lp-footer"><div className="lp-wrap lp-footer-inner"><Brand t={t} /><span>{t("In step with your venue.", "Në ritmin e lokalit tuaj.")}</span><nav aria-label={t("Footer links", "Lidhje në fund")}>{nav.map(([h, l]) => <a key={h} href={h}>{l}</a>)}<a href={SIGN_IN}>{t("Sign in", "Hyr")}</a></nav></div></footer>
    </div>
  );
}
