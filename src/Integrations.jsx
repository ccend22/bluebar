import React, { useEffect, useRef, useState } from "react";
import { fetchMcpIntegration } from "./api.js";
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
    </div>
  );
}
