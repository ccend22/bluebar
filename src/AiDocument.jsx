import React, { useRef, useState } from "react";
import { shrink } from "./OnlineMenu.jsx";
import { Icon } from "./components.jsx";

const STEPS = ["Ngarko", "Shiko", "Sukses"];

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
      else (setRows(found), setStep(1));
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
                <div className="ai-preview">
                  {source.url ? <img src={source.url} alt="Dokumenti" /> : <pre>{source.text.slice(0, 600)}</pre>}
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
              {busy && <p className="ai-reading" role="status"><span className="ai-spinner" /> AI po lexon dokumentin… mund të zgjasë deri në 90 sekonda.</p>}
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
