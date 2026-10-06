import React, { useEffect, useMemo, useState } from "react";
import { money } from "./domain.js";
import { fetchReport } from "./api.js";
import { ChoiceField } from "./ChoiceField.jsx";
import { Empty, Icon } from "./components.jsx";

const PERIODS = [
  { value: "today", label: "Sot" },
  { value: "yesterday", label: "Dje" },
  { value: "week", label: "Kjo javë" },
  { value: "month", label: "Ky muaj" },
  { value: "range", label: "Interval" },
];
const BASES = [
  { value: "day", label: "Data e faturës" },
  { value: "shift", label: "Dita e turnit" },
];
const DAY_LABELS = ["Die", "Hën", "Mar", "Mër", "Enj", "Pre", "Sht"];
// Sales are invoice totals; collections are how they were paid (a bill can be part
// cash, part card).
const sum = (list, key = "total") => list.reduce((s, i) => s + (i[key] || 0), 0);
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dateInput = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromInput = (v) => {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const short = (d) => `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
const time = (v) => new Date(v).toLocaleTimeString("sq-AL", { hour: "2-digit", minute: "2-digit", hour12: false });
const minutes = (s) => (s == null ? "—" : s < 60 ? `${s} sek` : `${Math.round(s / 60)} min`);
const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

// Local calendar days: [from, to) for the chosen period.
function periodRange(period, range) {
  const today = startOfDay(new Date());
  if (period === "today") return [today, addDays(today, 1)];
  if (period === "yesterday") return [addDays(today, -1), today];
  if (period === "week") {
    const monday = addDays(today, -((today.getDay() + 6) % 7));
    return [monday, addDays(monday, 7)];
  }
  if (period === "month") return [new Date(today.getFullYear(), today.getMonth(), 1), new Date(today.getFullYear(), today.getMonth() + 1, 1)];
  const from = fromInput(range.from);
  const to = fromInput(range.to);
  return from <= to ? [from, addDays(to, 1)] : [to, addDays(from, 1)];
}

function csvCell(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}
function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// bank: the part of each bar that went to the bank, drawn on top.
function BarChart({ title, bars }) {
  const max = Math.max(1, ...bars.map((b) => b.total));
  return (
    <section className="panel report-chart">
      <h2>{title}</h2>
      <div className="report-legend" aria-hidden="true">
        <span><i className="cash" /> Cash</span>
        <span><i className="bank" /> Bankë</span>
      </div>
      <div className="report-chart-bars">
        {bars.map((b) => (
          <div className="report-bar-col" key={b.key}>
            {bars.length <= 12 && <span className="report-bar-value">{b.total ? money(b.total) : ""}</span>}
            <div className="report-bar-track">
              <div
                className="report-bar-fill"
                style={{ height: `${(b.total / max) * 100}%` }}
                title={`${b.label}: ${money(b.total)} · cash ${money(b.total - b.bank)} · bankë ${money(b.bank)}`}
              >
                {b.bank > 0 && <div className="report-bar-bank" style={{ height: `${(b.bank / b.total) * 100}%` }} />}
              </div>
            </div>
            <span className="report-bar-label">{b.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Rows({ rows }) {
  return (
    <div className="report-summary-list">
      {rows.map(([label, value, note]) => (
        <div key={label}>
          <span>
            {label}
            {note && <small>{note}</small>}
          </span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

export function Reports({ state }) {
  const [period, setPeriod] = useState("today");
  const [range, setRange] = useState(() => {
    const today = startOfDay(new Date());
    return { from: dateInput(addDays(today, -6)), to: dateInput(today) };
  });
  const [basis, setBasis] = useState("day");
  const [filters, setFilters] = useState({ pos: "", shift: "", area: "", waiter: "" });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [from, to] = useMemo(() => periodRange(period, range), [period, range]);
  const days = Math.round((to - from) / 86400_000);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchReport({ from: from.toISOString(), to: to.toISOString(), basis, ...filters })
      .then((d) => alive && (setData(d), setError("")))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [from.getTime(), to.getTime(), basis, filters]);

  const tills = state.pointsOfSale;
  const tillName = (id) => tills.find((k) => k.id === id)?.name || "";
  const waiterName = (id) => state.waiters.find((w) => w.id === id)?.name || "Ish-kamarier";
  const zones = [...new Set(state.tables.map((t) => t.area))].sort((a, b) => a.localeCompare(b, "sq"));
  const shiftOptions = [...state.openShifts, ...state.shifts]
    .filter((s) => !filters.pos || s.posId === Number(filters.pos))
    .sort((a, b) => b.id - a.id)
    .slice(0, 60)
    .map((s) => ({
      value: String(s.id),
      label: `#${s.id}${tills.length > 1 ? ` · ${tillName(s.posId)}` : ""} · ${short(new Date(s.opened))} ${time(s.opened)}${s.closed ? "" : " (hapur)"}`,
    }));
  const setFilter = (key) => (value) => setFilters((f) => ({ ...f, [key]: value, ...(key === "pos" && { shift: "" }) }));

  const invoices = data?.invoices || [];
  const total = sum(invoices);
  const bank = sum(invoices, "card");
  const cash = sum(invoices, "cash");
  // One day: by hour (only the hours with sales, plus their neighbours); longer: by day.
  const bars = useMemo(() => {
    if (days <= 1) {
      const hours = invoices.map((i) => new Date(i.date).getHours());
      const lo = hours.length ? Math.max(0, Math.min(...hours) - 1) : 8;
      const hi = hours.length ? Math.min(23, Math.max(...hours) + 1) : 23;
      return Array.from({ length: hi - lo + 1 }, (_, n) => {
        const h = lo + n;
        const list = invoices.filter((i) => new Date(i.date).getHours() === h);
        return { key: h, label: `${String(h).padStart(2, "0")}`, total: sum(list), bank: sum(list, "card") };
      });
    }
    return Array.from({ length: days }, (_, n) => {
      const day = addDays(from, n);
      const list = invoices.filter((i) => startOfDay(new Date(i.date)).getTime() === day.getTime());
      return { key: n, label: days <= 7 ? DAY_LABELS[day.getDay()] : short(day), total: sum(list), bank: sum(list, "card") };
    });
  }, [invoices, days, from]);
  const group = (keyOf, nameOf) =>
    [...invoices.reduce((m, i) => m.set(keyOf(i), [...(m.get(keyOf(i)) || []), i]), new Map())]
      .map(([key, list]) => ({ key, name: nameOf(key), count: list.length, total: sum(list), bank: sum(list, "card") }))
      .sort((a, b) => b.total - a.total);
  const byWaiter = group((i) => i.waiter, waiterName);
  const byTill = group((i) => i.posId, tillName);
  const byArea = group((i) => i.area, (a) => a);
  const maxWaiter = Math.max(1, ...byWaiter.map((w) => w.total));

  const shifts = data?.shifts || [];
  const drawer = shifts.reduce(
    (d, s) => ({
      opening: d.opening + s.opening,
      cash: d.cash + s.cash,
      cashIn: d.cashIn + s.cashIn,
      refundsCash: d.refundsCash + s.refundsCash,
      cashOut: d.cashOut + s.cashOut,
      expected: d.expected + s.expected,
      counted: d.counted + (s.closed ? s.counted : 0),
      difference: d.difference + (s.closed ? s.difference : 0),
      closed: d.closed + (s.closed ? 1 : 0),
    }),
    { opening: 0, cash: 0, cashIn: 0, cashOut: 0, refundsCash: 0, expected: 0, counted: 0, difference: 0, closed: 0 },
  );
  const corrections = data?.corrections || [];
  const cancels = corrections.filter((c) => c.kind === "cancel");
  const voids = corrections.filter((c) => c.kind === "void");
  const worth = (list) => list.reduce((s, c) => s + c.amount, 0);
  const losses = data?.losses || [];

  const exportCsv = () => {
    const rows = [["Fatura", "Data", "Kasa", "Zona", "Tavolina", "Kamarieri", "Turni", "Mënyra", "Totali (Lek)", "Cash", "Bankë", "Ulje", "Qerasje"]];
    for (const i of invoices)
      rows.push([
        `D-${i.id}`, new Date(i.date).toLocaleString("sq-AL"), tillName(i.posId), i.area, i.table,
        waiterName(i.waiter), i.shiftId, i.method, i.total, i.cash, i.card, i.discount, i.comps,
      ]);
    downloadCsv(`raporti-${dateInput(from)}-${dateInput(addDays(to, -1))}.csv`, rows);
  };

  return (
    <div className="reports-page">
      <section className="panel report-filters-panel">
        <div className="report-top">
          <div className="tabs report-periods" aria-label="Periudha">
            {PERIODS.map((p) => (
              <button key={p.value} aria-pressed={period === p.value} onClick={() => setPeriod(p.value)}>
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={exportCsv} disabled={!invoices.length}>
            <Icon name="print" size={16} />
            Eksporto CSV
          </button>
        </div>
        {period === "range" && (
          <div className="report-range">
            <label>
              Nga
              <input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))} />
            </label>
            <label>
              Deri
              <input type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} />
            </label>
          </div>
        )}
        <div className="report-filters">
          <ChoiceField compact label="Llogarit" options={BASES} value={basis} onChange={setBasis} />
          {tills.length > 1 && (
            <ChoiceField
              compact
              label="Kasa"
              options={[{ value: "", label: "Të gjitha" }, ...tills.map((k) => ({ value: String(k.id), label: k.name }))]}
              value={filters.pos}
              onChange={setFilter("pos")}
            />
          )}
          <ChoiceField compact label="Turni" options={[{ value: "", label: "Të gjithë" }, ...shiftOptions]} value={filters.shift} onChange={setFilter("shift")} />
          <ChoiceField
            compact
            label="Zona"
            options={[{ value: "", label: "Të gjitha" }, ...zones.map((z) => ({ value: z, label: z }))]}
            value={filters.area}
            onChange={setFilter("area")}
          />
          <ChoiceField
            compact
            label="Kamarieri"
            options={[{ value: "", label: "Të gjithë" }, ...state.waiters.map((w) => ({ value: String(w.id), label: w.name }))]}
            value={filters.waiter}
            onChange={setFilter("waiter")}
          />
        </div>
        <p className="helper">
          {short(from)}–{short(addDays(to, -1))}
          {basis === "shift"
            ? " · Turni që kalon mesnatën numërohet te dita kur u hap."
            : " · Çdo faturë numërohet te dita kalendarike kur u pagua."}
          {loading && " · Po ngarkohet…"}
        </p>
      </section>

      {error ? (
        <div className="notice warning" role="alert">
          <Icon name="info" />
          <span>Raporti nuk u ngarkua: {error}</span>
        </div>
      ) : !data ? (
        <p className="helper">Po ngarkohet…</p>
      ) : (
        <>
          <div className="shift-kpis report-kpis">
            <div>
              <span>Shitjet</span>
              <strong>{money(total)}</strong>
              <small>
                {invoices.length} fatura · mesatarja {money(invoices.length ? Math.round(total / invoices.length) : 0)}
              </small>
            </div>
            <div>
              <span>Shitje cash</span>
              <strong>{money(cash)}</strong>
              <small>{percent(cash, total)}% e shitjeve · hyjnë në arkë</small>
            </div>
            <div className="report-kpi-bank">
              <span>Të ardhurat nga banka</span>
              <strong>{money(bank)}</strong>
              <small>Pagesat me kartë (POS) · {percent(bank, total)}%</small>
            </div>
            <div>
              <span>Cash i pritshëm në arkë</span>
              <strong>{money(drawer.expected)}</strong>
              <small>{shifts.length ? `${shifts.length} turne · me fondin, hyrjet dhe daljet` : "Asnjë turn në këtë periudhë"}</small>
            </div>
          </div>

          {invoices.length ? (
            <div className="report-grid-2">
              <BarChart title={days <= 1 ? "Shitjet sipas orës" : "Shitjet sipas ditës"} bars={bars} />
              <section className="panel">
                <h2>Produktet më të shitura</h2>
                <ol className="report-rank-list">
                  {data.topProducts.map((p) => (
                    <li key={p.name}>
                      <span>{p.name}</span>
                      <small>{money(p.total)}</small>
                      <strong>{p.qty}</strong>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          ) : (
            <section className="panel report-empty">
              <Empty icon="chart" title="Asnjë shitje në këtë periudhë">
                Zgjidhni një periudhë tjetër ose hiqni filtrat.
              </Empty>
            </section>
          )}

          <div className="report-grid-3">
            <section className="panel">
              <h2>Gjendja e arkës</h2>
              <Rows
                rows={[
                  ["Fondi fillestar", money(drawer.opening)],
                  ["+ Arkëtime cash", money(drawer.cash), "e gjithë turnit, pa filtrat e zonës/kamarierit"],
                  ["+ Hyrje në arkë", money(drawer.cashIn)],
                  ["− Dalje nga arka", money(drawer.cashOut)],
                  ["− Rimbursime cash", money(drawer.refundsCash)],
                  ["= Cash i pritshëm", money(drawer.expected)],
                  ...(drawer.closed
                    ? [
                        ["E numëruar", money(drawer.counted), `${drawer.closed} turne të mbyllura`],
                        ["Diferenca e arkës", `${drawer.difference > 0 ? "+" : ""}${money(drawer.difference)}`],
                      ]
                    : []),
                ]}
              />
              {shifts.length > 0 && (
                <ul className="report-shifts">
                  {shifts.map((s) => (
                    <li key={s.id}>
                      <span>
                        #{s.id}
                        {tills.length > 1 ? ` · ${s.posName}` : ""} · {short(new Date(s.opened))} {time(s.opened)}
                        {s.closed ? `–${time(s.closed)}` : " · hapur"}
                      </span>
                      <b>
                        {s.closed
                          ? s.difference === 0
                            ? "pa diferencë"
                            : `diferenca ${s.difference > 0 ? "+" : ""}${money(s.difference)}`
                          : `pritet ${money(s.expected)}`}
                      </b>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="panel">
              <h2>Anulime dhe humbje</h2>
              <Rows
                rows={[
                  ["Porosi të anuluara", `${cancels.length} · ${money(worth(cancels))}`],
                  ["Artikuj të anuluar pas dërgimit", `${voids.length} · ${money(worth(voids))}`],
                  ["Humbje stoku", `${losses.length} · ${losses.reduce((s, m) => s - m.qty, 0)} copë`],
                  ["Ulje", `${invoices.filter((i) => i.discount).length} · ${money(sum(invoices, "discount"))}`],
                  ["Qerasje", `${invoices.filter((i) => i.comps).length} · ${money(sum(invoices, "comps"))}`],
                  ["Rimbursime", `${(data.refunds || []).length} · ${money(sum(data.refunds || [], "amount"))}`],
                ]}
              />
              {corrections.length > 0 && (
                <details className="report-details">
                  <summary>Shiko anulimet</summary>
                  <ul className="order-history">
                    {corrections.slice(-30).reverse().map((c, n) => (
                      <li key={n} className="warn">
                        <time>{time(c.date)}</time>
                        <div>
                          Tav. {String(c.table).padStart(2, "0")} · {c.detail}
                          {c.actor && <small>{c.actor}</small>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
            <section className="panel">
              <h2>Koha e shërbimit</h2>
              <Rows
                rows={[
                  ["Porosia, nga artikulli i parë te pagesa", minutes(data.service.orderSeconds), `${data.service.orders} porosi`],
                  ...data.service.prep.map((p) => [`Përgatitja · ${p.place}`, minutes(p.seconds), `${p.tickets} fletë, nga dërgimi te "Gati"`]),
                ]}
              />
              {!data.service.prep.length && <p className="helper">Koha e përgatitjes matet kur reparti shtyp "Gati".</p>}
            </section>
          </div>

          <div className="report-grid-3">
            <section className="panel">
              <h2>Kamarierët</h2>
              {byWaiter.length ? (
                <div className="report-bar-list">
                  {byWaiter.map((w) => (
                    <div className="report-bar-row" key={w.key}>
                      <div className="report-bar-row-head">
                        <span>
                          {w.name}
                        </span>
                        <strong>{money(w.total)}</strong>
                      </div>
                      <div className="report-bar-row-track">
                        <div className="report-bar-row-fill" style={{ width: `${(w.total / maxWaiter) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="helper">Asnjë shitje.</p>
              )}
            </section>
            <section className="panel">
              <h2>Sipas zonës</h2>
              {byArea.length ? (
                <Rows rows={byArea.map((a) => [a.name, money(a.total), `${a.count} fatura · bankë ${money(a.bank)}`])} />
              ) : (
                <p className="helper">Asnjë shitje.</p>
              )}
            </section>
            <section className="panel">
              <h2>{tills.length > 1 ? "Sipas kasës" : "Fitimi"}</h2>
              {tills.length > 1 && <Rows rows={byTill.map((k) => [k.name, money(k.total), `cash ${money(k.total - k.bank)} · bankë ${money(k.bank)}`])} />}
              <p className="panel-footnote">
                <Icon name="info" size={14} />
                BlueBar nuk njeh ende koston e mallit dhe pagat, prandaj nuk llogarit fitim.
              </p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
