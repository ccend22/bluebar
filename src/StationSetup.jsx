import React, { useEffect, useState } from "react";
import { fetchPrintStatus } from "./api.js";
import { Icon } from "./components.jsx";
import { configIssues } from "./domain.js";

// What's misconfigured, in plain words, before a busy night finds it.
export function ConfigCheck({ state, onIssues }) {
  const [agent, setAgent] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => fetchPrintStatus().then((s) => alive && setAgent(s)).catch(() => {});
    load();
    const timer = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  const issues = configIssues(state, agent);
  // The settings list marks the topics these belong to.
  const key = issues.map((i) => i.level + i.group).join();
  useEffect(() => onIssues?.(issues), [key]);
  // Nothing wrong: one quiet line, not a panel.
  if (!issues.length)
    return (
      <p className="config-ok">
        <Icon name="check" size={15} /> Konfigurimi është në rregull: çdo produkt ka ku të shkojë.
      </p>
    );
  // Something to look at: one line that opens to the list, so it never pushes the settings down.
  return (
    <details className="config-check">
      <summary>
        <Icon name="info" size={16} />
        <span>
          <b>Kontrolli i konfigurimit:</b> {issues.length} {issues.length === 1 ? "gjë" : "gjëra"} për t'u parë para shërbimit
        </span>
        <Icon name="chevronDown" size={16} />
      </summary>
      {issues.length > 0 && (
        <ul className="config-issues">
          {issues.map((i, n) => (
            <li key={n} className={i.level}>
              <Icon name="info" size={15} />
              <span>
                <b>{i.group}</b> {i.text}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="helper">Inventari: një stok i përbashkët për të gjitha kasat.</p>
    </details>
  );
}
