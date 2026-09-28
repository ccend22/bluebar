import React, { useEffect, useState } from "react";
import { createPrintKey, fetchPrintStatus, testPrinter, venueSlug } from "./api.js";
import { Badge, DepartmentTag, Field, Icon, SectionHeading } from "./components.jsx";

const PAPER = [
  { width: 48, label: "80 mm" },
  { width: 32, label: "58 mm" },
];
const online = (status) => status?.lastSeen && Date.now() - new Date(status.lastSeen) < 15000;

// Manager setup for the venue's LAN printers and the agent that drives them.
export function NetworkPrinters({ state, update, notify }) {
  const [editing, setEditing] = useState(null);
  const [status, setStatus] = useState(null);
  const [key, setKey] = useState(null);
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
      host: form.get("host").trim(),
      port: Number(form.get("port") || 9100),
      width: Number(form.get("width")),
      departments: form.getAll("departments"),
      receipts: form.get("receipts") === "on",
    };
    if (await update("printer.save", payload, editing.id ? "Printeri u ruajt." : "Printeri u shtua.")) setEditing(null);
  }
  const command = key && `node bluebar-print.mjs --url ${window.location.origin} --venue ${venueSlug} --key ${key}`;

  return (
    <>
      <section className="panel">
        <SectionHeading
          title="Printerët e rrjetit"
          description="Çdo repart printon te printeri i vet; arka printon faturën e plotë."
        >
          {!editing && (
            <button onClick={() => setEditing({ width: 48, departments: [], receipts: false })}>
              <Icon name="plus" size={16} /> Shto
            </button>
          )}
        </SectionHeading>
        {editing ? (
          <form className="stack-form" onSubmit={save} key={editing.id || "new"}>
            <Field label="Emri" name="name" defaultValue={editing.name || ""} placeholder="p.sh. Kuzhina" maxLength={40} required autoFocus />
            <div className="printer-address">
              <Field label="IP e printerit" name="host" defaultValue={editing.host || ""} placeholder="192.168.1.50" required />
              <Field label="Porta" name="port" type="number" min="1" max="65535" defaultValue={editing.port || 9100} />
            </div>
            <fieldset className="printer-choice">
              <legend>Letra</legend>
              {PAPER.map((p) => (
                <label key={p.width}>
                  <input type="radio" name="width" value={p.width} defaultChecked={(editing.width || 48) === p.width} />
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
            <p className="helper">IP-ja shfaqet në fletën e vetë-testit të printerit (mbani butonin FEED gjatë ndezjes).</p>
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
                    {p.host}:{p.port} · {p.width === 32 ? "58 mm" : "80 mm"}
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
      <section className="panel">
        <SectionHeading title="Agjenti i printimit" description="Programi në kompjuterin e lokalit që dërgon fletët te printerët." />
        <p className={`agent-status ${online(status) ? "on" : ""}`}>
          <span />
          {!status?.configured
            ? "I pa lidhur ende"
            : online(status)
              ? `Në linjë${status.pending ? ` · ${status.pending} në radhë` : ""}`
              : `Jashtë linje${status.pending ? ` · ${status.pending} fletë presin` : ""}`}
        </p>
        {key ? (
          <div className="agent-setup">
            <p className="helper">
              Në një kompjuter që qëndron ndezur në lokal (Windows, Mac ose Linux, me Node.js), shkarkoni
              agjentin dhe nisni këtë komandë. Çelësi shfaqet vetëm tani.
            </p>
            <code>{command}</code>
            <button onClick={() => navigator.clipboard?.writeText(command).then(() => notify("Komanda u kopjua."))}>
              Kopjo komandën
            </button>
          </div>
        ) : (
          <p className="helper">
            Një çelës i ri shkëput agjentin e mëparshëm.
          </p>
        )}
        <div className="actions">
          <a className="button-link" href="/bluebar-print.mjs" download>
            <Icon name="print" size={16} /> Shkarko agjentin
          </a>
          <button
            onClick={() =>
              createPrintKey()
                .then((r) => setKey(r.key))
                .catch((e) => notify(e.message, "error"))
            }
          >
            {status?.configured ? "Çelës i ri" : "Krijo çelësin"}
          </button>
        </div>
      </section>
    </>
  );
}
