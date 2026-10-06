import React, { useEffect, useState } from "react";
import { fetchPrintStatus } from "./api.js";
import { Badge, DepartmentTag, Field, Icon, SectionHeading } from "./components.jsx";
import { ChoiceField } from "./ChoiceField.jsx";
import { configIssues } from "./domain.js";

// Manager setup for the places that prepare orders. Optional: without any, tickets go
// by department exactly as before — a business with one bar and one kitchen never
// needs to open this.
export function StationSetup({ state, update }) {
  const [editing, setEditing] = useState(null);
  const stations = state.stations || [];
  const zones = [...new Set(state.tables.filter((t) => t.active).map((t) => t.area))].sort((a, b) => a.localeCompare(b, "sq"));
  const departments = [...state.departments, "Tjetër"];
  const name = (id) => stations.find((x) => x.id === id)?.name;

  async function save(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      ...(editing.id ? { id: editing.id } : {}),
      name: form.get("name").trim(),
      departments: form.getAll("departments"),
      areas: form.getAll("areas"),
      printerId: form.get("printerId") ? Number(form.get("printerId")) : null,
      backupId: form.get("backupId") ? Number(form.get("backupId")) : null,
    };
    if (await update("station.save", payload, editing.id ? "Stacioni u ruajt." : "Stacioni u shtua.")) setEditing(null);
  }

  return (
    <section className="panel">
      <SectionHeading
        title="Stacionet"
        description="Ku përgatitet porosia: bari brenda, bari jashtë, furra, kuzhina. Opsionale: pa stacione, fletët shkojnë sipas repartit të përgatitjes."
      >
        {!editing && (
          <button onClick={() => setEditing({ departments: [], areas: [] })}>
            <Icon name="plus" size={16} /> Shto
          </button>
        )}
      </SectionHeading>
      {editing ? (
        <form className="stack-form" onSubmit={save} key={editing.id || "new"}>
          <Field label="Emri" name="name" defaultValue={editing.name || ""} placeholder="p.sh. Bari jashtë" maxLength={40} required autoFocus />
          <fieldset className="printer-choice">
            <legend>Përgatit</legend>
            {departments.map((d) => (
              <label key={d}>
                <input type="checkbox" name="departments" value={d} defaultChecked={editing.departments.includes(d)} />
                <DepartmentTag name={d} />
              </label>
            ))}
          </fieldset>
          <fieldset className="printer-choice">
            <legend>Për zonat</legend>
            {zones.map((z) => (
              <label key={z}>
                <input type="checkbox" name="areas" value={z} defaultChecked={editing.areas.includes(z)} />
                {z}
              </label>
            ))}
          </fieldset>
          <p className="helper">Pa zonë të zgjedhur, stacioni shërben të gjitha zonat (p.sh. një kuzhinë e përbashkët).</p>
          <ChoiceField
            label="Fletët i merr"
            name="printerId"
            defaultValue={String(editing.printerId ?? "")}
            options={[
              { value: "", label: "Ekrani te Repartet (pa printer)" },
              ...state.printers.map((p) => ({ value: String(p.id), label: `Printeri ${p.name}` })),
            ]}
          />
          <ChoiceField
            label="Rezerva kur është joaktiv"
            name="backupId"
            defaultValue={String(editing.backupId ?? "")}
            options={[
              { value: "", label: "Pa rezervë" },
              ...stations.filter((x) => x.id !== editing.id).map((x) => ({ value: String(x.id), label: x.name })),
            ]}
          />
          <div className="actions">
            <button type="button" onClick={() => setEditing(null)}>Anulo</button>
            <button className="primary">{editing.id ? "Ruaj" : "Shto stacionin"}</button>
          </div>
        </form>
      ) : stations.length ? (
        <div className="printer-list">
          {stations.map((x) => {
            const printer = state.printers.find((p) => p.id === x.printerId);
            return (
              <article key={x.id} className={`printer-card ${x.active ? "" : "inactive"}`}>
                <div>
                  <strong>
                    {x.name} {!x.active && <Badge tone="amber">Joaktiv</Badge>}
                  </strong>
                  <small>
                    {printer ? `Printeri ${printer.name}` : "Ekrani te Repartet"}
                    {x.backupId ? ` · rezervë: ${name(x.backupId)}` : ""}
                  </small>
                  <div className="printer-targets">
                    {x.departments.map((d) => <DepartmentTag key={d} name={d} />)}
                    {x.areas.length ? x.areas.map((a) => <Badge key={a}>{a}</Badge>) : <Badge>Të gjitha zonat</Badge>}
                  </div>
                </div>
                <div className="printer-actions">
                  <button onClick={() => update("station.toggle", { id: x.id }, x.active ? `${x.name} u çaktivizua: porositë e reja shkojnë te rezerva.` : `${x.name} u aktivizua.`)}>
                    {x.active ? "Çaktivizo" : "Aktivizo"}
                  </button>
                  <button className="icon-button" aria-label={`Ndrysho ${x.name}`} onClick={() => setEditing(x)}>
                    <Icon name="edit" size={17} />
                  </button>
                  <button className="icon-button" aria-label={`Fshi ${x.name}`} onClick={() => update("station.delete", { id: x.id }, "Stacioni u fshi.")}>
                    <Icon name="close" size={17} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="helper">
          Me një bar dhe një kuzhinë nuk ju duhen. Shtoni stacione kur i njëjti produkt përgatitet në vende
          të ndryshme sipas zonës (dy bare), kur kuzhinat ndahen (picat në furrë, të tjerat në kuzhinë), ose
          kur doni një stacion rezervë.
        </p>
      )}
    </section>
  );
}

// What's misconfigured, in plain words, before a busy night finds it.
export function ConfigCheck({ state }) {
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
  // Nothing wrong: one quiet line, not a panel.
  if (!issues.length)
    return (
      <p className="config-ok">
        <Icon name="check" size={15} /> Konfigurimi është në rregull: çdo produkt ka ku të shkojë dhe çdo stacion ka pajisje.
      </p>
    );
  return (
    <section className="panel config-check">
      <SectionHeading
        title="Kontrolli i konfigurimit"
        description="Zonat, kasat, stafi, produktet dhe stacionet: çfarë mund të ngecë gjatë shërbimit."
      >
        <Badge tone={issues.some((i) => i.level === "error") ? "amber" : "green"}>
          {issues.length ? `${issues.length} për t'u parë` : "Në rregull"}
        </Badge>
      </SectionHeading>
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
      <p className="helper">Inventari: një stok i përbashkët për të gjitha kasat dhe stacionet.</p>
    </section>
  );
}
