import React, { useState } from "react";
import { Badge, Field, Icon, SectionHeading } from "./components.jsx";

// Manager setup for the business's tills: each serves the tables of its areas, with
// its own shift and cash count. Products and stock are shared by every till.
export function PointsOfSale({ state, update }) {
  const [editing, setEditing] = useState(null);
  const areas = [...new Set(state.tables.filter((t) => t.active).map((t) => t.area))].sort((a, b) => a.localeCompare(b, "sq"));
  const first = state.pointsOfSale[0];
  // Areas no till claims are served by the first one.
  const unclaimed = areas.filter((a) => !state.pointsOfSale.some((k) => k.areas.includes(a)));

  async function save(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      ...(editing.id ? { id: editing.id } : {}),
      name: form.get("name").trim(),
      areas: form.getAll("areas"),
    };
    if (await update("pos.save", payload, editing.id ? "Kasa u ruajt." : "Kasa u shtua.")) setEditing(null);
  }

  return (
    <section className="panel">
      <SectionHeading
        title="Kasat"
        description="P.sh. bari brenda dhe bari jashtë: secila me zonat, turnin dhe arkën e vet. Inventari është i përbashkët."
      >
        {!editing && (
          <button onClick={() => setEditing({ areas: [] })}>
            <Icon name="plus" size={16} /> Shto
          </button>
        )}
      </SectionHeading>
      {editing ? (
        <form className="stack-form" onSubmit={save} key={editing.id || "new"}>
          <Field label="Emri" name="name" defaultValue={editing.name || ""} placeholder="p.sh. Bari jashtë" maxLength={40} required autoFocus />
          <fieldset className="printer-choice">
            <legend>Zonat që shërben</legend>
            {areas.map((a) => {
              const owner = state.pointsOfSale.find((k) => k.id !== editing.id && k.areas.includes(a));
              return (
                <label key={a}>
                  <input type="checkbox" name="areas" value={a} defaultChecked={editing.areas.includes(a)} />
                  {a}
                  {owner && <small>· tani te {owner.name}</small>}
                </label>
              );
            })}
          </fieldset>
          {!areas.length && <p className="helper">Shtoni tavolina me zona (p.sh. Salla, Tarraca) te Tavolinat.</p>}
          <div className="actions">
            <button type="button" onClick={() => setEditing(null)}>Anulo</button>
            <button className="primary">{editing.id ? "Ruaj" : "Shto kasën"}</button>
          </div>
        </form>
      ) : (
        <div className="printer-list">
          {state.pointsOfSale.map((k) => {
            const served = k.id === first?.id ? [...k.areas, ...unclaimed] : k.areas;
            const open = state.openShifts.some((s) => s.posId === k.id);
            return (
              <article key={k.id} className="printer-card">
                <div>
                  <strong>{k.name}</strong>
                  <small>
                    {open ? "Turn i hapur" : "Turn i mbyllur"} ·{" "}
                    {state.waiters.filter((w) => w.active && w.posId === k.id).length} kamarierë të caktuar
                  </small>
                  <div className="printer-targets">
                    {served.length ? served.map((a) => <Badge key={a}>{a}</Badge>) : <small>Pa zona</small>}
                  </div>
                </div>
                <div className="printer-actions">
                  <button className="icon-button" aria-label={`Ndrysho ${k.name}`} onClick={() => setEditing(k)}>
                    <Icon name="edit" size={17} />
                  </button>
                  {state.pointsOfSale.length > 1 && (
                    <button
                      className="icon-button"
                      aria-label={`Fshi ${k.name}`}
                      onClick={() => update("pos.delete", { id: k.id }, "Kasa u fshi.")}
                    >
                      <Icon name="close" size={17} />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
