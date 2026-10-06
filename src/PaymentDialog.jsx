import React, { useState } from "react";
import { bill, money } from "./domain.js";
import { Field, Icon } from "./components.jsx";

const amount = (n) => new Intl.NumberFormat("sq-AL", { maximumFractionDigits: 0 }).format(n);
// Exact amount, then the next 500 / 1,000 / 5,000 up — the notes a customer hands over.
const quickCash = (t) => [...new Set([t, ...[500, 1000, 5000].map((n) => Math.ceil(t / n) * n)])].slice(0, 4);
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

// Taking payment for a table: cash or card, for everything it still owes (after any
// discount, comps or earlier payments). The server checks the amount again.
export function PaymentForm({ table, initialMethod, fiscalEnabled, onCancel, onSubmit }) {
  const due = bill(table).remaining;
  const [payment, setPayment] = useState(initialMethod === "Kartë" ? "Kartë" : "Cash");
  const [received, setReceived] = useState("");
  const short = payment === "Cash" && (received === "" || Number(received) < due);
  const pressKey = (key) =>
    setReceived((current) => {
      if (key === "clear") return "";
      if (key === "back") return current.slice(0, -1);
      const next = `${current}${key}`.replace(/^0+(?=\d)/, "");
      return Number(next) <= 100000000 ? next : current;
    });
  const submit = (e) => {
    e.preventDefault();
    if (short) return;
    // Two submit buttons share this form; which one fired decides whether the sale is
    // fiscalized right away or left for later (Faturat → "Fiskalizo Faturën").
    onSubmit(
      { method: payment, ...(payment === "Cash" ? { received: Number(received) } : {}) },
      fiscalEnabled && e.nativeEvent.submitter?.value !== "skip-fiscalize",
    );
  };
  return (
    <form onSubmit={submit}>
      <div className="dialog-heading">
        <span className="dialog-icon">
          <Icon name={payment === "Cash" ? "cash" : "card"} size={25} />
        </span>
        <button type="button" className="icon-button" onClick={onCancel} aria-label="Anulo pagesën">
          <Icon name="close" />
        </button>
      </div>
      <h2 id="payment-title">Paguaj</h2>
      <p>Tavolina {String(table.id).padStart(2, "0")} · Zgjidhni mënyrën e pagesës</p>
      <div className="payment-amount">
        <span>Për t’u paguar</span>
        {payment === "Cash" ? (
          <button
            type="button"
            className="payment-amount-fill"
            onClick={() => setReceived(String(due))}
            aria-label={`Vendos shumën e saktë, ${money(due)}`}
          >
            {money(due)}
          </button>
        ) : (
          <strong>{money(due)}</strong>
        )}
      </div>
      <div className="payment-methods" role="group" aria-label="Mënyra e pagesës">
        <button type="button" aria-pressed={payment === "Cash"} onClick={() => setPayment("Cash")}><Icon name="cash" size={18} /> Cash</button>
        <button type="button" aria-pressed={payment === "Kartë"} onClick={() => setPayment("Kartë")}><Icon name="card" size={18} /> Kartë</button>
      </div>
      {payment === "Cash" ? (
        <>
          <Field
            label="Shuma e marrë (Lek)"
            name="received"
            type="number"
            inputMode="numeric"
            min={due}
            max="100000000"
            step="1"
            required
            value={received}
            onChange={(e) => setReceived(e.target.value)}
            placeholder={String(due)}
          />
          <div className="cash-quick" role="group" aria-label="Shuma të shpejta">
            {quickCash(due).map((v) => (
              <button type="button" key={v} aria-pressed={Number(received) === v} onClick={() => setReceived(String(v))}>
                {v === due ? "Saktë" : amount(v)}
              </button>
            ))}
          </div>
          <div className="cash-keypad" role="group" aria-label="Shuma e marrë">
            {KEYS.map((key) => (
              <button
                key={key}
                type="button"
                disabled={key === "clear" || key === "back" ? !received : false}
                aria-label={key === "clear" ? "Pastro shumën" : key === "back" ? "Fshi shifrën e fundit" : `Shifra ${key}`}
                onClick={() => pressKey(key)}
              >
                {key === "clear" ? "Pastro" : key === "back" ? <Icon name="backspace" size={20} /> : key}
              </button>
            ))}
          </div>
          <div className="change-due">
            <span>Kusuri</span>
            <strong>{money(Math.max(0, Number(received) - due))}</strong>
          </div>
        </>
      ) : (
        <div className="info-note">
          <Icon name="info" size={18} />
          <p>Konfirmoni vetëm pasi pagesa të jetë kryer në terminalin e kartës.</p>
        </div>
      )}
      <p className="helper">Pagesa mbyll porosinë dhe liron tavolinën. Pas konfirmimit mund të printoni faturën.</p>
      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>Kthehu</button>
        <button value="skip-fiscalize" className={fiscalEnabled ? undefined : "primary"} disabled={short}>
          <Icon name="check" size={17} />
          Konfirmo
        </button>
        {fiscalEnabled && (
          <button className="primary" value="fiscalize" disabled={short}>
            <Icon name="check" size={17} />
            Konfirmo dhe fiskalizo
          </button>
        )}
      </div>
    </form>
  );
}

// Money back on a paid invoice (manager): never more than it took, always with a reason.
// Stock isn't put back and the refund isn't sent to the tax system by itself.
export function RefundForm({ invoice, update, onDone }) {
  const [open, setOpen] = useState(false);
  const refunded = (invoice.refunds || []).reduce((s, r) => s + r.amount, 0);
  const left = invoice.total - refunded;
  if (!left) return <p className="helper">Fatura është rimbursuar e plotë.</p>;
  if (!open)
    return (
      <button className="full-width" onClick={() => setOpen(true)}>
        Rimbursim
      </button>
    );
  return (
    <form
      className="stack-form refund-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const data = await update(
          "invoice.refund",
          { invoiceId: invoice.id, amount: Number(f.get("amount")), method: f.get("method"), reason: f.get("reason") },
          `U rimbursuan ${money(Number(f.get("amount")))} nga D-${invoice.id}.`,
        );
        if (data) (setOpen(false), onDone(data));
      }}
    >
      <Field label={`Shuma (deri ${amount(left)} Lek)`} name="amount" type="number" min="1" max={left} required defaultValue={left} />
      <div className="payment-methods" role="radiogroup" aria-label="Si kthehen paratë">
        {["Cash", "Kartë"].map((m) => (
          <label key={m} className="refund-method">
            <input type="radio" name="method" value={m} defaultChecked={m === (invoice.card > invoice.cash ? "Kartë" : "Cash")} />
            {m === "Cash" ? "Cash nga arka" : "Në kartë"}
          </label>
        ))}
      </div>
      <Field label="Arsyeja" name="reason" minLength={3} maxLength={200} required placeholder="p.sh. pjatë e gabuar" />
      <p className="helper">Stoku nuk kthehet vetë. Rimbursimi nuk dërgohet automatikisht te tatimet.</p>
      <div className="actions">
        <button type="button" onClick={() => setOpen(false)}>Anulo</button>
        <button className="primary">Rimburso</button>
      </div>
    </form>
  );
}
