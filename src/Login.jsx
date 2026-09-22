import React, { useState, useEffect } from "react";
import { fetchLoginWaiters, loginWaiter, loginManager } from "./api.js";
import { Field, PinPad } from "./components.jsx";

export function Login({ onSignedIn }) {
  const [mode, setMode] = useState("waiter"),
    [waiters, setWaiters] = useState(null),
    [waiterId, setWaiterId] = useState(""),
    [username, setUsername] = useState(""),
    [pin, setPin] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
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
    if (mode === "manager" && !username.trim())
      return setError("Vendosni përdoruesin përpara PIN-it.");
    setBusy(true);
    setError("");
    try {
      onSignedIn(
        mode === "waiter"
          ? await loginWaiter(Number(waiterId), enteredPin)
          : await loginManager({ username: username.trim(), pin: enteredPin }),
      );
    } catch (err) {
      setError(err.message);
      setPin("");
      setBusy(false);
    }
  }
  const tabs = [
    ["waiter", "Kamarier"],
    ["manager", "Menaxher"],
  ];
  const blocked = mode === "waiter" && waiters && !waiters.allowed;
  return (
    <main className="database-setup login-screen">
      <span className="brand">BlueBar</span>
      <h1>Hyrje</h1>
      <div className="tabs" role="group" aria-label="Lloji i llogarisë">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={mode === id} onClick={() => reset(id)}>
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
        <div className="stack-form">
          {mode === "waiter" ? (
            <Field label="Kamarieri">
              <select value={waiterId} onChange={(e) => setWaiterId(e.target.value)} disabled={busy}>
                {(waiters?.waiters ?? []).map((w) => (
                  <option value={w.id} key={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field
              label="Përdoruesi"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              disabled={busy}
              autoFocus
            />
          )}
          {mode === "waiter" && waiters && !waiters.waiters.length ? (
            <p>Asnjë kamarier nuk ka PIN. Menaxheri e vendos te Kamarierët.</p>
          ) : (
            <Field label="PIN (6 shifra)">
              <PinPad value={pin} onChange={setPin} onComplete={submit} disabled={busy} />
            </Field>
          )}
        </div>
      )}
    </main>
  );
}
