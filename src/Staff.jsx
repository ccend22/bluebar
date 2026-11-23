import React, { useEffect, useRef, useState } from "react";
import { useConfirm } from "./ConfirmDialog.jsx";
import { bill, money } from "./domain.js";
import { Empty, Icon, Search } from "./components.jsx";
import { ChoiceField } from "./ChoiceField.jsx";
import { WaiterPatternEditor } from "./PatternPad.jsx";
import { setWaiterPin } from "./api.js";

// Kamarierët, as cards: who they are, where they work (a room, or all), how they sign in,
// and what they have on the floor now. StaffSettings edits (Cilësimet → Kamarierët);
// StaffOverview shows the team and its day (the Kamarierët page).

const initials = (name) => name.split(/\s+/).filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase();
// A steady colour per person, from their name.
const hue = (name) => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();

function Avatar({ w }) {
  return (
    <span className={`st-avatar ${w.active ? "" : "off"}`} style={{ "--h": hue(w.name) }} aria-hidden="true">
      {initials(w.name)}
    </span>
  );
}

function Floor({ state, w }) {
  const open = state.tables.filter((t) => t.lines.length && t.waiter === w.id);
  return open.length ? (
    <span className="st-stat"><b>{open.length}</b> {open.length === 1 ? "tavolinë" : "tavolina"} · {money(open.reduce((s, t) => s + bill(t).remaining, 0))}</span>
  ) : (
    <span className="st-stat idle">Pa porosi të hapura</span>
  );
}

export function StaffSettings({ state, update, notify, refresh, rooms, waiter, setWaiter }) {
  const [query, setQuery] = useState("");
  const [pinFor, setPinFor] = useState(null);
  const [patternFor, setPatternFor] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const dialog = useRef(null);
  const confirm = useConfirm();
  const remove = async (w) => {
    const accepted = await confirm({
      title: "Fshi kamarierin?",
      description: "Kamarieri hiqet nga ekipi dhe nuk mund të hyjë më. Emri ruhet në faturat e mëparshme. Për ta ndalur përkohësisht, çaktivizojeni.",
      detail: { name: w.name },
      action: "Fshi kamarierin",
      destructive: true,
    });
    if (accepted) await update("waiter.delete", { waiterId: w.id }, `${w.name} u fshi nga ekipi.`);
  };
  const team = state.waiters.filter((w) => !w.deleted);
  const shown = team.filter((w) => w.name.toLocaleLowerCase("sq").includes(query.trim().toLocaleLowerCase("sq")));
  const active = shown.filter((w) => w.active), inactive = shown.filter((w) => !w.active);
  const noPin = team.filter((w) => w.active && !w.hasPin);
  const roomOptions = [{ value: "", label: "Të gjitha sallat" }, ...rooms.map((a) => ({ value: a, label: a }))];

  const add = async (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") || "").trim();
    const pin = String(form.get("pin") || "");
    const area = String(form.get("area") || "") || null;
    if (!name) return notify("Vendosni emrin dhe mbiemrin.", "error");
    if (team.some((w) => w.name.toLocaleLowerCase("sq") === name.toLocaleLowerCase("sq"))) return notify("Një profil me këtë emër ekziston.", "error");
    // The PIN is part of the profile: no waiter without a way to sign in.
    if (!/^\d{6}$/.test(pin)) return notify("PIN-i duhet të ketë 6 shifra.", "error");
    const data = await update("waiter.create", { name, area });
    if (!data) return;
    const created = data.state.waiters.filter((w) => !w.deleted && w.name === name).at(-1);
    try {
      await setWaiterPin(created.id, pin);
      await refresh();
      notify(`${name} u shtua në ekip${area ? `, te "${area}"` : ""}. Hyn me PIN-in e ri.`);
      dialog.current?.close();
      setFormKey((k) => k + 1);
    } catch (err) {
      await refresh();
      dialog.current?.close();
      setPinFor(created.id);
      notify(`${name} u shtua, por PIN-i nuk u ruajt (${err.message}). Vendoseni te karta.`, "error");
    }
  };

  const card = (w) => {
    const busy = state.tables.some((t) => t.lines.length && t.waiter === w.id);
    const last = w.active && team.filter((x) => x.active).length === 1;
    const open = pinFor === w.id || patternFor === w.id;
    return (
      <article key={w.id} className={`st-card ${w.active ? "" : "off"} ${open ? "expanded" : ""}`}>
        <header>
          <Avatar w={w} />
          <div className="st-who">
            <strong>{w.name}</strong>
            <span className={`st-status ${w.active ? "on" : ""}`}>{w.active ? "Aktiv" : "Joaktiv · nuk mund të hyjë"}</span>
          </div>
          {/* On or off in one tap; when it can't go off, it says why. */}
          <button
            type="button"
            role="switch"
            aria-checked={w.active}
            aria-label={`${w.name}: ${w.active ? "aktiv" : "joaktiv"}`}
            className="st-switch"
            disabled={w.active && (busy || last)}
            title={w.active ? (busy ? "Ka porosi të hapura: nuk mund të çaktivizohet tani" : last ? "Duhet të paktën një kamarier aktiv" : "Çaktivizo") : "Aktivizo"}
            onClick={() => {
              if (w.active && waiter === w.id) setWaiter(team.find((x) => x.active && x.id !== w.id)?.id || w.id);
              update("waiter.toggle", { waiterId: w.id }, w.active ? `${w.name} u çaktivizua: nuk mund të hyjë deri sa ta aktivizoni.` : `${w.name} u aktivizua.`);
            }}
          >
            <i />
          </button>
        </header>
        <div className="st-facts">
          {rooms.length > 1 && w.active && (
            <div className="st-room">
              <ChoiceField
                compact
                label="Salla"
                value={w.area ?? ""}
                options={roomOptions}
                onChange={(v) => update("waiter.area", { waiterId: w.id, area: v || null }, v ? `${w.name} punon te "${v}".` : `${w.name} punon në të gjitha sallat.`)}
              />
            </div>
          )}
          <span className={`st-key ${w.hasPin ? "ok" : "missing"}`}>
            <Icon name={w.hasPin ? "check" : "info"} size={14} /> {w.hasPin ? "PIN" : "Pa PIN"}
          </span>
          <span className={`st-key ${w.hasPattern ? "ok" : ""}`}>
            <Icon name={w.hasPattern ? "check" : "close"} size={14} /> Pattern
          </span>
          {w.pinShared && <span className="st-key missing" title="Dy kamarierë me të njëjtin PIN: vendosni një të ri">PIN i përbashkët</span>}
        </div>
        {w.active && <Floor state={state} w={w} />}
        {pinFor === w.id && (
          <form
            className="st-pin"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await setWaiterPin(w.id, new FormData(e.currentTarget).get("pin"));
                await refresh();
                setPinFor(null);
                notify("PIN-i u ruajt.");
              } catch (err) {
                notify(err.message, "error");
              }
            }}
          >
            <input name="pin" aria-label={`PIN i ri për ${w.name}`} type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="PIN i ri · 6 shifra" autoComplete="off" required autoFocus />
            <button className="primary">Ruaj</button>
            <button type="button" onClick={() => setPinFor(null)}>Anulo</button>
          </form>
        )}
        {patternFor === w.id && (
          <WaiterPatternEditor key={w.id} waiter={w} onCancel={() => setPatternFor(null)} onSaved={async () => { await refresh(); setPatternFor(null); notify("Pattern-i u ruajt."); }} />
        )}
        <footer>
          {w.active ? (
            <>
              <button type="button" className={w.hasPin ? "" : "primary"} onClick={() => { setPatternFor(null); setPinFor(pinFor === w.id ? null : w.id); }}>
                {w.hasPin ? "Ndrysho PIN" : "Vendos PIN"}
              </button>
              <button type="button" onClick={() => { setPinFor(null); setPatternFor(patternFor === w.id ? null : w.id); }}>
                {w.hasPattern ? "Pattern" : "Shto pattern"}
              </button>
            </>
          ) : (
            <button type="button" className="st-delete" onClick={() => remove(w)}>
              <Icon name="trash" size={15} /> Fshi kamarierin
            </button>
          )}
        </footer>
      </article>
    );
  };

  return (
    <section className="panel st-panel">
      <div className="st-head">
        <div>
          <h2>Ekipi</h2>
          <p>{team.filter((w) => w.active).length} aktivë{team.some((w) => !w.active) ? ` · ${team.filter((w) => !w.active).length} joaktivë` : ""} · Hyjnë me PIN-in e tyre, vetëm nga rrjeti i lokalit</p>
        </div>
        <div className="st-tools">
          {team.length > 4 && <Search label="Kërko kamarier" placeholder="Kërko…" value={query} onChange={setQuery} />}
          <button type="button" className="primary" onClick={() => dialog.current?.showModal()}>
            <Icon name="plus" size={17} /> Shto kamarier
          </button>
        </div>
      </div>
      {noPin.length > 0 && (
        <p className="staff-nopin" role="status">
          <Icon name="info" size={16} />
          <span><b>Pa PIN:</b> {noPin.map((w) => w.name).join(", ")}. Vendosni një PIN që të mund të ndryshoni mënyrën e hyrjes te "Stafi dhe hyrja".</span>
        </p>
      )}
      {active.length > 0 && <div className="st-grid">{active.map(card)}</div>}
      {inactive.length > 0 && (
        <>
          <h3 className="st-group">Joaktivë</h3>
          <div className="st-grid">{inactive.map(card)}</div>
        </>
      )}
      {!shown.length && (
        <Empty icon="people" title={team.length ? "Nuk u gjet asnjë kamarier" : "Ndërtoni ekipin tuaj"}>
          {team.length ? "Provoni një emër tjetër." : 'Shtypni "Shto kamarier": emri, PIN-i dhe salla ku punon.'}
        </Empty>
      )}
      <p className="helper st-foot">Pas 5 përpjekjeve të gabuara llogaria bllokohet për 15 minuta; një PIN ose pattern i ri e zhbllokon.</p>

      <dialog ref={dialog} className="st-dialog" aria-labelledby="st-add-title">
        <form key={formKey} onSubmit={add}>
          <header>
            <h2 id="st-add-title">Kamarier i ri</h2>
            <button type="button" className="icon-button" aria-label="Mbyll" onClick={() => dialog.current?.close()}><Icon name="close" size={18} /></button>
          </header>
          <label className="field"><span>Emri dhe mbiemri</span><input name="name" placeholder="p.sh. Ardit Hoxha" maxLength={80} required autoFocus /></label>
          <label className="field">
            <span>PIN-i (6 shifra)</span>
            <input name="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} minLength={6} autoComplete="new-password" placeholder="••••••" required />
            <small className="helper">Me të hyn në telefon. Mund ta ndryshoni kur të doni.</small>
          </label>
          {rooms.length > 1 && <ChoiceField label="Salla ku punon" name="area" defaultValue="" options={roomOptions} />}
          <footer>
            <button type="button" onClick={() => dialog.current?.close()}>Anulo</button>
            <button className="primary"><Icon name="plus" size={17} /> Shto kamarier</button>
          </footer>
        </form>
      </dialog>
    </section>
  );
}

export function StaffOverview({ state, rooms, onEdit }) {
  const team = state.waiters.filter((w) => !w.deleted && w.active);
  const today = (w) => state.invoices.filter((i) => i.waiter === w.id && isToday(i.date));
  // Busiest first: who has the floor right now.
  const sorted = [...team].sort((a, b) => state.tables.filter((t) => t.lines.length && t.waiter === b.id).length - state.tables.filter((t) => t.lines.length && t.waiter === a.id).length || a.name.localeCompare(b.name, "sq"));
  return (
    <section className="panel st-panel">
      <div className="st-head">
        <div>
          <h2>Ekipi sot</h2>
          <p>{team.length} kamarierë aktivë</p>
        </div>
        <div className="st-tools">
          <button type="button" onClick={onEdit}><Icon name="settings" size={16} /> Ndrysho te Cilësimet</button>
        </div>
      </div>
      <div className="st-grid">
        {sorted.map((w) => {
          const sales = today(w);
          return (
            <article key={w.id} className="st-card view">
              <header>
                <Avatar w={w} />
                <div className="st-who">
                  <strong>{w.name}</strong>
                  <span className="st-room-tag">{rooms.length > 1 ? w.area || "Të gjitha sallat" : "Salla"}</span>
                </div>
              </header>
              <dl className="st-numbers">
                <div><dt>Tavolina tani</dt><dd>{state.tables.filter((t) => t.lines.length && t.waiter === w.id).length}</dd></div>
                <div><dt>Për t'u paguar</dt><dd>{money(state.tables.filter((t) => t.lines.length && t.waiter === w.id).reduce((s, t) => s + bill(t).remaining, 0))}</dd></div>
                <div><dt>Fatura sot</dt><dd>{sales.length}</dd></div>
                <div><dt>Shitje sot</dt><dd>{money(sales.reduce((s, i) => s + i.total, 0))}</dd></div>
              </dl>
            </article>
          );
        })}
      </div>
      {!team.length && <Empty icon="people" title="Ende pa kamarierë">Shtojini te Cilësimet → Kamarierët.</Empty>}
    </section>
  );
}
