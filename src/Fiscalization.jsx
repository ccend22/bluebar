import React, { useEffect, useState } from "react";
import { disconnectBlueBill, fetchBlueBill, saveBlueBill, testBlueBill } from "./api.js";
import { Badge, Field, Icon, SectionHeading } from "./components.jsx";

const when = (iso) => {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// The business's own BlueBill connection. The token goes in once and never comes back:
// the server keeps it encrypted and only ever returns its hint.
export function Fiscalization({ onChange }) {
  const [status, setStatus] = useState(null);
  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchBlueBill()
      .then((s) => alive && setStatus(s))
      .catch((e) => alive && setMessage({ tone: "error", text: e.message }));
    return () => {
      alive = false;
    };
  }, []);

  const run = async (action, success) => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await action();
      if (next) setStatus(next);
      if (success) setMessage({ text: success });
      return true;
    } catch (e) {
      setMessage({ tone: "error", text: e.message });
      return false;
    } finally {
      setBusy(false);
    }
  };
  async function save(e) {
    e.preventDefault();
    const ok = await run(() => saveBlueBill(token.trim()), "BlueBill u lidh. Faturat e reja do të fiskalizohen.");
    if (ok) {
      setToken("");
      setEditing(false);
      onChange?.();
    }
  }
  async function test() {
    await run(async () => {
      const r = await testBlueBill();
      if (!r.connected) throw new Error(r.providerStatus ? "BlueBill nuk e pranon më këtë token. Vendosni një të ri." : "BlueBill nuk u arrit. Kontrolloni internetin.");
      return null;
    }, "Lidhja me BlueBill funksionon.");
  }
  async function disconnect() {
    setConfirmOff(false);
    if (await run(disconnectBlueBill, "BlueBill u shkëput. Faturat nuk fiskalizohen më.")) onChange?.();
  }

  const own = status?.source === "venue";
  const showForm = status && status.canSave && (editing || !status.enabled || status.problem);

  return (
    <section className="panel fiscal-panel">
      <SectionHeading
        title="Fiskalizimi"
        description="Lidheni BlueBar me llogarinë tuaj BlueBill që çdo faturë të fiskalizohet."
      />
      {message && (
        <p className={`notice ${message.tone || ""}`} role={message.tone === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      )}
      {!status ? (
        !message && <p className="helper">Po ngarkohet…</p>
      ) : (
        <>
          <div className={`fiscal-status ${status.enabled ? "on" : "off"}`}>
            <span className="fiscal-dot" aria-hidden="true" />
            <div>
              <strong>{status.enabled ? "Lidhur me BlueBill" : "Pa fiskalizim"}</strong>
              <small>
                {status.enabled
                  ? own
                    ? `${status.connectedBy ? `Nga ${status.connectedBy} · ` : ""}${when(status.connectedAt)}`
                    : "Nga konfigurimi i serverit"
                  : "Faturat regjistrohen, por nuk dërgohen te tatimet."}
              </small>
            </div>
            {status.mode && (
              <Badge tone={status.mode === "live" ? "green" : "amber"}>{status.mode === "live" ? "Live" : "Test"}</Badge>
            )}
          </div>
          {status.hint && (
            <p className="fiscal-hint">
              <span>Token</span>
              <code>{status.hint}</code>
            </p>
          )}
          {status.problem && <p className="notice error">{status.problem}</p>}
          {status.mode === "test" && status.enabled && (
            <p className="helper">
              Token test: faturat shkojnë në mjedisin e provës të BlueBill, jo te tatimet. Për shitje reale vendosni token-in live.
            </p>
          )}
          {!status.canSave && (
            <p className="notice error">
              Serveri nuk ka çelësin e enkriptimit (BLUEBAR_SECRET_KEY), ndaj token-i nuk mund të ruhet. Kontaktoni administratorin.
            </p>
          )}

          {showForm ? (
            <form className="stack-form" onSubmit={save}>
              {!status.enabled && (
                <ol className="fiscal-steps">
                  <li>Hyni në BlueBill dhe krijoni një API token për këtë lokal.</li>
                  <li>Kopjojeni të plotë dhe ngjiteni më poshtë.</li>
                  <li>BlueBar e verifikon me BlueBill para se ta ruajë.</li>
                </ol>
              )}
              <Field label="API token nga BlueBill">
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="bb_live_… ose bb_test_…"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={busy}
                  required
                />
              </Field>
              <p className="helper">Token-i ruhet i enkriptuar dhe nuk shfaqet më pas ruajtjes.</p>
              <div className="fiscal-actions">
                {editing && (
                  <button type="button" disabled={busy} onClick={() => (setEditing(false), setToken(""))}>
                    Anulo
                  </button>
                )}
                <button className="primary" disabled={busy || !token.trim()}>
                  <Icon name="check" size={17} />
                  {busy ? "Po verifikohet…" : "Verifiko dhe ruaj"}
                </button>
              </div>
            </form>
          ) : (
            status.enabled && (
              <div className="fiscal-actions">
                <button disabled={busy} onClick={test}>
                  {busy ? "Po provohet…" : "Testo lidhjen"}
                </button>
                {status.canSave && (
                  <button disabled={busy} onClick={() => setEditing(true)}>
                    <Icon name="edit" size={16} />
                    {own ? "Ndrysho token-in" : "Vendos token-in e lokalit"}
                  </button>
                )}
              </div>
            )
          )}
          {own && !editing && (
            confirmOff ? (
              <div className="fiscal-confirm" role="alert">
                <span>Të shkëputet BlueBill? Faturat e reja nuk do të fiskalizohen.</span>
                <div className="fiscal-actions">
                  <button disabled={busy} onClick={() => setConfirmOff(false)}>Anulo</button>
                  <button className="danger-button" disabled={busy} onClick={disconnect}>Shkëput</button>
                </div>
              </div>
            ) : (
              <button className="text-button fiscal-disconnect" disabled={busy} onClick={() => setConfirmOff(true)}>
                Shkëput BlueBill
              </button>
            )
          )}
        </>
      )}
    </section>
  );
}
