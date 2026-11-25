import React, { useEffect, useRef, useState } from "react";
import { money, waiterTakings } from "./domain.js";
import { Badge, Icon, SectionHeading, StatCards } from "./components.jsx";
import { printFitted } from "./printPaper.js";

// Arka: no shifts to open or close. Each waiter with open orders or money not yet handed
// over has a card: what they took since their last handover (cash, card, tips, cash
// refunds) and what they still have open. "Mbyll" takes their money: the manager counts
// the cash, any difference needs a reason, and the handover prints as a short report.
const when = (iso) => (iso ? new Date(iso).toLocaleString("sq-AL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export function Arka({ state, update, user }) {
  const [closing, setClosing] = useState(null); // waiter
  const [report, setReport] = useState(null); // handover
  const team = state.waiters
    .filter((w) => !w.deleted)
    .map((w) => ({ waiter: w, t: waiterTakings(state, w.id) }))
    .filter(({ t }) => t.openTables > 0 || t.invoices > 0 || t.refundsCash > 0)
    .sort((a, b) => b.t.expected - a.t.expected || b.t.openValue - a.t.openValue);
  const total = (k) => team.reduce((n, x) => n + x.t[k], 0);
  const history = [...(state.handovers || [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  const name = (id) => state.waiters.find((w) => w.id === id)?.name || "Kamarier";
  return (
    <div className="arka">
      <StatCards items={[
        ["green", "cash", "Cash për t'u dorëzuar", money(total("expected")), `${team.filter((x) => x.t.invoices).length} kamarierë me para`],
        ["blue", "card", "Me kartë", money(total("card") - total("refundsCard")), "te terminali, jo në arkë"],
        ["amber", "tables", "Porosi të hapura", money(total("openValue")), `${total("openTables")} tavolina pa paguar`],
        ["purple", "receipt", "Fatura", String(total("invoices")), "që nga dorëzimi i fundit"],
      ]} />
      <section className="panel">
        <SectionHeading icon="people" title="Kamarierët" description="Kush ka porosi të hapura ose para për të dorëzuar. “Mbyll” merr paratë e kamarierit dhe e nis nga zero." />
        {team.length ? (
          <div className="arka-team">
            {team.map(({ waiter: w, t }) => (
              <article key={w.id} className="arka-card">
                <header>
                  <span className="arka-avatar" aria-hidden="true">{w.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}</span>
                  <div>
                    <h3>{w.name}</h3>
                    <small>{t.last ? `Dorëzimi i fundit ${when(t.last.date)}` : "Pa dorëzim deri tani"}</small>
                  </div>
                  {t.openTables > 0 && <Badge tone="warning">{t.openTables} porosi aktive · {money(t.openValue)}</Badge>}
                </header>
                <dl>
                  <div><dt>Fatura</dt><dd>{t.invoices}</dd></div>
                  <div><dt>Cash</dt><dd>{money(t.cash)}</dd></div>
                  <div><dt>Kartë</dt><dd>{money(t.card - t.refundsCard)}</dd></div>
                  {t.tipCash + t.tipCard > 0 && <div><dt>Bakshish</dt><dd>{money(t.tipCash + t.tipCard)}</dd></div>}
                  {t.refundsCash > 0 && <div><dt>Rimbursime cash</dt><dd>−{money(t.refundsCash)}</dd></div>}
                </dl>
                <footer>
                  <p><span>Cash për dorëzim</span><strong>{money(t.expected)}</strong></p>
                  <button className="primary" disabled={!t.invoices && !t.refundsCash} onClick={() => setClosing(w)}>
                    <Icon name="check" size={16} /> Mbyll
                  </button>
                </footer>
                {t.openTables > 0 && <p className="helper">Porositë e hapura llogariten kur të paguhen.{t.partPaid > 0 ? ` ${money(t.partPaid)} janë paguar pjesërisht në to.` : ""}</p>}
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">Asnjë kamarier nuk ka porosi të hapura ose para për të dorëzuar.</p>
        )}
      </section>
      <section className="panel">
        <SectionHeading icon="clock" title="Dorëzimet e fundit" description={history.length ? `${history.length} më të fundit` : "Dorëzimet shfaqen këtu."} />
        {history.length > 0 && (
          <ul className="arka-history">
            {history.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => setReport(h)}>
                  <div><b>{name(h.waiterId)}</b><small>{when(h.date)}{h.by ? ` · mori ${h.by}` : ""} · {h.invoices} fatura</small></div>
                  <div className="arka-history-end">
                    <b>{money(h.counted)}</b>
                    {h.counted !== h.expected
                      ? <small className={h.counted < h.expected ? "warning-text" : "positive"}>{h.counted < h.expected ? "−" : "+"}{money(Math.abs(h.counted - h.expected))}</small>
                      : <small>Saktë</small>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {closing && (
        <CloseDialog
          waiter={closing}
          takings={waiterTakings(state, closing.id)}
          onCancel={() => setClosing(null)}
          onSubmit={async (counted, note) => {
            const data = await update("waiter.handover", { waiterId: closing.id, counted, ...(note && { note }) }, `Paratë e ${closing.name} u morën.`);
            if (data) {
              setClosing(null);
              setReport(data.state.handovers.find((h) => h.id === data.result.handoverId));
            }
          }}
        />
      )}
      {report && (
        <ReportDialog report={report} waiterName={name(report.waiterId)} venueName={user.venue?.name} onClose={() => setReport(null)} />
      )}
    </div>
  );
}

function CloseDialog({ waiter, takings: t, onCancel, onSubmit }) {
  const ref = useRef(null);
  const [counted, setCounted] = useState(String(t.expected));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);
  const diff = (Number(counted) || 0) - t.expected;
  const ready = counted !== "" && Number(counted) >= 0 && (diff === 0 || note.trim().length > 0);
  return (
    <dialog ref={ref} className="arka-dialog" aria-labelledby="arka-close-title" onClose={onCancel}>
      <form onSubmit={async (e) => { e.preventDefault(); if (!ready) return; setBusy(true); await onSubmit(Number(counted), note.trim()); setBusy(false); }}>
        <h2 id="arka-close-title">Mbyll · {waiter.name}</h2>
        <p className="helper">{t.invoices} fatura{t.last ? ` që nga ${when(t.last.date)}` : ""}. Numëroni cash-in që ju jep kamarieri.</p>
        <div className="receipt-line"><span>Cash nga faturat</span><b>{money(t.cash)}</b></div>
        {t.tipCash > 0 && <div className="receipt-line"><span>+ Bakshish cash</span><b>{money(t.tipCash)}</b></div>}
        {t.refundsCash > 0 && <div className="receipt-line"><span>− Rimbursime cash</span><b>{money(t.refundsCash)}</b></div>}
        <div className="receipt-total"><b>Duhet të dorëzojë</b><strong>{money(t.expected)}</strong></div>
        <div className="receipt-line"><span>Me kartë (në terminal)</span><b>{money(t.card - t.refundsCard)}</b></div>
        <label className="field">
          <span>Cash i numëruar (Lek)</span>
          <input type="number" inputMode="numeric" min="0" step="1" value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus required />
        </label>
        {counted !== "" && diff !== 0 && (
          <>
            <p className={diff < 0 ? "warning-text" : "positive"}>Diferenca: {diff < 0 ? "−" : "+"}{money(Math.abs(diff))}</p>
            <label className="field">
              <span>Pse ka diferencë?</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} required placeholder="p.sh. kusur i dhënë gabim" />
            </label>
          </>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={() => ref.current?.close()}>Anulo</button>
          <button className="primary" disabled={!ready || busy}>{busy ? "Po mbyllet…" : "Merr paratë"}</button>
        </div>
      </form>
    </dialog>
  );
}

export function HandoverReport({ report: h, waiterName, venueName }) {
  return (
    <>
      <div className="receipt-brand">{venueName || "BlueBar"}<span>DORËZIMI I KAMARIERIT</span></div>
      <p>{waiterName}<br />{new Date(h.date).toLocaleString("sq-AL")}{h.by ? ` · mori ${h.by}` : ""}</p>
      <hr />
      <div className="receipt-line"><span>Fatura</span><b>{h.invoices}</b></div>
      <div className="receipt-line"><span>Me kartë</span><b>{money(h.card)}</b></div>
      {h.tips > 0 && <div className="receipt-line"><span>Bakshish</span><b>{money(h.tips)}</b></div>}
      <div className="receipt-total"><b>CASH I PRITSHËM</b><strong>{money(h.expected)}</strong></div>
      <div className="receipt-line"><span>Cash i numëruar</span><b>{money(h.counted)}</b></div>
      <div className="receipt-line"><span>Diferenca</span><b>{h.counted === h.expected ? "0" : `${h.counted < h.expected ? "−" : "+"}${money(Math.abs(h.counted - h.expected))}`}</b></div>
      {h.note && <p>Shënim: {h.note}</p>}
    </>
  );
}

function ReportDialog({ report, waiterName, venueName, onClose }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <>
      <dialog ref={ref} className="arka-dialog" aria-label={`Dorëzimi i ${waiterName}`} onClose={onClose}>
        <article className="receipt-paper"><HandoverReport report={report} waiterName={waiterName} venueName={venueName} /></article>
        <div className="dialog-actions">
          <button type="button" onClick={() => ref.current?.close()}>Mbyll</button>
          <button className="primary" onClick={() => printFitted()}><Icon name="print" size={16} /> Printo</button>
        </div>
      </dialog>
      <article className="receipt print-only"><HandoverReport report={report} waiterName={waiterName} venueName={venueName} /></article>
    </>
  );
}
