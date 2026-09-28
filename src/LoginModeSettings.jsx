import React, { useState } from "react";
import { saveLoginMode } from "./api.js";
import { SectionHeading, Icon } from "./components.jsx";

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
    id: "fingerprint",
    title: "Gjurmë gishti",
    description: "Hyrje me prekje gishti, si në telefon. Pamje paraprake — hyrja reale bëhet ende me PIN.",
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
  if (mode === "fingerprint")
    return (
      <div className="login-mode-preview">
        <span className="preview-fingerprint">
          <Icon name="fingerprint" size={24} />
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

export function LoginModeSettings({ venue }) {
  const [mode, setMode] = useState(venue?.loginMode || "name_pin");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
        description="Zgjidhni si do të hyjnë kamarierët në ekranin e PIN-it."
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
            disabled={busy}
            onClick={() => choose(m.id)}
          >
            <LoginModePreview mode={m.id} />
            <strong>{m.title}</strong>
            <small>{m.description}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
