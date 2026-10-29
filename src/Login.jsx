import React, { useState, useEffect, useRef } from "react";
import { fetchLoginWaiters, loginWaiter, loginWaiterPattern, loginManager, venueSlug, fetchVenue, registerVenue, openBusiness, luxhotelLogin } from "./api.js";
import { LuxHotelButton } from "./LuxHotel.jsx";

// "Hyr me LuxHotel": the LuxHotel account's business opens with its manager signed in.
const luxhotelSignIn = async (token) => openBusiness((await luxhotelLogin(token)).venue.slug);
import { PinPad, Icon } from "./components.jsx";
import { PatternPad } from "./PatternPad.jsx";
import { FloorMotif, ThemeButton, useTheme } from "./Landing.jsx";

// Sign-up and sign-in wear the landing's look: the floor plan behind, BlueBar's blue mark, and
// the visitor's light / dark / system choice carried over from the landing.
const Mark = ({ small }) => <span className={`onboard-mark${small ? " small" : ""}`} role="img" aria-label="BlueBar">b.</span>;

function PinLogin({ onSignedIn }) {
  const [theme, setTheme, shown] = useTheme();
  const [mode, setMode] = useState("waiter"),
    [waiters, setWaiters] = useState(null),
    [waiterId, setWaiterId] = useState(""),
    [pin, setPin] = useState(""),
    [managerName, setManagerName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [venue, setVenue] = useState(null);
  const submitting = useRef(false);
  useEffect(() => {
    fetchVenue().then(setVenue).catch(e => setError(e.message));
    fetchLoginWaiters()
      .then((r) => {
        setWaiters(r);
        setWaiterId(String(r.waiters[0]?.id ?? ""));
      })
      .catch((e) => {
        setWaiters({ allowed: true, waiters: [] });
        setError(e.message);
      });
  }, []);
  const reset = (id) => {
    setMode(id);
    setError("");
    setPin("");
  };
  const loginMode = venue?.loginMode || "name_pin";
  const waiterFlow = loginMode === "pattern" || loginMode === "pin_only" ? loginMode : "name_pin";
  async function authenticate(action) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      onSignedIn(await action());
    } catch (err) {
      setError(err.message);
      setPin("");
      submitting.current = false;
      setBusy(false);
    }
  }
  const managerByName = venue?.managerLogin === "name_pin";
  const submit = (enteredPin) => {
    if (mode === "manager" && managerByName && !managerName.trim()) {
      setPin("");
      return setError("Shkruani emrin e menaxherit.");
    }
    return authenticate(() => mode === "waiter"
      ? loginWaiter(waiterFlow === "pin_only" ? undefined : Number(waiterId), enteredPin)
      : loginManager(managerByName ? { username: managerName.trim(), pin: enteredPin } : { pin: enteredPin }));
  };
  const submitPattern = (pattern) => authenticate(() => loginWaiterPattern(Number(waiterId), pattern));
  const tabs = [
    ["waiter", "Kamarier"],
    ["manager", "Menaxher"],
  ];
  const blocked = mode === "waiter" && waiters && !waiters.allowed;
  const selectedWaiter = waiters?.waiters.find((w) => String(w.id) === waiterId);
  const showWaiterList = mode === "waiter" && waiterFlow !== "pin_only" && (waiters?.waiters.length ?? 0) > 0;
  return (
    <main className="onboard onboard-salla terminal" data-theme={shown}>
      <FloorMotif className="onboard-motif" />
      <header className="onboard-bar">
        <a className="onboard-back" href="/"><Icon name="back" size={18} /> Ndrysho biznesin</a>
        <span />
        <ThemeButton theme={theme} setTheme={setTheme} />
      </header>
      <section className="terminal-shell">
      <div className="terminal-brand">
        <span className="terminal-logo" aria-hidden="true"><Mark small /></span>
        <h1>{venue?.name || "Hyrje"}</h1>
        <p className="onboard-lede">Kodi i biznesit: <strong>{venueSlug}</strong></p>
        <div className="onboard-segmented" role="group" aria-label="Lloji i llogarisë">
          {tabs.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={mode === id} disabled={busy} onClick={() => reset(id)}>
              {label}
            </button>
          ))}
        </div>
        {showWaiterList && (
          <div className="onboard-people" role="group" aria-label="Zgjidhni kamarierin">
            {waiters.waiters.map((w) => (
              <button
                type="button"
                key={w.id}
                aria-pressed={waiterId === String(w.id)}
                disabled={busy}
                onClick={() => { setWaiterId(String(w.id)); setPin(""); setError(""); }}
              >
                {w.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="terminal-pad">
        <h2>{mode === "waiter" && waiterFlow === "pattern" ? "Vizatoni pattern-in" : "Fut PIN-in"}</h2>
        {mode === "waiter" && selectedWaiter && waiterFlow !== "pin_only" && <p className="terminal-who">{selectedWaiter.name}</p>}
        {error && <p className="onboard-error" role="alert">{error}</p>}
        {blocked ? (
          <p className="onboard-note">Kamarierët hyjnë vetëm nga rrjeti i lokalit. Menaxherët hyjnë nga skeda "Menaxher".</p>
        ) : mode === "waiter" && !waiters ? (
          <p className="onboard-note" role="status">Po ngarkohen kamarierët…</p>
        ) : mode === "waiter" && !waiters.waiters.length ? (
          <p className="onboard-note">Asnjë kamarier nuk ka hyrje të konfiguruar. Menaxheri e vendos te Kamarierët.</p>
        ) : (
          <>
            {mode === "waiter" && waiterFlow === "pattern" ? (
              selectedWaiter?.hasPattern ? (
                <div className="onboard-pin">
                  <PatternPad key={waiterId} label={`Pattern i ${selectedWaiter.name}`} onComplete={submitPattern} disabled={busy} />
                </div>
              ) : (
                <p className="onboard-note">Pattern-i i {selectedWaiter?.name} nuk është vendosur ende. Njoftoni menaxherin.</p>
              )
            ) : (
              <>
                {mode === "manager" && managerByName && (
                  <input
                    className="onboard-input"
                    aria-label="Emri i menaxherit"
                    placeholder="Emri i menaxherit"
                    value={managerName}
                    onChange={(e) => setManagerName(e.target.value)}
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={60}
                    disabled={busy}
                    autoFocus
                  />
                )}
                <fieldset className="pin-field onboard-pin" disabled={busy}>
                  <legend className="sr-only">
                    {mode === "waiter" && selectedWaiter && waiterFlow === "name_pin" ? `PIN-i për ${selectedWaiter.name}` : "PIN"}
                  </legend>
                  <PinPad variant="terminal" value={pin} onChange={setPin} onComplete={submit} disabled={busy} />
                </fieldset>
              </>
            )}
          </>
        )}
        {busy && <p className="onboard-note" role="status">Po hyhet…</p>}
        {mode === "manager" && (
          <div className="lux-actions">
            <div className="lux-or" aria-hidden="true"><span>ose</span></div>
            <LuxHotelButton label="Hyr me LuxHotel" onToken={async (token) => {
              try { await luxhotelSignIn(token); } catch (e) {
                throw e.status === 404 ? new Error("Kjo llogari LuxHotel nuk është e lidhur me asnjë biznes BlueBar.") : e;
              }
            }} />
          </div>
        )}
      </div>
      </section>
    </main>
  );
}


// A business code from its name: "Bar Ëndrra & Co" → "bar-endrra-co".
const toSlug = (name) =>
  name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const SIGNUP = ["name", "slug", "pin", "confirm"];

// First run, one idea per screen: hello → the business code, or hello → name → code →
// PIN → PIN again → ready. Nothing is created until the PIN is confirmed.
export function Login({ onSignedIn }) {
  const [step, setStep] = useState(() => (new URLSearchParams(window.location.search).has("regjistro") ? "name" : "hello"));
  const [dir, setDir] = useState("forward");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [pin, setPin] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [luxhotelToken, setLuxhotelToken] = useState("");
  const website = useRef("");
  const [theme, setTheme, shown] = useTheme();
  if (new URLSearchParams(window.location.search).has("business"))
    return <PinLogin onSignedIn={onSignedIn} />;

  const go = (next, direction = "forward") => {
    setDir(direction);
    setError("");
    setStep(next);
  };
  // Already has a business: just open it. Otherwise the usual steps, linked to LuxHotel.
  const registerWithLuxhotel = async (token) => {
    try { await luxhotelSignIn(token); } catch (e) {
      if (e.status !== 404) throw e;
      setLuxhotelToken(token);
      go("name");
    }
  };
  const back = { open: "hello", name: "hello", slug: "name", pin: "slug", confirm: "pin" }[step];
  const at = SIGNUP.indexOf(step);

  async function create(confirmed) {
    if (confirmed !== firstPin) {
      setPin("");
      setFirstPin("");
      return (go("pin", "back"), setError("PIN-et nuk përputhen. Provoni përsëri."));
    }
    setBusy(true);
    try {
      await registerVenue({ slug, name: name.trim(), pin: confirmed, website: website.current, ...(luxhotelToken && { luxhotelToken }) });
      go("ready");
    } catch (err) {
      setPin("");
      setFirstPin("");
      go("slug", "back");
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  let content;
  if (step === "hello")
    content = <>
      <Mark />
      <h1 className="onboard-hello">Përshëndetje.</h1>
      <p className="onboard-lede">Tavolinat, porositë dhe arka e lokalit tuaj. Në një vend.</p>
      <ul className="onboard-features">
        <li><Icon name="tables" size={22} /><span><strong>Çdo tavolinë, në kohë reale</strong>Kamarierët, banaku dhe kuzhina shohin të njëjtën porosi.</span></li>
        <li><Icon name="receipt" size={22} /><span><strong>Pagesa dhe fatura</strong>Cash, kartë dhe fiskalizim, pa letra.</span></li>
        <li><Icon name="chart" size={22} /><span><strong>Raporte të qarta</strong>Shitjet, arka dhe stoku i çdo turni.</span></li>
      </ul>
      {/* Two ways in, same weight and width; starting a business is the quieter line below. */}
      <div className="onboard-actions welcome-actions">
        <button className="onboard-primary" onClick={() => go("open")}>Hyr në lokal</button>
        <LuxHotelButton label="Hyr me LuxHotel" onToken={async (token) => {
          try { await luxhotelSignIn(token); } catch (e) {
            throw e.status === 404 ? new Error("Kjo llogari LuxHotel nuk ka ende biznes në BlueBar. Zgjidhni \"Regjistrohu me LuxHotel\".") : e;
          }
        }} />
      </div>
      <div className="welcome-new">
        <span>Biznes i ri?</span>
        <button className="onboard-link" onClick={() => go("name")}>Krijo një biznes</button>
        <span aria-hidden="true">·</span>
        <LuxHotelButton variant="link" label="Regjistrohu me LuxHotel" onToken={registerWithLuxhotel} />
      </div>
    </>;
  else if (step === "open")
    content = <form onSubmit={(e) => { e.preventDefault(); openBusiness(slug.trim().toLowerCase()); }}>
      <h1>Kodi i biznesit.</h1>
      <p className="onboard-lede">Kodi që ju dha menaxheri, p.sh. <strong>bluebar</strong>.</p>
      <input className="onboard-input" aria-label="Kodi i biznesit" value={slug} onChange={(e) => setSlug(e.target.value)} required minLength={3} maxLength={40} pattern="[a-zA-Z0-9][a-zA-Z0-9\-]{2,39}" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus placeholder="kodi-i-biznesit" />
      <div className="onboard-actions"><button className="onboard-primary">Vazhdo</button></div>
    </form>;
  else if (step === "name")
    // The LuxHotel line sits beside the form, not in it: its sign-in has a form of its own.
    content = <>
      <form onSubmit={(e) => { e.preventDefault(); if (!slugEdited) setSlug(toSlug(name)); go("slug"); }}>
      <h1>Si quhet lokali juaj?</h1>
      <p className="onboard-lede">{luxhotelToken ? "I lidhur me LuxHotel: herës tjetër hyni me një prekje. " : ""}Emri shfaqet në hyrje dhe në fatura.</p>
      <input className="onboard-input" aria-label="Emri i biznesit" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="organization" autoFocus placeholder="Bar Aurora" />
      <div className="onboard-actions"><button className="onboard-primary">Vazhdo</button></div>
      </form>
      {!luxhotelToken && <div className="welcome-new"><span>Keni llogari LuxHotel?</span><LuxHotelButton variant="link" label="Regjistrohu me LuxHotel" onToken={registerWithLuxhotel} /></div>}
    </>;
  else if (step === "slug")
    content = <form onSubmit={(e) => { e.preventDefault(); go("pin"); }}>
      <h1>Kodi i lokalit.</h1>
      <p className="onboard-lede">Stafi e shkruan këtë kod për të hyrë. Shkronja të vogla, numra ose viza.</p>
      <input className="onboard-input" aria-label="Kodi i biznesit" value={slug} onChange={(e) => { setSlug(e.target.value.toLowerCase()); setSlugEdited(true); }} required minLength={3} maxLength={40} pattern="[a-z0-9][a-z0-9\-]{2,39}" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus placeholder="bar-aurora" />
      <div className="onboard-actions"><button className="onboard-primary">Vazhdo</button></div>
    </form>;
  else if (step === "pin" || step === "confirm")
    content = <>
      <h1>{step === "pin" ? "Krijoni PIN-in e menaxherit." : "Edhe një herë."}</h1>
      <p className="onboard-lede">{step === "pin" ? "Gjashtë shifra. Me to hapni turnet, raportet dhe cilësimet." : busy ? "Po krijohet lokali…" : "Shkruani PIN-in përsëri për ta konfirmuar."}</p>
      <label className="honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" onChange={(e) => (website.current = e.target.value)} /></label>
      <div className="onboard-pin">
        <PinPad key={step} value={pin} onChange={setPin} disabled={busy}
          onComplete={(v) => (step === "pin" ? (setFirstPin(v), setPin(""), go("confirm")) : create(v))} />
      </div>
    </>;
  else
    content = <>
      <span className="onboard-done" aria-hidden="true"><Icon name="check" size={34} /></span>
      <h1 className="onboard-hello">Mirë se vini, {name.trim()}.</h1>
      <p className="onboard-lede">Lokali është gati. Ndajeni kodin <strong>{slug}</strong> me stafin. Ruajeni PIN-in në një vend të sigurt.</p>
      <div className="onboard-actions"><button className="onboard-primary" onClick={() => openBusiness(slug)} autoFocus>Fillo</button></div>
    </>;

  return <main className="onboard onboard-salla" data-theme={shown}>
    <FloorMotif className="onboard-motif" />
    <header className="onboard-bar">
      {back && step !== "ready" ? (
        <button className="onboard-back" disabled={busy} onClick={() => go(back, "back")}><Icon name="back" size={18} /> Kthehu</button>
      ) : <a className="onboard-back" href="/"><Icon name="back" size={18} /> BlueBar</a>}
      {at < 0 ? <span /> : (
        <span className="onboard-progress" aria-label={`Hapi ${at + 1} nga ${SIGNUP.length}`}>
          {SIGNUP.map((s, i) => <i key={s} className={i <= at ? "on" : ""} />)}
        </span>
      )}
      <ThemeButton theme={theme} setTheme={setTheme} />
    </header>
    <section className={`onboard-step ${dir}`} key={step}>
      {error && <p className="onboard-error" role="alert">{error}</p>}
      {content}
    </section>
  </main>;
}
