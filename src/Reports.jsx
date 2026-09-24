import React, { useMemo, useState } from "react";
import { money } from "./domain.js";
import { ChoiceField } from "./ChoiceField.jsx";
import { Icon } from "./components.jsx";

const DAY_LABELS = ["Hën", "Mar", "Mër", "Enj", "Pre", "Sht", "Die"];
const PERIODS = [
  { value: "this", label: "Këtë javë" },
  { value: "last", label: "Java e kaluar" },
];

function startOfWeek(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
}
const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

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

function BarChart({ title, values, formatValue, highlight }) {
  const max = Math.max(1, ...values);
  return (
    <section className="panel report-chart">
      <h2>{title}</h2>
      <div className="report-chart-bars">
        {values.map((v, i) => (
          <div className="report-bar-col" key={i}>
            <span className={`report-bar-value ${i === highlight ? "current" : ""}`}>{formatValue(v)}</span>
            <div className="report-bar-track">
              <div
                className={`report-bar-fill ${i === highlight ? "current" : ""}`}
                style={{ height: `${(v / max) * 100}%` }}
              />
            </div>
            <span className={`report-bar-label ${i === highlight ? "current" : ""}`}>{DAY_LABELS[i]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Reports({ state }) {
  const [period, setPeriod] = useState("this");
  const today = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => {
    const start = startOfWeek(today);
    if (period === "last") start.setDate(start.getDate() - 7);
    return start;
  }, [today, period]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)),
    [weekStart],
  );
  const todayIndex = period === "this" ? days.findIndex((d) => sameDay(d, today)) : -1;

  const invoicesByDay = useMemo(
    () => days.map((d) => state.invoices.filter((inv) => sameDay(new Date(inv.date), d))),
    [days, state.invoices],
  );
  const revenueByDay = invoicesByDay.map((list) => list.reduce((s, i) => s + i.total, 0));
  const ordersByDay = invoicesByDay.map((list) => list.length);

  const recentInvoices = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return state.invoices.filter((i) => new Date(i.date) >= cutoff);
  }, [state.invoices]);

  const topSellers = useMemo(() => {
    const qty = new Map();
    for (const inv of recentInvoices)
      for (const l of inv.lines) qty.set(l.name, (qty.get(l.name) || 0) + l.qty);
    return [...qty.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [recentInvoices]);

  const waiterSales = useMemo(() => {
    const totals = new Map();
    for (const inv of recentInvoices) totals.set(inv.waiter, (totals.get(inv.waiter) || 0) + inv.total);
    return [...totals.entries()]
      .map(([id, total]) => ({ name: state.waiters.find((w) => w.id === id)?.name || "Ish-kamarier", total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [recentInvoices, state.waiters]);
  const maxWaiterSales = Math.max(1, ...waiterSales.map((w) => w.total));

  const todayInvoices = useMemo(() => state.invoices.filter((i) => sameDay(new Date(i.date), today)), [state.invoices, today]);
  const todayGross = todayInvoices.reduce((s, i) => s + i.total, 0);
  const todayCash = todayInvoices.filter((i) => i.method === "Cash").reduce((s, i) => s + i.total, 0);
  const todayCard = todayInvoices.filter((i) => i.method === "Kartë").reduce((s, i) => s + i.total, 0);

  const exportCsv = () => {
    const rows = [["Fatura", "Data", "Tavolina", "Kamarieri", "Mënyra", "Totali (Lek)"]];
    for (const list of invoicesByDay)
      for (const inv of list)
        rows.push([
          `D-${inv.id}`,
          new Date(inv.date).toLocaleString("sq-AL"),
          inv.table,
          state.waiters.find((w) => w.id === inv.waiter)?.name || "",
          inv.method,
          inv.total,
        ]);
    downloadCsv(`raportet-${period === "this" ? "kete-jave" : "java-kaluar"}.csv`, rows);
  };

  return (
    <div className="reports-page">
      <div className="toolbar">
        <ChoiceField compact label="Periudha" options={PERIODS} value={period} onChange={setPeriod} />
        <button onClick={exportCsv}>
          <Icon name="print" size={16} />
          Eksporto CSV
        </button>
      </div>
      <div className="report-grid-2">
        <BarChart title="Të ardhurat" values={revenueByDay} formatValue={money} highlight={todayIndex} />
        <BarChart title="Porositë" values={ordersByDay} formatValue={(v) => String(v)} highlight={todayIndex} />
      </div>
      <div className="report-grid-3">
        <section className="panel">
          <h2>Produktet më të shitura (30 ditë)</h2>
          {topSellers.length ? (
            <ol className="report-rank-list">
              {topSellers.map(([name, qty]) => (
                <li key={name}>
                  <span>{name}</span>
                  <strong>{qty}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <p className="helper">Ende pa shitje në 30 ditët e fundit.</p>
          )}
        </section>
        <section className="panel">
          <h2>Kamarierët (30 ditë)</h2>
          {waiterSales.length ? (
            <div className="report-bar-list">
              {waiterSales.map((w) => (
                <div className="report-bar-row" key={w.name}>
                  <div className="report-bar-row-head">
                    <span>{w.name}</span>
                    <strong>{money(w.total)}</strong>
                  </div>
                  <div className="report-bar-row-track">
                    <div className="report-bar-row-fill" style={{ width: `${(w.total / maxWaiterSales) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="helper">Ende pa shitje në 30 ditët e fundit.</p>
          )}
        </section>
        <section className="panel">
          <h2>Sot</h2>
          <div className="report-summary-list">
            <div>
              <span>Të ardhura bruto</span>
              <strong>{money(todayGross)}</strong>
            </div>
            <div>
              <span>Cash</span>
              <strong>{money(todayCash)}</strong>
            </div>
            <div>
              <span>Kartë</span>
              <strong>{money(todayCard)}</strong>
            </div>
            <div>
              <span>Fatura</span>
              <strong>{todayInvoices.length}</strong>
            </div>
          </div>
          <p className="panel-footnote">
            <Icon name="info" size={14} />
            Kostoja e mallit dhe pagat nuk gjurmohen ende në BlueBar, prandaj nuk shfaqet një fitim neto.
          </p>
        </section>
      </div>
    </div>
  );
}
