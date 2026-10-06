import React, { useEffect, useState } from "react";
import { bill, DENOMINATIONS, drawer, money, posOf, shiftFor, total } from "./domain.js";
import { fetchShiftReport } from "./api.js";
import { Badge, Empty, Field, Icon, SectionHeading } from "./components.jsx";

// Same dd.mm.yyyy as the rest of the app (the browser's "sq-AL" date format varies).
const date = (v) => {
  const d = new Date(v);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
};
const time = (v) => new Date(v).toLocaleTimeString("sq-AL", { hour: "2-digit", minute: "2-digit", hour12: false });
const amount = (n) => new Intl.NumberFormat("sq-AL", { maximumFractionDigits: 0 }).format(n);
const elapsed = (from) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(from)) / 60000));
  const h = Math.floor(minutes / 60);
  return h ? `${h} orë ${minutes % 60} min` : `${minutes} min`;
};
const signed = (n) => (n > 0 ? `+${money(n)}` : money(n));

// The printed / previewed shift report, from GET /api/shifts/:id/report.
export function ShiftReport({ report, venueName }) {
  const { shift } = report;
  return (
    <>
      <div className="receipt-brand">
        {venueName || "BlueBar"}
        <span>{shift.closed ? "RAPORT TURNI" : "GJENDJA E TURNIT"}</span>
      </div>
      <div className="receipt-meta">
        <span>Turni #{shift.id}</span>
        <span>{report.invoiceCount} fatura</span>
      </div>
      <p>
        {date(shift.opened)} {time(shift.opened)}
        {shift.openedBy ? ` · ${shift.openedBy}` : ""}
        {shift.closed && (
          <>
            <br />
            {date(shift.closed)} {time(shift.closed)}
            {shift.closedBy ? ` · ${shift.closedBy}` : ""}
          </>
        )}
      </p>
      <hr />
      <div className="receipt-line"><span>Shitje cash</span><b>{money(report.cash)}</b></div>
      <div className="receipt-line"><span>Bankë (kartë)</span><b>{money(report.card)}</b></div>
      <div className="receipt-total"><b>ARKËTUAR GJITHSEJ</b><strong>{money(report.cash + report.card)}</strong></div>
      {report.discount > 0 && <div className="receipt-line"><span>Ulje</span><b>{money(report.discount)}</b></div>}
      {report.comps > 0 && <div className="receipt-line"><span>Qerasje</span><b>{money(report.comps)}</b></div>}
      <hr />
      <div className="receipt-line"><span>Fondi fillestar</span><b>{money(shift.opening)}</b></div>
      <div className="receipt-line"><span>+ Shitje cash</span><b>{money(report.cash)}</b></div>
      {report.cashIn > 0 && <div className="receipt-line"><span>+ Hyrje në arkë</span><b>{money(report.cashIn)}</b></div>}
      {report.refundsCash > 0 && <div className="receipt-line"><span>− Rimbursime cash</span><b>{money(report.refundsCash)}</b></div>}
      {report.cashOut > 0 && <div className="receipt-line"><span>− Dalje nga arka</span><b>{money(report.cashOut)}</b></div>}
      <div className="receipt-total"><b>CASH I PRITSHËM</b><strong>{money(shift.expected)}</strong></div>
      {shift.closed && (
        <>
          <div className="receipt-line"><span>E numëruar</span><b>{money(shift.counted)}</b></div>
          <div className="receipt-line"><span>Diferenca</span><b>{signed(shift.difference)}</b></div>
          {shift.note && <p>Shënim: {shift.note}</p>}
        </>
      )}
      {report.cashMovements.length > 0 && (
        <>
          <hr />
          <p>LËVIZJET E ARKËS</p>
          {report.cashMovements.map((m, i) => (
            <div className="receipt-line" key={i}>
              <span>{m.kind === "in" ? "+" : "−"} {m.reason}</span>
              <b>{money(m.amount)}</b>
            </div>
          ))}
        </>
      )}
      <hr />
      <p>SIPAS KAMARIERIT</p>
      {report.byWaiter.length ? (
        report.byWaiter.map((w) => (
          <div className="receipt-line" key={w.name}>
            <span>{w.name} · {w.count}</span>
            <b>{money(w.total)}</b>
          </div>
        ))
      ) : (
        <p>Asnjë shitje</p>
      )}
      <hr />
      <p>MË TË SHITURAT</p>
      {report.topProducts.length ? (
        report.topProducts.map((p) => (
          <div className="receipt-line" key={p.name}>
            <span>{p.qty} × {p.name}</span>
            <b>{money(p.total)}</b>
          </div>
        ))
      ) : (
        <p>Asnjë shitje</p>
      )}
      <hr />
      <p>Të fiskalizuara: {report.fiscalized} nga {report.invoiceCount}</p>
    </>
  );
}

function OpenShift({ state, update }) {
  const last = state.shifts[0];
  const [opening, setOpening] = useState(last ? String(last.opening) : "");
  return (
    <section className="panel shift-hero">
      <SectionHeading title="Hap turnin" description="Numëroni fondin e arkës dhe nisni shërbimin. Pa turn të hapur nuk merren porosi." />
      <form
        className="shift-open-form"
        onSubmit={(e) => {
          e.preventDefault();
          update("shift.open", { opening: Number(opening) }, "Turni u hap. Mund të merrni porosi.");
        }}
      >
        <Field
          label="Fondi fillestar (Lek)"
          type="number"
          inputMode="numeric"
          min="0"
          max="100000000"
          step="1"
          required
          value={opening}
          onChange={(e) => setOpening(e.target.value)}
          placeholder="p.sh. 5000"
        />
        {last && Number(opening) !== last.opening && (
          <button type="button" className="subtle-button" onClick={() => setOpening(String(last.opening))}>
            Si herën e kaluar · {money(last.opening)}
          </button>
        )}
        <button className="primary">
          <Icon name="clock" size={18} />
          Hap turnin
        </button>
      </form>
    </section>
  );
}

function CashMovements({ state, update, d }) {
  const [kind, setKind] = useState(null);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const moves = state.shift.cashMovements || [];
  const reset = () => (setKind(null), setValue(""), setReason(""));
  return (
    <section className="panel drawer-card">
      <SectionHeading title="Arka" description="Sa cash duhet të ketë në arkë tani." />
      <div className="drawer-lines">
        <div><span>Fondi fillestar</span><b>{money(d.opening)}</b></div>
        <div><span>+ Arkëtime cash</span><b>{money(d.cash)}</b></div>
        {d.cashIn > 0 && <div><span>+ Hyrje</span><b>{money(d.cashIn)}</b></div>}
        {d.cashOut > 0 && <div><span>− Dalje</span><b>{money(d.cashOut)}</b></div>}
        {d.refundsCash > 0 && <div><span>− Rimbursime cash</span><b>{money(d.refundsCash)}</b></div>}
        <div className="drawer-expected"><span>Cash i pritshëm</span><strong>{money(d.expected)}</strong></div>
        <div className="drawer-card-sales"><span>Bankë · kartë (jashtë arkës)</span><b>{money(d.card)}</b></div>
      </div>
      {kind ? (
        <form
          className="stack-form cash-move-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await update(
              "shift.cash",
              { kind, amount: Number(value), reason },
              kind === "in" ? "Hyrja u regjistrua." : "Dalja u regjistrua.",
            );
            if (ok) reset();
          }}
        >
          <strong>{kind === "in" ? "Hyrje në arkë" : "Dalje nga arka"}</strong>
          <Field label="Shuma (Lek)" type="number" inputMode="numeric" min="1" max="100000000" required autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
          <Field
            label="Arsyeja"
            required
            maxLength={120}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={kind === "in" ? "p.sh. Kusur nga banka" : "p.sh. Pagesë furnitori, derdhje në kasafortë"}
          />
          <div className="actions">
            <button type="button" onClick={reset}>Anulo</button>
            <button className="primary">Regjistro</button>
          </div>
        </form>
      ) : (
        <div className="drawer-actions">
          <button onClick={() => setKind("in")}><Icon name="plus" size={16} /> Hyrje</button>
          <button onClick={() => setKind("out")}>− Dalje</button>
        </div>
      )}
      {moves.length > 0 && (
        <ul className="cash-move-list">
          {moves.map((m) => (
            <li key={m.id}>
              <span className={m.kind === "in" ? "positive" : "warning-text"}>{m.kind === "in" ? "+" : "−"}{money(m.amount)}</span>
              <span>{m.reason}</span>
              <small>{time(m.date)}{m.by ? ` · ${m.by}` : ""}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LiveShift({ state, update, nav, onClose, d, shiftInvoices }) {
  const open = state.tables.filter((t) => t.lines.length);
  const openValue = open.reduce((s, t) => s + bill(t).remaining, 0);
  const waiters = state.waiters
    .map((w) => {
      const mine = shiftInvoices.filter((i) => i.waiter === w.id);
      return {
        id: w.id,
        name: w.name,
        count: mine.length,
        total: mine.reduce((s, i) => s + i.total, 0),
        cash: mine.reduce((s, i) => s + (i.cash || 0), 0),
        openTables: open.filter((t) => t.waiter === w.id).length,
      };
    })
    .filter((w) => w.count || w.openTables)
    .sort((a, b) => b.total - a.total);
  const unfiscalized = shiftInvoices.filter((i) => i.fiscalStatus !== "fiskalizuar").length;
  const usesFiscal = state.invoices.some((i) => i.fiscalStatus === "fiskalizuar" || i.fiscalStatus === "dështoi");
  return (
    <>
      <section className="panel shift-live-head">
        <div>
          <span className="shift-live-dot" aria-hidden="true" />
          <h2>Turni #{state.shift.id}</h2>
          <p>
            Hapur {time(state.shift.opened)}
            {state.shift.openedBy ? ` nga ${state.shift.openedBy}` : ""} · {elapsed(state.shift.opened)}
          </p>
        </div>
        <button className="primary" onClick={onClose}>
          <Icon name="check" size={18} />
          Mbyll turnin
        </button>
      </section>
      <div className="shift-kpis">
        <div><span>Shitje</span><strong>{money(d.sales)}</strong></div>
        <div><span>Fatura</span><strong>{d.count}</strong></div>
        <div><span>Mesatarja</span><strong>{money(d.count ? Math.round(d.sales / d.count) : 0)}</strong></div>
        <button className={open.length ? "has-open" : ""} onClick={() => nav("Porositë")}>
          <span>Porosi të hapura</span>
          <strong>{open.length}</strong>
          {open.length > 0 && <small>{money(openValue)}</small>}
        </button>
      </div>
      <div className="shift-grid">
        <CashMovements state={state} update={update} d={d} />
        <section className="panel">
          <SectionHeading title="Sipas kamarierit" description="Shitjet e këtij turni." />
          {waiters.length ? (
            <ul className="shift-waiters">
              {waiters.map((w) => (
                <li key={w.id}>
                  <span className="avatar">{w.name[0]}</span>
                  <div>
                    <strong>{w.name}</strong>
                    <small>
                      {w.count} fatura · cash {money(w.cash)}
                      {w.openTables ? ` · ${w.openTables} tavolina hapur` : ""}
                    </small>
                  </div>
                  <b>{money(w.total)}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="helper">Ende pa shitje në këtë turn.</p>
          )}
          {usesFiscal && unfiscalized > 0 && (
            <div className="notice warning shift-fiscal">
              <Icon name="info" size={16} />
              <span>{unfiscalized} fatura të këtij turni nuk janë fiskalizuar.</span>
              <button onClick={() => nav("Faturat")}>Faturat</button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

const STEPS = ["Kontrolli", "Numërimi", "Mbyllja"];

function CloseShift({ state, update, nav, onCancel, onClosed, d, shiftInvoices }) {
  const [step, setStep] = useState(0);
  const [byNotes, setByNotes] = useState(true);
  const [notes, setNotes] = useState({});
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const open = state.tables.filter((t) => t.lines.length);
  const unfiscalized = shiftInvoices.filter((i) => i.fiscalStatus !== "fiskalizuar").length;
  const usesFiscal = state.invoices.some((i) => i.fiscalStatus === "fiskalizuar" || i.fiscalStatus === "dështoi");
  const notesTotal = DENOMINATIONS.reduce((s, n) => s + n * (notes[n] || 0), 0);
  const counted = byNotes ? notesTotal : Number(typed || 0);
  const counting = byNotes ? Object.values(notes).some(Boolean) : typed !== "";
  const difference = counted - d.expected;
  const setCount = (n, v) => setNotes((c) => ({ ...c, [n]: Math.max(0, Math.min(100000, Number(v) || 0)) }));

  async function close() {
    setBusy(true);
    const denominations = byNotes ? Object.fromEntries(Object.entries(notes).filter(([, q]) => q > 0)) : undefined;
    const data = await update(
      "shift.close",
      { counted, ...(denominations && { denominations }), ...(note.trim() && { note: note.trim() }) },
      "Turni u mbyll.",
    );
    setBusy(false);
    if (data) onClosed(state.shift);
  }

  return (
    <section className="panel close-shift">
      <SectionHeading title={`Mbyll turnin #${state.shift.id}`}>
        <button className="icon-button" onClick={onCancel} aria-label="Anulo mbylljen">
          <Icon name="close" />
        </button>
      </SectionHeading>
      <ol className="close-steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? "current" : i < step ? "done" : ""}>
            <span>{i < step ? <Icon name="check" size={14} /> : i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="close-body">
          <div className={`close-check ${open.length ? "blocked" : "ok"}`}>
            <Icon name={open.length ? "tables" : "check"} size={20} />
            <div>
              <strong>{open.length ? (open.length === 1 ? "1 tavolinë ka porosi të hapur" : `${open.length} tavolina kanë porosi të hapura`) : "Të gjitha tavolinat janë të lira"}</strong>
              <small>{open.length ? "Paguani ose anuloni porositë përpara mbylljes." : "Asnjë porosi e papaguar."}</small>
            </div>
            {open.length > 0 && <button onClick={() => nav("Porositë")}>Porositë</button>}
          </div>
          {usesFiscal && (
            <div className={`close-check ${unfiscalized ? "warn" : "ok"}`}>
              <Icon name={unfiscalized ? "info" : "check"} size={20} />
              <div>
                <strong>{unfiscalized ? `${unfiscalized} fatura pa u fiskalizuar` : "Të gjitha faturat janë fiskalizuar"}</strong>
                <small>{unfiscalized ? "Mund t'i fiskalizoni edhe më vonë nga Faturat." : `${shiftInvoices.length} fatura në këtë turn.`}</small>
              </div>
              {unfiscalized > 0 && <button onClick={() => nav("Faturat")}>Faturat</button>}
            </div>
          )}
          <div className="close-check ok">
            <Icon name="cash" size={20} />
            <div>
              <strong>Në arkë duhet të jenë {money(d.expected)}</strong>
              <small>
                Fondi {money(d.opening)} + cash {money(d.cash)}
                {d.cashIn ? ` + hyrje ${money(d.cashIn)}` : ""}
                {d.cashOut ? ` − dalje ${money(d.cashOut)}` : ""}
              </small>
            </div>
          </div>
          <div className="actions">
            <button onClick={onCancel}>Anulo</button>
            <button className="primary" disabled={open.length > 0} onClick={() => setStep(1)}>
              Numëro arkën
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="close-body">
          <div className="tabs" role="group" aria-label="Mënyra e numërimit">
            <button aria-pressed={byNotes} onClick={() => setByNotes(true)}>Sipas kartëmonedhave</button>
            <button aria-pressed={!byNotes} onClick={() => setByNotes(false)}>Shuma totale</button>
          </div>
          {byNotes ? (
            <div className="denominations">
              {DENOMINATIONS.map((n) => (
                <div className={`denomination ${n >= 200 ? "note" : "coin"}`} key={n}>
                  <span className="denomination-face">{amount(n)}</span>
                  <div className="quantity">
                    <button type="button" aria-label={`Një ${n} Lek më pak`} disabled={!notes[n]} onClick={() => setCount(n, (notes[n] || 0) - 1)}>−</button>
                    <input
                      aria-label={`Sa copë ${n} Lek`}
                      inputMode="numeric"
                      value={notes[n] || ""}
                      placeholder="0"
                      onChange={(e) => setCount(n, e.target.value.replace(/\D/g, ""))}
                    />
                    <button type="button" aria-label={`Një ${n} Lek më shumë`} onClick={() => setCount(n, (notes[n] || 0) + 1)}>+</button>
                  </div>
                  <b>{notes[n] ? money(n * notes[n]) : ""}</b>
                </div>
              ))}
            </div>
          ) : (
            <Field
              label="Cash i numëruar (Lek)"
              type="number"
              inputMode="numeric"
              min="0"
              max="100000000"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          )}
          <div className={`count-summary ${!counting ? "" : difference === 0 ? "exact" : "off"}`}>
            <div><span>E pritshme</span><b>{money(d.expected)}</b></div>
            <div><span>E numëruar</span><b>{money(counted)}</b></div>
            <div><span>Diferenca</span><strong>{counting ? signed(difference) : "—"}</strong></div>
          </div>
          <div className="actions">
            <button onClick={() => setStep(0)}>Kthehu</button>
            <button className="primary" disabled={!counting} onClick={() => setStep(2)}>
              Vazhdo
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="close-body">
          <div className={`count-summary big ${difference === 0 ? "exact" : "off"}`}>
            <div><span>Shitje gjithsej</span><b>{money(d.sales)} · {d.count} fatura</b></div>
            <div><span>Cash i pritshëm</span><b>{money(d.expected)}</b></div>
            <div><span>Cash i numëruar</span><b>{money(counted)}</b></div>
            <div><span>Diferenca</span><strong>{difference === 0 ? "Pa diferencë" : signed(difference)}</strong></div>
          </div>
          <label className="field">
            <span>{difference === 0 ? "Shënim (opsional)" : "Shpjegoni diferencën"}</span>
            <textarea
              rows={3}
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={difference === 0 ? "p.sh. Turn i qetë" : "p.sh. Kusur i dhënë gabim te tavolina 4"}
            />
          </label>
          <div className="actions">
            <button onClick={() => setStep(1)} disabled={busy}>Kthehu</button>
            <button className="primary" onClick={close} disabled={busy}>
              <Icon name="check" size={18} />
              {busy ? "Po mbyllet…" : "Mbyll turnin"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function History({ state, onReport }) {
  return (
    <section className="panel">
      <SectionHeading title="Historiku i turneve" description={`${state.shifts.length} turne të mbyllura`} />
      {state.shifts.length ? (
        <div className="table-scroll">
          <table className="responsive-table">
            <thead>
              <tr>
                <th>Turni</th>
                <th>Stafi</th>
                <th className="numeric">Shitje</th>
                <th className="numeric">Diferenca</th>
                <th><span className="sr-only">Veprimet</span></th>
              </tr>
            </thead>
            <tbody>
              {state.shifts.map((s) => (
                <tr key={s.id}>
                  <td data-label="Turni">
                    <strong>#{s.id} · {date(s.closed)}</strong>
                    <small>{time(s.opened)}–{time(s.closed)}</small>
                  </td>
                  <td data-label="Stafi">
                    {s.openedBy || "—"}
                    {s.closedBy && s.closedBy !== s.openedBy && <small>mbylli {s.closedBy}</small>}
                  </td>
                  <td data-label="Shitje" className="numeric">
                    <strong>{money(s.sales?.total || 0)}</strong>
                    <small>{s.sales?.count || 0} fatura</small>
                  </td>
                  <td data-label="Diferenca" className="numeric">
                    <Badge tone={s.difference === 0 ? "green" : "amber"}>{signed(s.difference)}</Badge>
                    {s.note && <small title={s.note}>ka shënim</small>}
                  </td>
                  <td className="row-actions">
                    <button onClick={() => onReport(s.id)}>Raporti</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon="clock" title="Çdo turn, i dokumentuar">
          Pas mbylljes së turnit të parë, shitjet, numërimi dhe diferenca shfaqen këtu.
        </Empty>
      )}
    </section>
  );
}

export function Shifts({ state: all, user, update: send, notify, nav, report, setReport, onPrintReport }) {
  const [closing, setClosing] = useState(false);
  const [posId, setPosId] = useState(null);
  // Everything below works on one till at a time: its shift, its history, its tables.
  const till = all.pointsOfSale.find((k) => k.id === posId) ?? all.pointsOfSale[0];
  const state = {
    ...all,
    shift: shiftFor(all, till?.id),
    shifts: all.shifts.filter((s) => s.posId === till?.id),
    tables: all.tables.filter((t) => posOf(all, t) === till?.id),
  };
  const update = (type, payload, message) =>
    send(type, type.startsWith("shift.") ? { ...payload, posId: till.id } : payload, message);
  useEffect(() => {
    if (!state.shift) setClosing(false);
  }, [state.shift]);
  const d = drawer(state, state.shift);
  const shiftInvoices = state.shift ? state.invoices.filter((i) => i.shiftId === state.shift.id) : [];
  const openReport = async (id) => {
    try {
      setReport(await fetchShiftReport(id));
    } catch (e) {
      notify(e.message, "error");
    }
  };
  return (
    <div className="management-layout shifts-layout">
      <div className="shifts-main">
        {all.pointsOfSale.length > 1 && (
          <div className="tabs shift-tills" aria-label="Kasa">
            {all.pointsOfSale.map((k) => (
              <button
                key={k.id}
                aria-pressed={k.id === till.id}
                onClick={() => (setPosId(k.id), setClosing(false))}
              >
                <span className={`dot ${shiftFor(all, k.id) ? "till-open" : "till-closed"}`} aria-hidden="true" />
                {k.name}
                <span className="sr-only">{shiftFor(all, k.id) ? " · turn i hapur" : " · turn i mbyllur"}</span>
              </button>
            ))}
          </div>
        )}
        {!state.shift ? (
          <OpenShift state={state} update={update} />
        ) : closing ? (
          <CloseShift
            state={state}
            update={update}
            nav={nav}
            d={d}
            shiftInvoices={shiftInvoices}
            onCancel={() => setClosing(false)}
            onClosed={(shift) => openReport(shift.id)}
          />
        ) : (
          <LiveShift state={state} update={update} nav={nav} d={d} shiftInvoices={shiftInvoices} onClose={() => setClosing(true)} />
        )}
        <History state={state} onReport={openReport} />
      </div>
      <aside className="management-aside">
        {report ? (
          <div className="receipt-preview">
            <div className="preview-heading">
              <h2>Raporti i turnit #{report.shift.id}</h2>
              <button className="icon-button" onClick={() => setReport(null)} aria-label="Mbyll raportin">
                <Icon name="close" />
              </button>
            </div>
            <article className="receipt-paper">
              <ShiftReport report={report} venueName={user.venue?.name} />
            </article>
            <button className="primary full-width" onClick={() => onPrintReport(report)}>
              <Icon name="print" size={18} />
              Printo raportin
            </button>
          </div>
        ) : (
          <div className="info-note">
            <Icon name="cash" />
            <div>
              <strong>Si funksionon turni</strong>
              <p>
                Hapni turnin me fondin e arkës. Çdo para që hyn ose del nga arka gjatë turnit
                regjistrohet te "Arka", që numërimi në fund të dalë i saktë. Pagesat me kartë
                nuk hyjnë në arkë.
              </p>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
