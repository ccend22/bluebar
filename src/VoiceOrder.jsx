import React, { useEffect, useRef, useState } from "react";
import { money } from "./domain.js";
import { Icon } from "./components.jsx";

// Recording the waiter until "Mbaro" (or 30 s), then handing over the audio as a small WAV
// (16 kHz, mono): one format the voice service takes from every browser, whatever the browser
// recorded in (WebM in Chrome, MP4 in Safari).
const LIMIT = 30;

async function toWav(blob) {
  const decoded = await new AudioContext().decodeAudioData(await blob.arrayBuffer());
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const samples = (await offline.startRendering()).getChannelData(0);
  // Practically silent (mic muted, too far away): nothing worth sending. A voice service given
  // silence may "hear" an order that was never said.
  let loud = 0;
  for (const x of samples) loud += x * x;
  if (Math.sqrt(loud / samples.length) < 0.004) throw new Error("silent");
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); text(8, "WAVEfmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, samples.length * 2, true);
  samples.forEach((x, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * 0x7fff, true));
  let binary = "";
  const bytes = new Uint8Array(view.buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// While recording, the device's own speech recognition (where there is one) writes what it
// hears as a live preview. Only a preview: Gemini, given the whole recording, decides. If a
// phone gives the mic to one of them only and the recording comes out silent, the preview is used.
const Recognition = typeof window !== "undefined" && window.isSecureContext && (window.SpeechRecognition || window.webkitSpeechRecognition);
function preview(onText) {
  if (!Recognition) return { stop() {} };
  let on = true, before = "", rec;
  const listen = () => {
    rec = new Recognition();
    rec.lang = "sq-AL";
    rec.continuous = true;
    rec.interimResults = true;
    let now = "";
    rec.onresult = (e) => on && onText([before, (now = [...e.results].map((x) => x[0].transcript).join(" "))].filter(Boolean).join(" "));
    rec.onerror = () => {};
    // A pause ends it on most phones: start again while still recording.
    rec.onend = () => ((before = [before, now].filter(Boolean).join(" ")), on && setTimeout(() => on && listen(), 150));
    try { rec.start(); } catch { on = false; }
  };
  listen();
  return { stop: () => ((on = false), rec?.abort()) };
}

export function useRecorder(onAudio, onError) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [live, setLive] = useState("");
  const current = useRef(null);
  // Leaving the table drops the recording: nothing is sent.
  useEffect(() => () => current.current?.cancel(), []);
  const start = async () => {
    // Tapped while recording: the waiter is done. MediaRecorder stops at once.
    if (recording) return current.current?.stop();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined")
      return onError(window.isSecureContext ? "Ky shfletues nuk mund të regjistrojë zë. Përdorni Chrome ose Safari." : "Zëri punon vetëm në faqe të sigurta (https).");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      return onError(
        // Chrome says "by system" when the computer (macOS / Windows) blocks the mic, not the site.
        e.name === "NotAllowedError" && /system/i.test(e.message)
          ? "Kompjuteri e bllokon mikrofonin për shfletuesin. Mac: System Settings → Privacy & Security → Microphone → ndizni Chrome, pastaj rinisni Chrome."
          : e.name === "NotAllowedError" ? "Lejoni mikrofonin te shfletuesi (🔒 majtas adresës → Microphone → Allow), pastaj rifreskoni faqen."
          : e.name === "NotFoundError" ? "Nuk u gjet mikrofon në këtë pajisje."
            : `Mikrofoni nuk u hap (${e.name}).`,
      );
    }
    const recorder = new MediaRecorder(stream);
    const chunks = [];
    let cancelled = false;
    const began = Date.now();
    const timer = setInterval(() => {
      const s = Math.floor((Date.now() - began) / 1000);
      setSeconds(s);
      if (s >= LIMIT && recorder.state !== "inactive") recorder.stop();
    }, 250);
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    let heard = "";
    const words = preview((text) => setLive((heard = text)));
    recorder.onstop = async () => {
      clearInterval(timer);
      words.stop();
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      if (cancelled) return;
      if (Date.now() - began < 700) return onError("Shumë shkurt: shtypni 🎙, thoni porosinë, pastaj Mbaro.");
      let wav;
      try {
        wav = await toWav(new Blob(chunks, { type: recorder.mimeType }));
      } catch (e) {
        // Silent recording but the preview heard words: this phone gave it the mic. Use them.
        if (e.message === "silent" && heard.trim()) return onAudio(null, heard);
        return onError(e.message === "silent" ? "Nuk u dëgjua zëri. Flisni më afër mikrofonit dhe provoni sërish." : "Regjistrimi nuk u lexua. Provoni sërish.");
      }
      onAudio(wav, heard);
    };
    current.current = {
      stop: () => recorder.state !== "inactive" && recorder.stop(),
      cancel: () => ((cancelled = true), recorder.state !== "inactive" && recorder.stop()),
    };
    setSeconds(0);
    setLive("");
    setRecording(true);
    recorder.start(250);
  };
  return { recording, seconds, live, start, limit: LIMIT };
}

// live: while the waiter talks, the words and the order as understood so far, read-only (a
// spoken "jo ujë" visibly takes the water off). After "Mbaro": the words can be corrected by
// hand, the list follows as you type, and quantities can be changed before adding.
export function VoicePanel({ live = false, thinking = false, seconds = 0, limit = 30, preview = "", heard, items, onText, onChange, onAdd, onRetry, onClose, busy }) {
  const total = items.reduce((s, x) => s + x.qty * x.product.price, 0);
  if (live || thinking)
    return (
      <div className="voice-panel live" role="status" aria-live="polite">
        <p className="voice-live">
          <span className={thinking ? "voice-spinner" : "voice-dot"} aria-hidden="true" />
          {thinking
            ? "Po e kuptoj porosinë…"
            : preview
              ? `“${preview}”`
              : `Po dëgjoj… Thoni p.sh. “2 makiato dhe 1 ujë”; gabim? “jo ujë”, “hiq ujin”.`}
        </p>
        {thinking && preview && <p className="voice-preview">“{preview}”</p>}
        {!thinking && (
          <p className="voice-hint">
            0:{String(seconds).padStart(2, "0")} · Shtypni <b>Mbaro</b> kur të keni mbaruar{seconds >= limit - 10 ? ` · ndalon vetë pas ${limit - seconds} s` : ""}
            {preview && " · teksti është paraprak, lista del pas Mbaro"}
          </p>
        )}
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
