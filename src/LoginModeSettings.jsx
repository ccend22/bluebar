import React, { useState } from "react";
import { saveLoginMode, saveManagerLogin } from "./api.js";
import { SectionHeading } from "./components.jsx";

const MODES = [
  {
    id: "name_pin",
    title: "Emri, pastaj PIN",
    description: "Kamarieri zgjedh emrin nga lista, pastaj fut PIN-in 6-shifror.",
  },
  {
    id: "pin_only",
    title: "Vetëm PIN",
    description: "Kamarieri fut direkt PIN-in e tij unik, pa zgjedhur emrin.",
  },
  {
    id: "pattern",
    title: "Pattern",
    description: "Kamarieri zgjedh emrin dhe lidh pikat sipas pattern-it të vet.",
  },
];

function LoginModePreview({ mode }) {
  if (mode === "pin_only")
    return (
      <div className="login-mode-preview">
        <div className="pin-dots small">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={i < 3 ? "filled" : ""} />
          ))}
        </div>
      </div>
    );
  if (mode === "pattern")
    return (
      <div className="login-mode-preview">
        <span className="preview-pattern" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => <i key={i} className={i === 0 || i === 4 || i === 8 ? "selected" : ""} />)}
        </span>
      </div>
    );
  return (
    <div className="login-mode-preview">
      <div className="preview-name-chips">
        <span className="preview-chip selected">Ana</span>
        <span className="preview-chip">Beni</span>
      </div>
      <div className="pin-dots small">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={i < 2 ? "filled" : ""} />
        ))}
      </div>
    </div>
  );
}

export function LoginModeSettings({ venue, waiters = [] }) {
  const [mode, setMode] = useState(venue?.loginMode || "name_pin");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const missingPatterns = waiters.filter((waiter) => waiter.active && !waiter.hasPattern).length;
  const missingPins = waiters.filter((waiter) => waiter.active && !waiter.hasPin).length;

  async function choose(id) {
    if (id === mode || busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await saveLoginMode(id);
      setMode(id);
      setMessage("Mënyra e hyrjes u ndryshua.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <SectionHeading
        title="Hyrja e kamarierëve"
        description="Zgjidhni si do të hyjnë kamarierët në ekranin e hyrjes."
      />
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <div className="login-mode-grid" role="group" aria-label="Mënyra e hyrjes">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`login-mode-card ${mode === m.id ? "selected" : ""}`}
            aria-pressed={mode === m.id}
            disabled={busy || (m.id === "pattern" ? missingPatterns > 0 : missingPins > 0)}
            onClick={() => choose(m.id)}
          >
            <LoginModePreview mode={m.id} />
            <strong>{m.title}</strong>
            <small>{m.description}</small>
          </button>
        ))}
      </div>
      {missingPatterns > 0 && <p className="helper">Për të aktivizuar pattern-in, vendoseni për të gjithë {missingPatterns} kamarierët aktivë te lista e ekipit.</p>}
      {missingPins > 0 && <p className="helper">Për hyrjen me PIN, vendoseni për të gjithë {missingPins} kamarierët aktivë te lista e ekipit.</p>}
    </section>
  );
}

const MANAGER_MODES = [
  { id: "pin_only", title: "Vetëm kodi", description: "Menaxheri fut vetëm kodin 6-shifror." },
  { id: "name_pin", title: "Emri + kodi", description: "Menaxheri shkruan emrin, pastaj kodin. Më e sigurt." },
];

export function ManagerLoginSettings({ venue, name }) {
  const [mode, setMode] = useState(venue?.managerLogin || "pin_only");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function choose(id) {
    if (id === mode || busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await saveManagerLogin(id);
      setMode(id);
      setMessage("Hyrja e menaxherit u ndryshua.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <SectionHeading title="Hyrja e menaxherit" description="Si hyn menaxheri në ekranin e hyrjes." />
      {error && <p className="notice error" role="alert">{error}</p>}
      {message && <p className="notice" role="status">{message}</p>}
      <div className="login-mode-grid manager-login-grid" role="group" aria-label="Hyrja e menaxherit">
        {MANAGER_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`login-mode-card ${mode === m.id ? "selected" : ""}`}
            aria-pressed={mode === m.id}
            disabled={busy}
            onClick={() => choose(m.id)}
          >
            <strong>{m.title}</strong>
            <small>{m.description}</small>
          </button>
        ))}
      </div>
      {mode === "name_pin" && (
        <p className="helper">
          Emri juaj për hyrje: <strong>{name}</strong>
        </p>
      )}
    </section>
  );
}
