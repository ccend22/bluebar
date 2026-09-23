import React, { useEffect, useState } from "react";
import { fetchNetwork, saveNetwork } from "./api.js";
import { Field, SectionHeading } from "./components.jsx";

export function BusinessNetwork({ venue }) {
  const [data, setData] = useState(null);
  const [entries, setEntries] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetchNetwork().then(value => {
      if (!active) return;
      setData(value);
      setEntries(value.allowedIps.join("\n"));
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);
  async function save(event) {
    event.preventDefault();
    setBusy(true); setMessage(""); setError("");
    try {
      const value = await saveNetwork(entries.split(/[\n,]/).map(x => x.trim()).filter(Boolean));
      setData(value); setEntries(value.allowedIps.join("\n"));
      setMessage("Rrjeti i lokalit u ruajt.");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <section className="panel">
    <SectionHeading title="Rrjeti i lokalit" description="Vetëm këto IP lejojnë hyrjen dhe punën e kamarierëve." />
    <p className="helper">Kodi për stafin: <strong>{venue?.slug || "bluebar"}</strong></p>
    {error && <p className="notice error" role="alert">{error}</p>}
    {message && <p className="notice" role="status">{message}</p>}
    {!data ? <p className="helper">{error ? "Rifreskoni faqen për ta provuar sërish." : "Po ngarkohet…"}</p> :
      <form className="stack-form" onSubmit={save}>
        <Field label="IP-të e lejuara (një për rresht)">
          <textarea rows={3} value={entries} onChange={e => setEntries(e.target.value)} disabled={busy} placeholder="p.sh. 203.0.113.10" />
        </Field>
        <p className="helper">Pa IP të vendosura, kamarierët nuk mund të hyjnë. Shtoni IP-në aktuale vetëm nëse jeni në rrjetin e lokalit.</p>
        <button type="button" disabled={busy} onClick={() => setEntries([...new Set([...entries.split(/[\n,]/).map(x => x.trim()).filter(Boolean), data.currentIp])].join("\n"))}>Shto IP-në time: {data.currentIp}</button>
        <button className="primary" disabled={busy}>{busy ? "Po ruhet…" : "Ruaj rrjetin"}</button>
      </form>}
  </section>;
}
