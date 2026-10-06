import React, { useEffect, useRef, useState } from "react";
import { reportStationsSeen, venueSlug } from "./api.js";
import { DepartmentTag, Empty, Icon, SectionHeading } from "./components.jsx";
import { ChoiceField } from "./ChoiceField.jsx";
import { COURSES, printerFor } from "./domain.js";

// What this device shows and prints is a property of the device (the bar's Mac has
// the bar printer), not of the business — so it lives in localStorage.
const deptsKey = `bluebar-station-departments:${venueSlug}`;
const printedKey = `bluebar-station-printed:${venueSlug}`;
// With several tills, the till this device stands at ("all": every till).
const tillKey = `bluebar-station-till:${venueSlug}`;
// With stations configured, the stations this device is (none: just a viewer).
const stationsKey = `bluebar-station-ids:${venueSlug}`;
const read = (key, fallback = []) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / blocked storage: auto-print just won't remember across reloads.
  }
};
const SEEN_EVERY = 60_000;

// Runs on every page: a station device keeps printing its own new tickets (and a
// cancellation slip for any it already printed) even while someone uses the POS on it.
// networked(ticket): a LAN printer already covers it — the print agent handles those,
// so this device must not print them a second time. tillOf(ticket): its till.
// With stations, a ticket is this device's when its station is one of this device's.
export function useStationPrinting(tickets, ready, print, networked, tillOf, useStations) {
  const [departments, setDepartments] = useState(() => read(deptsKey));
  const [till, setTillState] = useState(() => read(tillKey, "all"));
  const [stationIds, setStationIds] = useState(() => read(stationsKey));
  const printed = useRef(new Set(read(printedKey)));
  const isMine = (k) =>
    useStations
      ? stationIds.includes(k.station)
      : departments.includes(k.department) && (till === "all" || tillOf(k) === till);
  useEffect(() => {
    // Before the first real snapshot `tickets` is empty; pruning against it would
    // forget everything and reprint the whole queue once data arrives.
    if (!ready || !(useStations ? stationIds.length : departments.length)) return;
    const mine = tickets.filter((k) => isMine(k) && !networked(k));
    const fresh = mine.filter(
      (k) =>
        (!k.doneAt && !k.cancelledAt && !printed.current.has(k.id)) ||
        (k.cancelledAt && printed.current.has(k.id) && !printed.current.has(`x:${k.id}`)),
    );
    for (const k of fresh) printed.current.add(k.cancelledAt ? `x:${k.id}` : k.id);
    const live = new Set(tickets.map((k) => k.id));
    printed.current = new Set([...printed.current].filter((id) => live.has(id.replace(/^x:/, ""))));
    write(printedKey, [...printed.current]);
    if (fresh.length) print(fresh);
  }, [tickets, ready, departments, till, stationIds, useStations]);
  // While open, this device tells the server it is the working screen for its stations.
  useEffect(() => {
    if (!useStations || !stationIds.length) return;
    const ping = () => reportStationsSeen(stationIds).catch(() => {});
    ping();
    const timer = setInterval(ping, SEEN_EVERY);
    return () => clearInterval(timer);
  }, [useStations, stationIds.join()]);
  // Taking on a department, till or station starts from now: the existing queue isn't dumped.
  const skipQueue = (matches) => {
    for (const k of tickets) if (matches(k)) printed.current.add(k.id);
    write(printedKey, [...printed.current]);
  };
  const toggle = (department) => {
    const on = !departments.includes(department);
    if (on) skipQueue((k) => k.department === department);
    const next = on ? [...departments, department] : departments.filter((d) => d !== department);
    write(deptsKey, next);
    setDepartments(next);
  };
  const setTill = (next) => {
    skipQueue(() => true);
    write(tillKey, next);
    setTillState(next);
  };
  const toggleStationId = (id) => {
    const on = !stationIds.includes(id);
    if (on) skipQueue((k) => k.station === id);
    const next = on ? [...stationIds, id] : stationIds.filter((x) => x !== id);
    write(stationsKey, next);
    setStationIds(next);
  };
  return { departments, toggle, till, setTill, stationIds, toggleStationId };
}

const ago = (iso) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} orë`;
  const days = Math.floor(minutes / (24 * 60));
  return `${days} ditë`;
};
// On screen until the station marks it done — paying the table doesn't take work away.
// A cancelled order's tickets leave at once (their slip says "ANULUAR").
const open = (k) => !k.doneAt && !k.cancelledAt;

export function Stations({ state, device, update, onPrint, time, tillOf }) {
  const stations = state.stations || [];
  const useStations = stations.length > 0;
  const stationOf = (id) => stations.find((x) => x.id === id);
  const tills = state.pointsOfSale.length > 1 ? state.pointsOfSale : [];
  const here = tills.some((k) => k.id === device.till) ? device.till : "all";
  // Without stations: a department this device needn't print — a LAN printer covers it
  // for every till it shows.
  const networked = (d) =>
    (here === "all" ? state.pointsOfSale : [{ id: here }]).every((k) => printerFor(state.printers, k.id, d));
  const departments = [...state.departments, "Tjetër"];
  // With stations, this device shows its own stations' tickets (and those offered to
  // them); a device that picked none sees everything, like a manager's overview.
  const mine = device.stationIds.filter((id) => stationOf(id));
  const tickets = useStations
    ? state.tickets.filter((k) => !mine.length || mine.includes(k.station) || mine.includes(k.transferTo))
    : state.tickets.filter((k) => here === "all" || tillOf(k) === here);
  const tabs = useStations
    ? [...new Set(tickets.map((k) => k.station))].map((id) => ({ key: id, label: stationOf(id)?.name || "Pa stacion" }))
    : departments.map((d) => ({ key: d, label: d }));
  const keyOf = (k) => (useStations ? k.station : k.department);
  const [tab, setTab] = useState(() =>
    !useStations && device.departments.length === 1 ? device.departments[0] : "all",
  );
  const [moving, setMoving] = useState(null);
  const current = tab === "all" || tabs.some((t) => t.key === tab) ? tab : "all";
  const waiterName = (id) => state.waiters.find((w) => w.id === id)?.name;
  const queue = tickets
    .filter((k) => open(k) && (current === "all" || keyOf(k) === current || k.transferTo === current))
    .sort((a, b) => a.date.localeCompare(b.date));
  const count = (key) => tickets.filter((k) => open(k) && keyOf(k) === key).length;
  const done = (k) => update("ticket.done", { id: k.id }, k.void ? "Anulimi u pa." : `Tavolina ${k.table}: gati.`);

  return (
    <div className="management-layout">
      <section className="panel">
        <SectionHeading
          title="Fletët në pritje"
          description={`${queue.length} fletë për t'u përgatitur · largohen kur shtypni "Gati"`}
        />
        <div className="tabs" aria-label={useStations ? "Filtro stacionin" : "Filtro repartin"}>
          {[{ key: "all", label: "Të gjitha" }, ...tabs].map((t) => (
            <button key={t.key} aria-pressed={current === t.key} onClick={() => setTab(t.key)}>
              {t.label}
              {t.key !== "all" && count(t.key) > 0 && <span className="nav-count">{count(t.key)}</span>}
            </button>
          ))}
        </div>
        {queue.length ? (
          <div className="station-queue">
            {queue.map((k) => {
              const at = stationOf(k.station);
              const to = stationOf(k.transferTo);
              // Accepting is for the receiving station's device (or a viewer of everything).
              const canAccept = to && (!mine.length || mine.includes(to.id));
              return (
                <article className={`station-card ${k.void ? "void" : ""} ${to ? "moving" : ""}`} key={k.id}>
                  {k.void && <p className="station-void">ANULIM · hiqeni nga porosia{k.note ? ` · ${k.note}` : ""}</p>}
                  {k.kind === "correction" && <p className="station-void">KORRIGJIM{k.note ? ` · ${k.note}` : ""}</p>}
                  {k.kind === "remake" && <p className="station-void">RIPËRGATIT{k.note ? ` · ${k.note}` : ""}</p>}
                  {k.allergy && <p className="allergy-mark">ALERGJI: {k.allergy}</p>}
                  {to && (
                    <p className="station-transfer">
                      {canAccept && mine.includes(to.id) ? `Transferim nga ${at?.name || k.department}` : `Në transferim te ${to.name}`}
                      {k.transferBy ? ` · ${k.transferBy}` : ""}
                    </p>
                  )}
                  <header>
                    <DepartmentTag name={k.department} />
                    {useStations
                      ? at && <small className="station-till">{at.name}{!at.active ? " (joaktiv)" : ""}</small>
                      : tills.length > 0 && here === "all" && (
                          <small className="station-till">{tills.find((t) => t.id === tillOf(k))?.name}</small>
                        )}
                    <strong>Tavolina {String(k.table).padStart(2, "0")}</strong>
                    <span>Raundi {k.round}</span>
                  </header>
                  <p className="station-meta">
                    {time(k.date)} · {ago(k.date)} më parë
                    {waiterName(k.waiter) ? ` · ${waiterName(k.waiter)}` : ""}
                    {k.invoice && <span className="station-paid">Paguar</span>}
                  </p>
                  {k.note && (!k.kind || k.kind === "order") && <p className="station-meta">Shënim: {k.note}</p>}
                  <ul>
                    {k.lines.map((l) => (
                      <li key={l.key || l.id}>
                        {k.void ? <s><b>{l.qty} ×</b> {l.name}</s> : <><b>{l.qty} ×</b> {l.name}</>}
                        {l.course > 0 && <span className="course-mark">{COURSES[l.course]}</span>}
                        {(l.extras?.length > 0 || l.note || l.allergy) && (
                          <span className="line-details">
                            {l.allergy && <b className="allergy-mark">ALERGJI: {l.allergy}</b>}
                            {l.extras?.map((x) => <span key={x}>+ {x}</span>)}
                            {l.note && <em>{l.note}</em>}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {moving === k.id && (
                    <ChoiceField
                      label="Transfero te"
                      value=""
                      options={[
                        { value: "", label: "Zgjidhni stacionin" },
                        ...stations
                          .filter((x) => x.active && x.id !== k.station)
                          .map((x) => ({ value: String(x.id), label: x.name })),
                      ]}
                      onChange={(v) => {
                        setMoving(null);
                        if (v) update("ticket.transfer", { id: k.id, stationId: Number(v) }, "Fleta pret pranimin.");
                      }}
                    />
                  )}
                  <div className="station-actions">
                    {to ? (
                      canAccept ? (
                        <button className="primary" onClick={() => update("ticket.accept", { id: k.id }, `${to.name} e mori fletën.`)}>
                          <Icon name="check" size={17} />
                          Prano
                        </button>
                      ) : (
                        <button disabled>Pret pranimin</button>
                      )
                    ) : (
                      <button className="primary" onClick={() => done(k)}>
                        <Icon name="check" size={17} />
                        {k.void ? "E pashë" : "Gati"}
                      </button>
                    )}
                    {to ? (
                      <button onClick={() => update("ticket.transfer", { id: k.id, stationId: k.station }, "Transferimi u anulua.")}>
                        Anulo transferimin
                      </button>
                    ) : useStations && k.station && !k.void ? (
                      <button onClick={() => setMoving(moving === k.id ? null : k.id)}>Transfero</button>
                    ) : (
                      <button onClick={() => onPrint([k])} aria-label={`Printo sërish fletën e tavolinës ${k.table}`}>
                        <Icon name="print" size={17} />
                        Printo sërish
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty icon="coffee" title="Asnjë fletë në pritje">
            Kur një kamarier dërgon porosinë, fleta e secilit repart shfaqet këtu.
          </Empty>
        )}
      </section>
      <aside className="management-aside">
        {useStations ? (
          <section className="panel">
            <SectionHeading
              title="Stacionet e kësaj pajisjeje"
              description="Zgjidhni stacionin ku ndodhet kjo pajisje."
            />
            <div className="station-devices">
              {stations.map((x) => {
                const printer = state.printers.find((p) => p.id === x.printerId);
                return (
                  <label key={x.id} className="station-device">
                    <input type="checkbox" checked={mine.includes(x.id)} onChange={() => device.toggleStationId(x.id)} />
                    <span>
                      <strong>{x.name}</strong>
                      {!x.active && <small> · joaktiv</small>}
                    </span>
                    <small>{printer ? `Printer: ${printer.name}` : "Printon këtu"}</small>
                  </label>
                );
              })}
            </div>
            <p className="helper">Pa zgjedhje, kjo pajisje sheh të gjitha fletët, por nuk printon.</p>
          </section>
        ) : (
          <section className="panel">
            <SectionHeading
              title="Printeri i kësaj pajisjeje"
              description="Fletët e reja të repartëve të zgjedhur printohen automatikisht këtu."
            />
            {tills.length > 0 && (
              <ChoiceField
                label="Kasa e kësaj pajisjeje"
                value={String(here)}
                options={[
                  { value: "all", label: "Të gjitha kasat" },
                  ...tills.map((k) => ({ value: String(k.id), label: k.name })),
                ]}
                onChange={(v) => device.setTill(v === "all" ? "all" : Number(v))}
              />
            )}
            <div className="station-devices">
              {departments.map((d) => (
                <label key={d} className="station-device">
                  <input
                    type="checkbox"
                    disabled={networked(d)}
                    checked={!networked(d) && device.departments.includes(d)}
                    onChange={() => device.toggle(d)}
                  />
                  <DepartmentTag name={d} />
                  {networked(d) && <small>Printeri i rrjetit</small>}
                </label>
              ))}
            </div>
            <p className="helper">Zgjidhni repartet që printojnë te kjo pajisje, p.sh. te kompjuteri i barit vetëm "Bar".</p>
          </section>
        )}
      </aside>
    </div>
  );
}
