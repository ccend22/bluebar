import React, { useEffect, useRef, useState } from "react";
import { createGptKey, fetchGptKey, fetchMcpIntegration, revokeGptKey } from "./api.js";
import { useConfirm } from "./ConfirmDialog.jsx";
import { Icon, SectionHeading } from "./components.jsx";

export function Integrations({ notify }) {
  const [integration, setIntegration] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const link = useRef(null);
  useEffect(() => {
    let mounted = true;
    fetchMcpIntegration().then(
      (data) => { if (mounted) setIntegration(data); },
      (err) => { if (mounted) setError(err.message); },
    );
    return () => { mounted = false; };
  }, [retry]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(integration.endpoint);
      notify("Lidhja MCP u kopjua.");
    } catch {
      link.current?.focus();
      link.current?.select();
      notify("Lidhja u përzgjodh. Kopjojeni me tastierë.", "error");
    }
  };

  return (
    <div className="settings-column settings-wide">
      <section className="panel mcp-settings">
        <SectionHeading icon="sparkle" title="BlueBar MCP" description="Lidhni ChatGPT ose Claude për të lexuar të dhënat e biznesit." />
        {error ? (
          <div className="mcp-settings-feedback">
            <p role="alert">{error}</p>
            <button type="button" onClick={() => { setError(""); setRetry((n) => n + 1); }}>Provo përsëri</button>
          </div>
        ) : !integration ? (
          <p className="helper" role="status">Po ngarkohet lidhja…</p>
        ) : integration.endpoint ? (
          <>
            <label className="field" htmlFor="mcp-endpoint"><span>Adresa MCP</span></label>
            <div className="mcp-settings-link">
              <input id="mcp-endpoint" ref={link} value={integration.endpoint} readOnly />
              <button type="button" onClick={copy}><Icon name="clipboard" size={16} /> Kopjo adresën</button>
            </div>
            <p className="helper">Shtojeni adresën në aplikacionin tuaj me OAuth. Për autorizimin, përdorni kodin <b>{integration.business}</b> dhe hyni si menaxher në BlueBar.</p>
            <a className="button-like" href={integration.connections} target="_blank" rel="noopener noreferrer">Menaxho lidhjet <Icon name="diagonal" size={15} /></a>
          </>
        ) : (
          <p className="helper">MCP nuk është aktiv në këtë instalim të BlueBar.</p>
        )}
      </section>
      <GptKey notify={notify} />
    </div>
  );
}

// A read-only API key for a Custom GPT in ChatGPT (Actions). The key is shown once.
function GptKey({ notify }) {
  const confirm = useConfirm();
  const [state, setState] = useState(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const spec = `${window.location.origin}/api/gpt/openapi.json`;
  useEffect(() => { fetchGptKey().then(setState, (err) => notify(err.message, "error")); }, []);

  const copy = async (text, done) => {
    try { await navigator.clipboard.writeText(text); notify(done); }
    catch { notify("Kopjimi dështoi. Përzgjidheni tekstin dhe kopjojeni me tastierë.", "error"); }
  };
  const create = async () => {
    if (state?.active && !(await confirm({
      title: "Krijo çelës të ri?",
      description: "Çelësi i vjetër ndalon së punuari menjëherë. GPT-ja duhet përditësuar me çelësin e ri.",
      action: "Krijo çelës të ri",
    }))) return;
    setBusy(true);
    try {
      const created = await createGptKey();
      setKey(created.key);
      setState({ active: true, hint: created.hint, createdAt: new Date().toISOString(), lastUsedAt: null });
    } catch (err) { notify(err.message, "error"); }
    setBusy(false);
  };
  const revoke = async () => {
    if (!(await confirm({
      title: "Çaktivizo çelësin?",
      description: "ChatGPT nuk do të mund të lexojë më të dhënat e biznesit me këtë çelës.",
      action: "Çaktivizo",
    }))) return;
    setBusy(true);
    try { await revokeGptKey(); setKey(""); setState({ active: false }); notify("Çelësi u çaktivizua."); }
    catch (err) { notify(err.message, "error"); }
    setBusy(false);
  };

  return (
    <section className="panel mcp-settings">
      <SectionHeading icon="sparkle" title="ChatGPT (GPT me Actions)" description="Çelës vetëm për lexim: shitje, stok dhe stafi. ChatGPT nuk mund të ndryshojë asgjë." />
      <label className="field" htmlFor="gpt-spec"><span>Adresa e skemës (Import from URL)</span></label>
      <div className="mcp-settings-link">
        <input id="gpt-spec" value={spec} readOnly />
        <button type="button" onClick={() => copy(spec, "Adresa u kopjua.")}><Icon name="clipboard" size={16} /> Kopjo</button>
      </div>
      {key ? (
        <>
          <label className="field" htmlFor="gpt-key"><span>Çelësi API (shfaqet vetëm tani)</span></label>
          <div className="mcp-settings-link">
            <input id="gpt-key" value={key} readOnly onFocus={(e) => e.target.select()} />
            <button type="button" onClick={() => copy(key, "Çelësi u kopjua.")}><Icon name="clipboard" size={16} /> Kopjo çelësin</button>
          </div>
          <p className="helper">Në GPT: Authentication → API Key → Bearer. Mbajeni GPT-në private: kushdo që e përdor sheh shitjet e biznesit.</p>
        </>
      ) : (
        <p className="helper" role="status">
          {!state ? "Po ngarkohet…" : state.active
            ? `Aktiv (${state.hint})${state.lastUsedAt ? `, përdorur së fundi ${new Date(state.lastUsedAt).toLocaleString("sq-AL")}` : ", ende i papërdorur"}.`
            : "Nuk ka çelës aktiv."}
        </p>
      )}
      <div className="mcp-settings-feedback">
        <button type="button" disabled={busy || !state} onClick={create}>{state?.active ? "Krijo çelës të ri" : "Krijo çelës"}</button>
        {state?.active && <button type="button" disabled={busy} onClick={revoke}>Çaktivizo</button>}
      </div>
    </section>
  );
}
