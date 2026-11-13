import React, { useEffect, useRef, useState } from "react";
import { plural, reservationClash, reservationTime, tableName } from "./domain.js";
import { Empty, Field, Icon, SectionHeading } from "./components.jsx";

// Dates as the venue's own calendar day, "2026-11-13".
const today = () => new Date().toLocaleDateString("sv-SE");
const addDays = (date, n) => {
  const d = new Date(`${date}T12:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("sv-SE");
};
const MONTHS = ["janar", "shkurt", "mars", "prill", "maj", "qershor", "korrik", "gusht", "shtator", "tetor", "nëntor", "dhjetor"];
const DAYS = ["e diel", "e hënë", "e martë", "e mërkurë", "e enjte", "e premte", "e shtunë"];
const dayLabel = (date) => {
  const d = new Date(`${date}T12:00`);
  const near = { [today()]: "Sot", [addDays(today(), 1)]: "Nesër", [addDays(today(), -1)]: "Dje" }[date];
  return `${near ? `${near}, ` : ""}${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
const blank = (date, slots) => ({ name: "", phone: "", guests: "2", table: "", date, start: slots[0]?.start || "", end: slots[0]?.end || null });

// Rezervimet: the day's bookings on the left, the booking form (and, for the manager, the
// venue's time slots) on the right.
export function Reservations({ state, update, role }) {
  const reservations = state.reservations || [];
  const slots = state.reservationSlots || [];
  const tables = state.tables.filter((t) => t.active);
  const [date, setDate] = useState(today);
  const [draft, setDraft] = useState(() => blank(today(), slots));
  const [saving, setSaving] = useState(false);
  const day = reservations.filter((r) => r.date === date);
  const set = (field) => (e) => setDraft((d) => ({ ...d, [field]: e.target.value }));
  // A slot added or removed in the meantime: the draft keeps to a time that can still be saved.
  const slotKey = JSON.stringify(slots);
  useEffect(() => {
    setDraft((d) => (d.id ? d : slots.length ? (slots.some((x) => x.start === d.start && x.end === d.end) ? d : { ...d, start: slots[0].start, end: slots[0].end }) : { ...d, end: null }));
  }, [slotKey]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = { ...draft, name: draft.name.trim(), guests: Number(draft.guests), table: draft.table === "" ? null : Number(draft.table) };
    if (!draft.id) delete payload.id;
    const ok = await update("reservation.save", payload, draft.id ? "Rezervimi u ndryshua." : `Rezervimi për ${payload.name} u ruajt.`);
    setSaving(false);
    if (ok) {
      setDate(draft.date);
      setDraft(blank(draft.date, slots));
    }
  };
  const form = useRef(null);
  const edit = (r) => {
    setDraft({ id: r.id, name: r.name, phone: r.phone, guests: String(r.guests), table: r.table == null ? "" : String(r.table), date: r.date, start: r.start, end: r.end });
    // On a phone the form sits under the list.
    form.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  return (
    <div className="management-layout">
      <section className="panel">
        <SectionHeading
          title={dayLabel(date)}
          description={day.length ? `${plural(day.length, "rezervim", "rezervime")} · ${plural(day.reduce((n, r) => n + r.guests, 0), "person", "persona")}` : "Asnjë rezervim për këtë ditë"}
        />
        <div className="toolbar reservation-days">
          <div className="reservation-day-picker">
            <button type="button" className="icon-button" aria-label="Dita e mëparshme" onClick={() => setDate(addDays(date, -1))}>
              <Icon name="back" size={18} />
            </button>
            <input type="date" aria-label="Data" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
            <button type="button" className="icon-button" aria-label="Dita tjetër" onClick={() => setDate(addDays(date, 1))}>
              <Icon name="arrow" size={18} />
            </button>
          </div>
          {date !== today() && <button type="button" onClick={() => setDate(today())}>Sot</button>}
        </div>
        {day.length ? (
          <ul className="reservation-list">
            {day.map((r) => {
              const table = r.table == null ? null : state.tables.find((t) => t.id === r.table);
              return (
                <li key={r.id} className={`reservation-row ${draft.id === r.id ? "editing" : ""}`}>
                  <span className="reservation-time">{reservationTime(r)}</span>
                  <div className="reservation-who">
                    <strong>{r.name}</strong>
                    <a href={`tel:${r.phone.replace(/[^+\d]/g, "")}`}>{r.phone}</a>
                  </div>
                  <span className="reservation-guests"><Icon name="people" size={16} /> {plural(r.guests, "person", "persona")}</span>
                  {table ? (
                    <span className="badge">{tableName(table)}</span>
                  ) : (
                    <span className="badge amber">Pa tavolinë</span>
                  )}
                  <div className="reservation-actions">
                    <button type="button" onClick={() => edit(r)}>Ndrysho</button>
                    <button
                      type="button"
                      onClick={() => confirm(`Të anulohet rezervimi i ${r.name} (${reservationTime(r)})?`) && update("reservation.delete", { id: r.id }, "Rezervimi u anulua.").then((ok) => ok && draft.id === r.id && setDraft(blank(date, slots)))}
                    >
                      Anulo
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty icon="calendar" title="Asnjë rezervim">
            Rezervimet e reja shfaqen këtu, të renditura sipas orës.
          </Empty>
        )}
      </section>
      <aside className="management-aside">
        <section className="panel" ref={form}>
          <SectionHeading
            title={draft.id ? "Ndrysho rezervimin" : "Rezervim i ri"}
            description={draft.id ? `${draft.name} · ${dayLabel(draft.date)}` : "Klienti, sa veta vijnë, kur dhe ku ulen."}
          />
          <form className="stack-form" onSubmit={save}>
            <Field label="Emri i klientit" value={draft.name} onChange={set("name")} placeholder="p.sh. Arta Hoxha" maxLength={80} required autoComplete="off" />
            <Field label="Numri i telefonit" type="tel" value={draft.phone} onChange={set("phone")} placeholder="p.sh. 069 123 4567" required autoComplete="off" />
            <div className="reservation-pair">
              <Field label="Persona" type="number" inputMode="numeric" min={1} max={500} value={draft.guests} onChange={set("guests")} required />
              <Field label="Data" type="date" value={draft.date} min={draft.id ? undefined : today()} onChange={set("date")} required />
            </div>
            {slots.length ? (
              <Field label="Fasha orare">
                <select
                  value={`${draft.start}|${draft.end}`}
                  onChange={(e) => {
                    const [start, end] = e.target.value.split("|");
                    setDraft((d) => ({ ...d, start, end: end === "null" ? null : end }));
                  }}
                >
                  {/* A booking from before the slots changed keeps its own time until another is picked. */}
                  {!slots.some((x) => x.start === draft.start && x.end === draft.end) && (
                    <option value={`${draft.start}|${draft.end}`}>{reservationTime(draft)} (ora e tanishme)</option>
                  )}
                  {slots.map((x) => <option key={x.start} value={`${x.start}|${x.end}`}>{reservationTime(x)}</option>)}
                </select>
              </Field>
            ) : (
              <Field label="Ora e fillimit" type="time" step={900} value={draft.start} onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value, end: null }))} required />
            )}
            <Field label="Tavolina">
              <select value={draft.table} onChange={set("table")}>
                <option value="">Pa tavolinë (caktohet më vonë)</option>
                {tables.map((t) => {
                  const clash = draft.start && reservationClash(reservations, { ...draft, table: t.id });
                  const small = t.seats && Number(draft.guests) > t.seats;
                  return (
                    <option key={t.id} value={t.id} disabled={Boolean(clash)}>
                      {tableName(t)}{t.seats ? ` · ${t.seats} vende` : ""}{clash ? ` · e zënë (${clash.name}, ${reservationTime(clash)})` : small ? " · pak vende" : ""}
                    </option>
                  );
                })}
              </select>
            </Field>
            <div className="reservation-form-actions">
              {draft.id && <button type="button" onClick={() => setDraft(blank(date, slots))}>Anulo ndryshimin</button>}
              <button className="primary" disabled={saving}>
                <Icon name={draft.id ? "check" : "plus"} size={17} />
                {saving ? "Po ruhet…" : draft.id ? "Ruaj ndryshimet" : "Shto rezervimin"}
              </button>
            </div>
          </form>
        </section>
        {role === "Menaxher" && <SlotSettings slots={slots} update={update} />}
      </aside>
    </div>
  );
}

// The venue's time slots ("12:00–14:00", "19:00–21:00"). None: a booking takes just a start time.
function SlotSettings({ slots, update }) {
  const [list, setList] = useState(slots);
  const [saving, setSaving] = useState(false);
  const slotKey = JSON.stringify(slots);
  useEffect(() => setList(slots), [slotKey]);
  const changed = JSON.stringify(list) !== slotKey;
  const set = (i, field) => (e) => setList((l) => l.map((x, j) => (j === i ? { ...x, [field]: e.target.value } : x)));
  return (
    <section className="panel">
      <SectionHeading
        title="Fashat orare"
        description={list.length ? "Rezervimi zgjedh një nga këto fasha." : "Pa fasha: rezervimi merr vetëm orën e fillimit."}
      />
      <form
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          await update("reservation.slots", { slots: list }, list.length ? "Fashat orare u ruajtën." : "Fashat orare u hoqën.");
          setSaving(false);
        }}
      >
        {list.length > 0 && (
          <ul className="slot-list">
            {list.map((x, i) => (
              <li key={i}>
                <input type="time" step={900} aria-label={`Fillimi i fashës ${i + 1}`} value={x.start} onChange={set(i, "start")} required />
                <span aria-hidden="true">–</span>
                <input type="time" step={900} aria-label={`Mbarimi i fashës ${i + 1}`} value={x.end} onChange={set(i, "end")} required />
                <button type="button" className="icon-button" aria-label={`Hiq fashën ${i + 1}`} onClick={() => setList((l) => l.filter((_, j) => j !== i))}>
                  <Icon name="close" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="reservation-form-actions">
          <button type="button" onClick={() => setList((l) => [...l, l.length ? { start: l.at(-1).end, end: "" } : { start: "12:00", end: "14:00" }])}>
            <Icon name="plus" size={16} /> Shto fashë
          </button>
          <button className="primary" disabled={!changed || saving}>{saving ? "Po ruhen…" : "Ruaj fashat"}</button>
        </div>
      </form>
    </section>
  );
}
