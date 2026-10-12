import React, { useEffect, useRef, useState } from "react";
import { money } from "./domain.js";
import { Icon } from "./components.jsx";
import { mergeHeard } from "./voice.js";

// The device's own speech recognition (Chrome, Safari), only on https pages. Without it the
// mic still shows and says which browser to use, rather than silently not being there.
const Recognition = typeof window !== "undefined" && window.isSecureContext && (window.SpeechRecognition || window.webkitSpeechRecognition);

const ERRORS = {
  "not-allowed": "Lejoni mikrofonin te shfletuesi për të porositur me zë.",
  "service-not-allowed": "Lejoni mikrofonin te shfletuesi për të porositur me zë.",
  "audio-capture": "Nuk u gjet mikrofon në këtë pajisje.",
  network: "Njohja e zërit kërkon internet: kontrolloni lidhjen.",
  "language-not-supported": "Ky shfletues nuk e njeh shqipen me zë.",
};

// The waiter speaks the order in Albanian. Listening goes on until the waiter taps the mic
// again: a phone stops on its own after a pause, so it is started again, keeping what was
// already heard. Only final pieces are kept (each the best of several guesses, see choose),
// merged without repeats; the guess still being formed only shows while they talk.
export function useVoice(onHeard, onError, choose) {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const session = useRef(null);
  // Leaving the table stops listening for good: no restart in the background.
  useEffect(() => () => session.current && ((session.current.wanted = false), session.current.rec?.abort()), []);
  const finish = (s) => {
    setListening(false);
    if (s.text.trim()) onHeard(s.text);
  };
  const listen = (s) => {
    const r = new Recognition();
    r.lang = "sq-AL";
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 5;
    r.onresult = (e) => {
      let forming = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) s.text = mergeHeard(s.text, choose([...res].map((alt) => alt.transcript)));
        else forming += ` ${res[0].transcript}`;
      }
      setHeard(forming.trim() ? mergeHeard(s.text, forming) : s.text);
    };
    r.onerror = (e) => {
      if (e.error === "aborted" || e.error === "no-speech") return;
      s.wanted = false;
      onError(ERRORS[e.error] || `Njohja e zërit nuk punoi (${e.error}). Provoni sërish.`);
    };
    // A pause ended it: start again shortly, unless the waiter is done.
    r.onend = () => (s.wanted ? setTimeout(() => s.wanted && listen(s), 200) : finish(s));
    s.rec = r;
    try {
      r.start();
    } catch {
      s.wanted = false;
      finish(s);
    }
  };
  const start = () => {
    if (!Recognition) return onError("Ky shfletues nuk e njeh zërin. Përdorni Chrome (Android, kompjuter) ose Safari (iPhone, iPad).");
    // Tapped while listening: the waiter is done.
    if (listening) return (session.current.wanted = false), session.current.rec.stop();
    session.current = { wanted: true, text: "", rec: null };
    setHeard("");
    setListening(true);
    listen(session.current);
  };
  return { listening, heard, start };
}

// What was understood, to check before it goes on the order: quantities can be changed, and
// nothing is added until the waiter says so. Products not on the menu never get here.
// live: while the waiter talks, the words and the order as understood so far, read-only (a
// spoken "jo ujë" visibly takes the water off). After "Mbaro": the words can be corrected by
// hand, the list follows as you type, and quantities can be changed before adding.
export function VoicePanel({ live = false, heard, items, onText, onChange, onAdd, onRetry, onClose, busy }) {
  const total = items.reduce((s, x) => s + x.qty * x.product.price, 0);
  if (live)
    return (
      <div className="voice-panel live" role="status" aria-live="polite">
        <p className="voice-live">
          <span className="voice-dot" aria-hidden="true" />
          {heard ? `“${heard}”` : "Po dëgjoj… thoni p.sh. “2 makiato dhe 1 ujë”. Gabim? Thoni “jo ujë” ose “hiq ujin”."}
        </p>
        {items.length > 0 && (
          <ul className="voice-items">
            {items.map((x) => (
              <li key={x.product.id} className="voice-item-live">
                <span>{x.product.name}</span>
                <b className="voice-qty">× {x.qty}</b>
                <b>{money(x.qty * x.product.price)}</b>
              </li>
            ))}
          </ul>
        )}
        <p className="voice-hint">Shtypni <b>Mbaro</b> kur të keni mbaruar.</p>
      </div>
    );
  return (
    <div className="voice-panel" role="region" aria-label="Porosia me zë">
      <label className="voice-heard">
        <small>Dëgjova · mund ta korrigjoni</small>
        <input value={heard} onChange={(e) => onText(e.target.value)} />
      </label>
      {items.length ? (
        <ul className="voice-items">
          {items.map((x) => (
            <li key={x.product.id}>
              <span>{x.product.name}</span>
              <div className="quantity">
                <button type="button" aria-label={`Një më pak ${x.product.name}`} disabled={!x.qty} onClick={() => onChange(x.product.id, x.qty - 1)}>−</button>
                <span>{x.qty}</span>
                <button type="button" aria-label={`Një më shumë ${x.product.name}`} disabled={x.qty >= x.max} onClick={() => onChange(x.product.id, x.qty + 1)}>+</button>
              </div>
              <b>{money(x.qty * x.product.price)}</b>
            </li>
          ))}
        </ul>
      ) : (
        <p className="helper">Nuk gjeta asnjë produkt nga menuja. Provoni sërish, p.sh. “2 makiato dhe 1 ujë”.</p>
      )}
      <div className="voice-actions">
        <button type="button" onClick={onClose}>Anulo</button>
        <button type="button" onClick={onRetry}><Icon name="mic" size={16} /> Provo sërish</button>
        {items.length > 0 && (
          <button type="button" className="primary" disabled={busy || !total} onClick={onAdd}>
            Shto në porosi · {money(total)}
          </button>
        )}
      </div>
    </div>
  );
}
