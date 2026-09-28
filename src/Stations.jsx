import React, { useEffect, useRef, useState } from "react";
import { venueSlug } from "./api.js";
import { Badge, DepartmentTag, Empty, Icon, SectionHeading } from "./components.jsx";
import { NetworkPrinters } from "./NetworkPrinters.jsx";

// Which departments this device prints for is a property of the device (the bar's
// Mac has the bar printer), not of the business — so it lives in localStorage.
const deptsKey = `bluebar-station-departments:${venueSlug}`;
const printedKey = `bluebar-station-printed:${venueSlug}`;
const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch {
    return [];
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / blocked storage: auto-print just won't remember across reloads.
  }
};

// Runs on every page: a station device keeps printing its own new tickets (and a
// cancellation slip for any it already printed) even while someone uses the POS on it.
// networked: departments a LAN printer already covers — the print agent handles those,
// so this device must not print them a second time.
export function useStationPrinting(tickets, ready, print, networked = []) {
  const [departments, setDepartments] = useState(() => read(deptsKey));
  const printed = useRef(new Set(read(printedKey)));
  useEffect(() => {
    // Before the first real snapshot `tickets` is empty; pruning against it would
    // forget everything and reprint the whole queue once data arrives.
    if (!ready || !departments.length) return;
    const mine = tickets.filter((k) => departments.includes(k.department) && !networked.includes(k.department));
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
  }, [tickets, ready, departments, networked.join()]);
  const toggle = (department) => {
    const on = !departments.includes(department);
    // Switching a station on starts from now — it doesn't dump the existing queue.
    if (on) for (const k of tickets) if (k.department === department) printed.current.add(k.id);
    write(printedKey, [...printed.current]);
    const next = on ? [...departments, department] : departments.filter((d) => d !== department);
    write(deptsKey, next);
    setDepartments(next);
  };
  return [departments, toggle];
}

const minutesAgo = (iso) => Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));

export function Stations({ state, stationDepartments, onToggleStation, onPrint, onDone, time, isManager, update, notify }) {
  const networked = (d) => state.printers.some((p) => p.departments.includes(d));
  const departments = [...state.departments, "Tjetër"];
  const [tab, setTab] = useState(() =>
    stationDepartments.length === 1 ? stationDepartments[0] : "Të gjitha",
  );
  const waiterName = (id) => state.waiters.find((w) => w.id === id)?.name;
  const queue = state.tickets
    .filter((k) => !k.doneAt && (tab === "Të gjitha" || k.department === tab))
    .sort((a, b) => a.date.localeCompare(b.date));
  const count = (d) => state.tickets.filter((k) => !k.doneAt && k.department === d).length;

  return (
    <div className="management-layout">
      <section className="panel">
        <SectionHeading
          title="Fletët në pritje"
          description={`${queue.length} ${queue.length === 1 ? "fletë" : "fletë"} për t'u përgatitur`}
        />
        <div className="tabs" aria-label="Filtro repartin">
          {["Të gjitha", ...departments].map((d) => (
            <button key={d} aria-pressed={tab === d} onClick={() => setTab(d)}>
              {d}
              {d !== "Të gjitha" && count(d) > 0 && <span className="nav-count">{count(d)}</span>}
            </button>
          ))}
        </div>
        {queue.length ? (
          <div className="station-queue">
            {queue.map((k) => (
              <article className={`station-card ${k.cancelledAt ? "cancelled" : ""}`} key={k.id}>
                <header>
                  <DepartmentTag name={k.department} />
                  <strong>Tavolina {String(k.table).padStart(2, "0")}</strong>
                  <span>Raundi {k.round}</span>
                  {k.cancelledAt ? (
                    <Badge tone="red">Anuluar</Badge>
                  ) : k.invoice ? (
                    <Badge tone="green">Paguar</Badge>
                  ) : null}
                </header>
                <p className="station-meta">
                  {time(k.date)} · {minutesAgo(k.date)} min më parë
                  {waiterName(k.waiter) ? ` · ${waiterName(k.waiter)}` : ""}
                </p>
                <ul>
                  {k.lines.map((l) => (
                    <li key={l.id}>
                      <b>{l.qty} ×</b> {l.name}
                    </li>
                  ))}
                </ul>
                <div className="station-actions">
                  <button onClick={() => onPrint([k])} aria-label={`Printo fletën e tavolinës ${k.table}`}>
                    <Icon name="print" size={17} />
                    Printo
                  </button>
                  <button className={k.cancelledAt ? "" : "primary"} onClick={() => onDone(k)}>
                    <Icon name={k.cancelledAt ? "close" : "check"} size={17} />
                    {k.cancelledAt ? "Hiq" : "Gati"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty icon="coffee" title="Asnjë fletë në pritje">
            Kur një kamarier dërgon porosinë, fleta e secilit repart shfaqet këtu.
          </Empty>
        )}
      </section>
      <aside className="management-aside">
        {isManager && <NetworkPrinters state={state} update={update} notify={notify} />}
        <section className="panel">
          <SectionHeading
            title="Printeri i kësaj pajisjeje"
            description="Fletët e reja të repartëve të zgjedhur printohen automatikisht këtu."
          />
          <div className="station-devices">
            {departments.map((d) => (
              <label key={d} className="station-device">
                <input
                  type="checkbox"
                  disabled={networked(d)}
                  checked={!networked(d) && stationDepartments.includes(d)}
                  onChange={() => onToggleStation(d)}
                />
                <DepartmentTag name={d} />
                {networked(d) && <small>Printeri i rrjetit</small>}
              </label>
            ))}
          </div>
          <p className="helper">
            Zgjidhni vetëm repartet që e kanë printerin te kjo pajisje, p.sh. te kompjuteri i barit
            vetëm "Bar". Me një printer të vetëm për të gjithë lokalin, zgjidhni të gjitha. Për
            printim pa dritaren e printimit, hapni Chrome me <code>--kiosk-printing</code>.
          </p>
        </section>
      </aside>
    </div>
  );
}
