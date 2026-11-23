import React, { useEffect, useRef, useState } from "react";
import { shrink } from "./OnlineMenu.jsx";
import { Icon } from "./components.jsx";

const STEPS = ["Ngarko", "Shiko", "Sukses"];

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// While the AI reads: what it's doing, typed letter by letter, and the seconds, so a long wait
// never looks frozen. After half a minute it says plainly that Google is slow.
export function AiReading({ steps }) {
  const [seconds, setSeconds] = useState(0);
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const index = Math.floor(seconds / 5) % steps.length;
  const phrase = steps[index];
  // Type the phrase out; with reduced motion it simply appears.
  useEffect(() => {
    if (reducedMotion()) return void setTyped(phrase.length);
    setTyped(0);
    const id = setInterval(() => setTyped((n) => (n >= phrase.length ? (clearInterval(id), n) : n + 1)), 28);
    return () => clearInterval(id);
  }, [phrase]);
  return (
    <div className="ai-reading" role="status">
      <span className="ai-reading-text">
        <b aria-hidden="true">{phrase.slice(0, typed)}<i className="ai-caret" /></b>
        <span className="sr-only">AI po lexon. Prisni pak.</span>
        <small>
          {seconds} s{seconds >= 30 ? " · Google po merr më shumë kohë se zakonisht, vazhdojmë të provojmë…" : " · zakonisht 10–40 sekonda"}
        </small>
      </span>
    </div>
  );
}

// Over the photo while it's read: the photo softens under a fine grid that a soft light wanders
// across, its cells light up here and there (single pieces, now and then a larger box), and
// in the middle five dots on a gentle arc join as the wait goes on (the pattern pad's own
// gesture). Each link snaps in whole, ever further apart; the last joins only when the AI is done.
const DOTS = [[8, 26], [26, 12], [46, 22], [66, 8], [84, 20]];
export const scanDone = () => new Promise((resolve) => setTimeout(resolve, 650));
const CELL = 14; // px, the same as .ai-grid's background-size
export function ScanMarks({ done }) {
  const box = useRef(null);
  const [seconds, setSeconds] = useState(0);
  const [squares, setSquares] = useState([]);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setSeconds((Date.now() - start) / 1000), 200);
    if (reducedMotion()) return () => clearInterval(id);
    let n = 0;
    const flash = setInterval(() => {
      const { offsetWidth: w = 0, offsetHeight: h = 0 } = box.current || {};
      const k = Math.random() < 0.8 ? 1 : 2 + Math.floor(Math.random() * 2);
      const col = Math.floor(Math.random() * Math.max(1, w / CELL - k)), row = Math.floor(Math.random() * Math.max(1, h / CELL - k));
      setSquares((list) => [...list.slice(-21), { id: ++n, x: col * CELL, y: row * CELL, size: k * CELL, box: k > 1 }]);
    }, 110);
    return () => (clearInterval(id), clearInterval(flash));
  }, []);
  // How far along the four links: quick at first, ever slower, never past 92 % until it's done.
  const reach = done ? 4 : 4 * 0.92 * (1 - Math.exp(-seconds / 15));
  const part = (i) => (reach >= i + 1 ? 1 : 0);
  return (
    <span ref={box} className={`ai-scan ${done ? "done" : ""}`} aria-hidden="true">
      <i className="ai-grid" />
      {squares.map((s) => <i key={s.id} className={`ai-square ${s.box ? "box" : ""}`} style={{ left: s.x, top: s.y, width: s.size }} />)}
      <span className="ai-scan-card">
        <svg className="ai-constellation" viewBox="0 0 92 34">
          {DOTS.slice(1).map(([x, y], i) => (
            <line key={i} x1={DOTS[i][0]} y1={DOTS[i][1]} x2={x} y2={y} pathLength="1" style={{ strokeDashoffset: 1 - part(i) }} />
          ))}
          {DOTS.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.4" className={i <= Math.floor(reach) ? "on" : ""} />)}
        </svg>
      </span>
    </span>
  );
}
export const DOCUMENT_STEPS = ["Po shikoj dokumentin…", "Po lexoj rreshtat…", "Po lexoj sasitë dhe shumat…", "Po kontrolloj datat dhe emrat…"];
export const MENU_STEPS = ["Po shikoj foton e menusë…", "Po lexoj emrat e produkteve…", "Po lexoj çmimet…", "Po gjej madhësitë dhe shtesat…", "Po rendis kategoritë…"];

// "Importo me AI" for a document (Inventari: a supplier's invoice; Shpenzimet: receipts or a bank
// statement): a photo or pasted text → read(input) by AI into rows → the manager checks them
// (review) → save(rows). Nothing is saved before "Ruaj".
//   read({ image } | { text }, note) → rows; review({ rows, setRows }) → the table;
//   save(rows) → how many were saved; ready(rows) → whether they can be saved.
export function AiDocumentImport({ title, intro, notePlaceholder, read, review, ready, save, saved, label = "Importo me AI" }) {
  const dialog = useRef(null);
  const [step, setStep] = useState(0);
  const [source, setSource] = useState(null); // { file, url } or { text }
  const [note, setNote] = useState("");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [count, setCount] = useState(0);

  const choose = (file) => {
    if (!file?.type.startsWith("image/")) return setError("Zgjidhni një foto (JPG, PNG, WebP…).");
    setError("");
    const reader = new FileReader();
    reader.onload = () => setSource({ file, url: reader.result });
    reader.onerror = () => setError("Fotoja nuk u hap. Provoni një foto tjetër.");
    reader.readAsDataURL(file);
  };
  const chooseText = (text) => {
    if (!text.trim()) return setError("Clipboard është bosh. Kopjoni një foto ose tekstin e dokumentit.");
    setError("");
    setSource({ text: text.slice(0, 20000) });
  };
  const fromClipboard = async () => {
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) return choose(new File([await item.getType(type)], "document", { type }));
      }
      chooseText(await navigator.clipboard.readText());
    } catch {
      setError("Shfletuesi nuk e lejoi leximin e clipboard. Shtypni Ctrl+V (⌘V) këtu.");
    }
  };
  const open = () => {
    if (step === 2) (setStep(0), setSource(null), setNote(""), setRows([]));
    setError("");
    dialog.current?.showModal();
  };
  const readIt = async () => {
    setBusy(true);
    setError("");
    try {
      // Larger than a product photo: a document's small print has to stay readable.
      const input = source.file ? { image: await shrink(source.file, { size: 2000 }) } : { text: source.text };
      const found = await read(input, note.trim());
      if (!found.length) setError("AI nuk gjeti asgjë për të shtuar. Provoni një foto më të qartë.");
      else (setBusy("done"), await scanDone(), setRows(found), setStep(1));
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };
  const saveIt = async () => {
    setBusy(true);
    setError("");
    try {
      const n = await save(rows, { onSavedRow: (row) => setRows((current) => current.filter((r) => r.key !== row.key)) });
      if (n) (setCount(n), setStep(2));
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  return (
    <>
      <button type="button" onClick={open}>
        <Icon name="sparkle" size={18} />
        {label}
      </button>
      <dialog
        ref={dialog}
        className="ai-dialog"
        aria-label={title}
        onCancel={(e) => busy && e.preventDefault()}
        onPaste={(e) => {
          if (busy || step !== 0 || e.target.closest("input, textarea")) return;
          const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
          file ? choose(file) : chooseText(e.clipboardData.getData("text"));
        }}
      >
        <header className="ai-head">
          <h2><Icon name="sparkle" size={22} /> {title}</h2>
          <button type="button" className="icon-button" aria-label="Mbyll" disabled={busy} onClick={() => dialog.current?.close()}>
            <Icon name="close" size={18} />
          </button>
        </header>
        <ol className="ai-steps ai-steps-3">
          {STEPS.map((name, i) => (
            <li key={name} className={i <= step ? "reached" : ""} aria-current={i === step ? "step" : undefined}>
              <span className="ai-step-number">{i < step ? <Icon name="check" size={14} /> : i + 1}</span>
              <span className="ai-step-bar" />
              {name}
            </li>
          ))}
        </ol>
        <div className="ai-body">
          {step === 0 && (
            <>
              <div className="ai-intro">
                <h3>Ngarkoni ose bëni foto të dokumentit</h3>
                <p>{intro}</p>
              </div>
              {source ? (
                <div className={`ai-preview ${busy ? "scanning" : ""}`}>
                  <span className="ai-shot">
                    {source.url ? <img src={source.url} alt="Dokumenti" /> : <pre>{source.text.slice(0, 600)}</pre>}
                    {busy && <ScanMarks done={busy === "done"} />}
                  </span>
                  <button type="button" disabled={busy} onClick={() => setSource(null)}>Ndrysho</button>
                </div>
              ) : (
                <div className="ai-sources">
                  <button type="button" className="ai-source" onClick={fromClipboard}>
                    <Icon name="clipboard" size={30} />
                    <strong>Ngjit foto ose tekst</strong>
                    <span>Klikoni për të marrë foton ose tekstin nga clipboard</span>
                  </button>
                  <label
                    className={`ai-source ai-source-drop ${dragging ? "dragging" : ""}`}
                    onDragOver={(e) => (e.preventDefault(), setDragging(true))}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => (e.preventDefault(), setDragging(false), choose(e.dataTransfer.files[0]))}
                  >
                    <Icon name="upload" size={30} />
                    <strong>Ngarko foto / Drag &amp; Drop</strong>
                    <span>Zgjidhni foton nga pajisja ose bëni një të re<br />Tërhiqeni dhe lëshojeni foton këtu</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        e.target.value = "";
                        if (file) choose(file);
                      }}
                    />
                  </label>
                </div>
              )}
              <label className="field">
                <span>Udhëzim për AI (opsional)</span>
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={notePlaceholder} disabled={busy} />
              </label>
              {busy && <AiReading steps={DOCUMENT_STEPS} />}
            </>
          )}
          {step === 1 && (
            <>
              <div className="ai-intro">
                <h3>Kontrolloni çfarë lexoi AI</h3>
                <p>Ndryshoni ose hiqni çdo rresht që nuk është i saktë. Asgjë nuk ruhet pa shtypur "Ruaj".</p>
              </div>
              {review({ rows, setRows, busy })}
            </>
          )}
          {step === 2 && (
            <div className="ai-done">
              <span className="ai-done-icon"><Icon name="check" size={30} /></span>
              <h3>{saved(count)}</h3>
            </div>
          )}
          {error && <p className="ai-error" role="alert">{error}</p>}
        </div>
        <div className="ai-foot">
          {step === 2 ? (
            <>
              <button type="button" onClick={open}>Importo një tjetër</button>
              <button type="button" className="primary" onClick={() => dialog.current?.close()}>Mbyll</button>
            </>
          ) : (
            <>
              <button type="button" disabled={step === 0 || busy} onClick={() => (setError(""), setStep(0))}>
                <Icon name="back" size={17} /> Kthehu
              </button>
              {step === 0 ? (
                <button type="button" className="primary" disabled={!source || busy} onClick={readIt}>
                  {busy ? "Po lexohet…" : "Lexo me AI"} <Icon name="arrow" size={17} />
                </button>
              ) : (
                <button type="button" className="primary" disabled={busy || !ready(rows)} onClick={saveIt}>
                  <Icon name="check" size={17} /> {busy ? "Po ruhet…" : "Ruaj"}
                </button>
              )}
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
