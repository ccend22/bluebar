import React, { useEffect, useState } from "react";
import { createPrintPairing, fetchPrintStatus, testPrinter } from "./api.js";
import { Badge, DepartmentTag, Field, Icon, SectionHeading } from "./components.jsx";

const PAPER = [
  { width: 56, label: "88 mm" },
  { width: 48, label: "80 mm" },
  { width: 42, label: "80 mm (42 shenja)" },
  { width: 32, label: "58 mm" },
];
const online = (status) => status?.lastSeen && Date.now() - new Date(status.lastSeen) < 15000;

// Manager setup for the venue's LAN printers and the agent that drives them.
export function NetworkPrinters({ state, update, notify }) {
  const [editing, setEditing] = useState(null);
  const [status, setStatus] = useState(null);
  const departments = [...state.departments, "Tjetër"];

  useEffect(() => {
    let alive = true;
    const load = () => fetchPrintStatus().then((s) => alive && setStatus(s)).catch(() => {});
    load();
    const timer = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  async function save(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      ...(editing.id ? { id: editing.id } : {}),
      name: form.get("name").trim(),
      host: usb ? `usb:${form.get("queue").trim()}` : form.get("host").trim(),
      port: usb ? 9100 : Number(form.get("port") || 9100),
      ascii: form.get("ascii") === "on",
      cutter: form.get("cutter") === "on",
      width: Number(form.get("width")),
      departments: form.getAll("departments"),
      receipts: form.get("receipts") === "on",
    };
    if (await update("printer.save", payload, editing.id ? "Printeri u ruajt." : "Printeri u shtua.")) setEditing(null);
  }

  // Network (IP) or USB on the print computer ("usb:<queue>").
  const usb = editing?.usb ?? Boolean(editing?.host?.startsWith("usb:"));
  const queues = status?.usbPrinters ?? [];
  const queue = editing?.host?.startsWith("usb:") ? editing.host.slice(4) : queues[0];

  return (
    <>
      <section className="panel">
        <SectionHeading
          title="Printerët"
          description="Çdo repart printon te printeri i vet; arka printon faturën e plotë."
        >
          {!editing && (
            <button onClick={() => setEditing({ width: 56, departments: [], receipts: false })}>
              <Icon name="plus" size={16} /> Shto
            </button>
          )}
        </SectionHeading>
        {editing ? (
          <form className="stack-form" onSubmit={save} key={editing.id || "new"}>
            <Field label="Emri" name="name" defaultValue={editing.name || ""} placeholder="p.sh. Kuzhina" maxLength={40} required autoFocus />
            <div className="tabs" aria-label="Lidhja e printerit">
              <button type="button" aria-pressed={!usb} onClick={() => setEditing({ ...editing, usb: false })}>
                Rrjeti (IP)
              </button>
              <button type="button" aria-pressed={usb} onClick={() => setEditing({ ...editing, usb: true })}>
                USB
              </button>
            </div>
            {usb ? (
              queues.length ? (
                <Field label="Printeri në kompjuterin e printimit">
                  <select name="queue" defaultValue={queue} required>
                    {[...new Set([queue, ...queues])].filter(Boolean).map((q) => (
                      <option key={q} value={q}>{q.replaceAll("_", " ")}</option>
                    ))}
                  </select>
                </Field>
              ) : (
                <>
                  <Field label="Emri i printerit në kompjuter" name="queue" defaultValue={queue || ""} placeholder="p.sh. GEZHI_micro_printer" pattern="[A-Za-z0-9_.\-]{1,60}" required />
                  <p className="helper">Lidhni kompjuterin e printimit (më poshtë) dhe printerët e tij USB shfaqen këtu në listë.</p>
                </>
              )
            ) : (
              <div className="printer-address">
                <Field label="IP e printerit" name="host" defaultValue={editing.host?.startsWith("usb:") ? "" : editing.host || ""} placeholder="192.168.1.50" required />
                <Field label="Porta" name="port" type="number" min="1" max="65535" defaultValue={editing.port || 9100} />
              </div>
            )}
            <fieldset className="printer-choice">
              <legend>Letra</legend>
              {PAPER.map((p) => (
                <label key={p.width}>
                  <input type="radio" name="width" value={p.width} defaultChecked={(editing.width ?? 56) === p.width} />
                  {p.label}
                </label>
              ))}
            </fieldset>
            <fieldset className="printer-choice">
              <legend>Printon</legend>
              {departments.map((d) => (
                <label key={d}>
                  <input type="checkbox" name="departments" value={d} defaultChecked={editing.departments.includes(d)} />
                  <DepartmentTag name={d} />
                </label>
              ))}
              <label>
                <input type="checkbox" name="receipts" defaultChecked={editing.receipts} />
                <strong>Faturat e arkës</strong>
              </label>
            </fieldset>
            <label className="printer-ascii">
              <input type="checkbox" name="cutter" defaultChecked={editing.cutter !== false} />
              <span>
                Prerëse automatike
                <small>Fatura pritet vetë. Hiqeni nëse prerësja nuk punon: letra del e plotë për t'u grisur.</small>
              </span>
            </label>
            <label className="printer-ascii">
              <input type="checkbox" name="ascii" defaultChecked={editing.ascii} />
              <span>
                Printo pa ë dhe ç
                <small>Për printera që i shfaqin si “?” ose shenja kineze: printohen si e dhe c.</small>
              </span>
            </label>
            {!usb && (
              <p className="helper">IP-ja shfaqet në fletën e vetë-testit të printerit (mbani butonin FEED gjatë ndezjes).</p>
            )}
            <div className="actions">
              <button type="button" onClick={() => setEditing(null)}>Anulo</button>
              <button className="primary">{editing.id ? "Ruaj" : "Shto printerin"}</button>
            </div>
          </form>
        ) : state.printers.length ? (
          <div className="printer-list">
            {state.printers.map((p) => (
              <article key={p.id} className="printer-card">
                <div>
                  <strong>{p.name}</strong>
                  <small>
                    {p.host.startsWith("usb:") ? `USB · ${p.host.slice(4).replaceAll("_", " ")}` : `${p.host}:${p.port}`} ·{" "}
                    {PAPER.find((paper) => paper.width === p.width)?.label || `${p.width} shenja`}
                  </small>
                  <div className="printer-targets">
                    {p.departments.map((d) => (
                      <DepartmentTag key={d} name={d} />
                    ))}
                    {p.receipts && <Badge tone="green">Faturat</Badge>}
                  </div>
                </div>
                <div className="printer-actions">
                  <button
                    onClick={() =>
                      testPrinter(p.id)
                        .then(() => notify(`Prova u dërgua te ${p.name}.`))
                        .catch((e) => notify(e.message, "error"))
                    }
                  >
                    Provo
                  </button>
                  <button className="icon-button" aria-label={`Ndrysho ${p.name}`} onClick={() => setEditing(p)}>
                    <Icon name="edit" size={17} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Fshi ${p.name}`}
                    onClick={() => update("printer.delete", { id: p.id }, "Printeri u fshi.")}
                  >
                    <Icon name="close" size={17} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="helper">
            Shtoni printerët termikë me kabllo rrjeti ose WiFi (ESC/POS, porta 9100). Pa printer rrjeti,
            fletët printohen nga shfletuesi i pajisjes së repartit.
          </p>
        )}
      </section>
      <PrintComputer status={status} notify={notify} />
    </>
  );
}

const SYSTEMS = [
  ["windows", "Windows"],
  ["mac", "Mac"],
  ["linux", "Linux"],
];
const thisSystem = () =>
  /Windows/.test(navigator.userAgent) ? "windows" : /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent) ? "linux" : "mac";

// The venue computer that carries print jobs to the printers. Pairing gives a one-time
// code baked into an installer: double-click on Windows, one pasted line on Mac/Linux.
function PrintComputer({ status, notify }) {
  const [pairing, setPairing] = useState(null);
  const [system, setSystem] = useState(thisSystem);
  const [busy, setBusy] = useState(false);
  const base = `${window.location.origin}/api/print/install/${pairing?.code}`;
  const line = system === "windows" ? `irm ${base}.ps1 | iex` : `curl -fsSL ${base}.sh | bash`;
  // Paired once the agent checks in after this code was made.
  const paired =
    pairing && status?.lastSeen && new Date(status.lastSeen) > new Date(pairing.expiresAt) - 10 * 60_000;
  useEffect(() => {
    if (!paired) return;
    setPairing(null);
    notify("Kompjuteri u lidh. Fletët printohen tani prej tij.");
  }, [paired]);

  async function start() {
    setBusy(true);
    try {
      setPairing(await createPrintPairing());
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  const copy = () => navigator.clipboard?.writeText(line).then(() => notify("U kopjua."));
  const expires = pairing && new Date(pairing.expiresAt);
  const until = expires && [expires.getHours(), expires.getMinutes()].map((n) => String(n).padStart(2, "0")).join(":");

  return (
    <section className="panel">
      <SectionHeading
        title="Kompjuteri i printimit"
        description="Një kompjuter i lokalit, në të njëjtin rrjet me printerët, që dërgon fletët te ta."
      />
      <p className={`agent-status ${online(status) ? "on" : ""}`}>
        <span />
        {!status?.configured
          ? "Asnjë kompjuter i lidhur"
          : online(status)
            ? `Në linjë${status.pending ? ` · ${status.pending} në radhë` : ""}`
            : `Jashtë linje${status.pending ? ` · ${status.pending} fletë presin` : ""}`}
      </p>
      {pairing ? (
        <div className="pair-setup">
          <div className="tabs" aria-label="Sistemi i kompjuterit">
            {SYSTEMS.map(([id, label]) => (
              <button key={id} aria-pressed={system === id} onClick={() => setSystem(id)}>
                {label}
              </button>
            ))}
          </div>
          {system === "windows" ? (
            <ol className="pair-steps">
              <li>
                Në kompjuterin e lokalit, hapni BlueBar dhe shkarkoni:
                <a className="button-link primary-link" href={`${base}.cmd`} download="BlueBar Print.cmd">
                  <Icon name="print" size={16} /> Shkarko BlueBar Print
                </a>
              </li>
              <li>Hapeni skedarin. Nëse Windows pyet, zgjidhni <strong>Run / Ekzekuto</strong>.</li>
              <li>Kaq. Kur shfaqet “Gati!”, mund ta mbyllni dritaren.</li>
            </ol>
          ) : (
            <ol className="pair-steps">
              <li>Në kompjuterin e lokalit hapni <strong>Terminal</strong>{system === "mac" ? " (Cmd + Space, shkruani “Terminal”)" : ""}.</li>
              <li>
                Ngjitni këtë rresht dhe shtypni Enter:
                <span className="pair-line">
                  <code>{line}</code>
                  <button onClick={copy}>Kopjo</button>
                </span>
              </li>
              <li>Kaq. Kur shfaqet “Gati!”, mund ta mbyllni dritaren.</li>
            </ol>
          )}
          {system === "windows" && (
            <details className="pair-alt">
              <summary>Ose me PowerShell</summary>
              <span className="pair-line">
                <code>{line}</code>
                <button onClick={copy}>Kopjo</button>
              </span>
            </details>
          )}
          <p className="helper">
            Kjo lidhje vlen deri në {until} dhe vetëm një herë. Pastaj programi niset vetë sa herë ndizet kompjuteri.
          </p>
          <button className="text-button" onClick={() => setPairing(null)}>Anulo</button>
        </div>
      ) : (
        <>
          <p className="helper">
            {status?.configured
              ? "Lidhja e një kompjuteri tjetër shkëput atë të mëparshmin."
              : "Lidheni një herë: pa instalime shtesë, dhe niset vetë sa herë ndizet kompjuteri."}
          </p>
          <button className="primary" disabled={busy} onClick={start}>
            <Icon name="print" size={16} />
            {status?.configured ? "Lidh një kompjuter tjetër" : "Lidh një kompjuter"}
          </button>
        </>
      )}
    </section>
  );
}
