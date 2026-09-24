import React, { useState, useEffect, useRef } from "react";
import { fetchLoginWaiters, loginWaiter, loginManager, venueSlug, fetchVenue, registerVenue, openBusiness } from "./api.js";
import { Field, PinPad } from "./components.jsx";

function PinLogin({ onSignedIn }) {
  const [mode, setMode] = useState("waiter"),
    [waiters, setWaiters] = useState(null),
    [waiterId, setWaiterId] = useState(""),
    [pin, setPin] = useState(""),
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
  async function submit(enteredPin) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      onSignedIn(
        mode === "waiter"
          ? await loginWaiter(Number(waiterId), enteredPin)
          : await loginManager({ pin: enteredPin }),
      );
    } catch (err) {
      setError(err.message);
      setPin("");
      submitting.current = false;
      setBusy(false);
    }
  }
  const tabs = [
    ["waiter", "Kamarier"],
    ["manager", "Menaxher"],
  ];
  const blocked = mode === "waiter" && waiters && !waiters.allowed;
  const selectedWaiter = waiters?.waiters.find((w) => String(w.id) === waiterId);
  return (
    <main className={`database-setup login-screen ${mode === "waiter" && !blocked ? "with-waiters" : ""}`}>
      <span className="brand">BlueBar</span>
      <h1>{venue?.name || "Hyrje"}</h1>
      <p className="helper">Kodi i biznesit: <strong>{venueSlug}</strong> · <a href="/">Ndrysho biznesin</a></p>
      <div className="tabs" role="group" aria-label="Lloji i llogarisë">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={mode === id} disabled={busy} onClick={() => reset(id)}>
            {label}
          </button>
        ))}
      </div>
      {error && (
        <div className="notice error" role="alert">
          <span>{error}</span>
        </div>
      )}
      {blocked ? (
        <p>Kamarierët hyjnë vetëm nga rrjeti i lokalit. Menaxherët hyjnë nga skeda "Menaxher".</p>
      ) : (
        <div className={`stack-form login-content ${mode === "waiter" && waiters?.waiters.length ? "with-waiter-list" : ""}`}>
          {mode === "waiter" && waiters?.waiters.length > 0 && (
            <section className="login-waiters" aria-labelledby="login-waiters-title">
              <h2 id="login-waiters-title">Kamarierët</h2>
              <div className="login-waiter-list" role="group" aria-label="Zgjidhni kamarierin">
                {waiters.waiters.map((w) => (
                  <button
                    type="button"
                    key={w.id}
                    aria-pressed={waiterId === String(w.id)}
                    disabled={busy}
                    onClick={() => { setWaiterId(String(w.id)); setPin(""); setError(""); }}
                  >
                    <span>{w.name}</span>
                    {waiterId === String(w.id) && <span className="login-waiter-selected">Zgjedhur</span>}
                  </button>
                ))}
              </div>
            </section>
          )}
          {mode === "waiter" && !waiters ? (
            <p role="status">Po ngarkohen kamarierët…</p>
          ) : mode === "waiter" && !waiters.waiters.length ? (
            <p>Asnjë kamarier nuk ka PIN. Menaxheri e vendos te Kamarierët.</p>
          ) : (
            <fieldset className="pin-field" disabled={busy}>
              <legend>{selectedWaiter && mode === "waiter" ? `PIN-i për ${selectedWaiter.name} (6 shifra)` : "PIN (6 shifra)"}</legend>
              <PinPad value={pin} onChange={setPin} onComplete={submit} disabled={busy} />
            </fieldset>
          )}
          {busy && (
            <p className="helper" role="status">
              Po hyhet…
            </p>
          )}
        </div>
      )}
    </main>
  );
}


export function Login({ onSignedIn }) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  if (new URLSearchParams(window.location.search).has("business"))
    return <PinLogin onSignedIn={onSignedIn} />;
  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    const slug = String(form.get("slug")).trim().toLowerCase();
    setError("");
    if (!creating) return openBusiness(slug);
    if (form.get("pin") !== form.get("confirm")) return setError("PIN-et nuk përputhen.");
    submitting.current = true;
    setBusy(true);
    try {
      await registerVenue({ slug, name: String(form.get("name")).trim(), pin: form.get("pin") });
      openBusiness(slug);
    } catch (err) {
      setError(err.message);
      setBusy(false);
      submitting.current = false;
    }
  }
  return <main className="database-setup business-entry">
    <span className="brand">BlueBar</span>
    <h1>{creating ? "Krijoni biznesin tuaj" : "Mirë se vini"}</h1>
    <p>{creating ? "Tavolinat, stafi dhe faturat tuaja në një hapësirë të veçantë." : "Vendosni kodin e biznesit për të hyrë në hapësirën e lokalit."}</p>
    {error && <div className="notice error" role="alert">{error}</div>}
    <form className="stack-form" onSubmit={submit} key={String(creating)}>
      <fieldset className="business-fields" disabled={busy}>
        {creating && <Field label="Emri i biznesit" name="name" required minLength={2} maxLength={80} autoComplete="organization" placeholder="p.sh. Bar Aurora" />}
        <Field label="Kodi i biznesit" name="slug" required minLength={3} maxLength={40} pattern="[a-z0-9][a-z0-9-]{2,39}" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={creating ? "p.sh. bar-aurora" : "p.sh. bluebar"} />
        <p className="helper">{creating ? "3–40 shkronja të vogla, numra ose viza. Ndajeni këtë kod me stafin." : "Për lokalin ekzistues, përdorni kodin bluebar."}</p>
        {creating && <>
          <Field label="PIN-i i menaxherit (6 shifra)" name="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="new-password" required />
          <Field label="Përsëritni PIN-in" name="confirm" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="new-password" required />
          <p className="helper">Ruajeni PIN-in në një vend të sigurt. Biznesi nis bosh, me turn të mbyllur.</p>
        </>}
        <button className="primary full-width" disabled={busy}>{busy ? "Po krijohet…" : creating ? "Krijo biznesin" : "Vazhdo"}</button>
      </fieldset>
    </form>
    <button className="subtle-button full-width business-switch" disabled={busy} onClick={() => { setCreating(!creating); setError(""); }}>
      {creating ? "Kam një biznes · Hyr" : "Biznes i ri? Krijo hapësirën"}
    </button>
  </main>;
}
