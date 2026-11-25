import React, { useState } from "react";
import { bill, money, tableName } from "./domain.js";
import { Field, Icon } from "./components.jsx";

const amount = (n) => new Intl.NumberFormat("sq-AL", { maximumFractionDigits: 0 }).format(n);
// Exact amount, then the next 500 / 1,000 / 5,000 up — the notes a customer hands over.
const quickCash = (t) => [...new Set([t, ...[500, 1000, 5000].map((n) => Math.ceil(t / n) * n)])].slice(0, 4);
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];
const MODES = [["full", "Gjithçka"], ["split", "Ndaj në pjesë"], ["items", "Sipas artikujve"]];
const int = (v) => Math.max(0, Math.floor(Number(v) || 0));

// Taking payment for a table. Three ways, as a table really pays:
//   Gjithçka — everything it still owes, in cash, by card, or part of each;
//   Ndaj në pjesë — one share (the bill split N ways, or any amount): the table stays open
//     with what's left, and the invoice comes out with the last share;
//   Sipas artikujve — "secili të vetën": the chosen items on an invoice of their own.
// An optional tip rides on the payment. The server checks every amount again.
export function PaymentForm({ table, initialMethod, fiscalEnabled, onCancel, onSubmit }) {
  const b = bill(table);
  const due = b.remaining;
  const [mode, setMode] = useState("full");
  const [method, setMethod] = useState(initialMethod === "Kartë" ? "Kartë" : "Cash");
  const [parts, setParts] = useState(2);
  const [share, setShare] = useState(String(Math.ceil(due / 2)));
  const [units, setUnits] = useState({});
  const [cardPart, setCardPart] = useState("");
  const [tip, setTip] = useState("");
  const [showTip, setShowTip] = useState(false);
  // What this payment settles (before any tip).
  const chosen = table.lines.filter((l) => units[l.key] > 0).map((l) => ({ ...l, qty: units[l.key], comp: 0 }));
  const everything = chosen.length && table.lines.every((l) => (units[l.key] || 0) >= l.qty - (l.comp || 0));
  const charge = mode === "full" ? due
    : mode === "split" ? Math.min(due, int(share))
    : everything ? due : bill({ lines: chosen, discount: table.discount }).due;
  const tipValue = int(tip);
  const card = method === "Kartë" ? charge : method === "Mix" ? Math.min(charge, int(cardPart)) : 0;
  const cash = charge - card;
  const cashDue = cash + (method === "Cash" ? tipValue : 0);
  // The cash handed over follows what's owed in cash until someone picks or types an amount;
  // after a pick, the first digit typed on the keypad starts over.
  const [typed, setTyped] = useState(null);
  const [picked, setPicked] = useState(true);
  const received = typed ?? String(cashDue);
  const setReceived = (v) => (setTyped(Number(v) === cashDue ? null : v), setPicked(true));
  const setReceivedRaw = (v) => setTyped(typeof v === "function" ? v(received) : v);
  const exact = () => setReceived(String(cashDue));
  const short = cashDue > 0 && (received === "" || Number(received) < cashDue);
  const itemsBlocked = mode === "items" && b.paid > 0;
  const invalid = charge < 1 || short || itemsBlocked || (method === "Mix" && (card < 1 || cash < 1));
  const pressKey = (key) => {
    setPicked(false);
    setReceivedRaw((current) => {
      if (key === "clear") return "";
      if (key === "back") return picked ? "" : current.slice(0, -1);
      const next = `${picked ? "" : current}${key}`.replace(/^0+(?=\d)/, "");
      return Number(next) <= 100000000 ? next : current;
    });
  };
  const pickMode = (m) => (setMode(m), setTyped(null));
  const pickParts = (n) => {
    const k = Math.min(20, Math.max(2, n));
    setParts(k);
    setShare(String(Math.ceil(due / k)));
  };
  const submit = (e) => {
    e.preventDefault();
    if (invalid) return;
    const payments = [
      ...(card ? [{ method: "Kartë", amount: card, ...(method !== "Cash" && tipValue ? { tip: tipValue } : {}) }] : []),
      ...(cash ? [{ method: "Cash", amount: cash, ...(method === "Cash" && tipValue ? { tip: tipValue } : {}) }] : []),
    ];
    // Two submit buttons share this form; which one fired decides whether the sale is
    // fiscalized right away or left for later (Faturat → "Fiskalizo Faturën").
    onSubmit(
      {
        payments,
        ...(cash ? { received: Number(received) } : {}),
        ...(mode === "items" && !everything ? { units: chosen.map((l) => ({ lineKey: l.key, qty: l.qty })) } : {}),
      },
      fiscalEnabled && e.nativeEvent.submitter?.value !== "skip-fiscalize",
    );
  };
  const left = due - charge;
  return (
    <form onSubmit={submit}>
      <div className="dialog-heading">
        <span className="dialog-icon">
          <Icon name={method === "Kartë" ? "card" : "cash"} size={25} />
        </span>
        <button type="button" className="icon-button" onClick={onCancel} aria-label="Anulo pagesën">
          <Icon name="close" />
        </button>
      </div>
      <h2 id="payment-title">Paguaj</h2>
      <p>{tableName(table)} · {b.paid > 0 ? `paguar deri tani ${money(b.paid)} · ` : ""}mbeten {money(due)}</p>
      <div className="payment-modes" role="group" aria-label="Si paguhet">
        {MODES.map(([k, label]) => <button key={k} type="button" aria-pressed={mode === k} onClick={() => pickMode(k)}>{label}</button>)}
      </div>
      {mode === "split" && (
        <div className="payment-split">
          <div className="payment-parts">
            <span>Në sa veta?</span>
            <div className="quantity">
              <button type="button" aria-label="Një më pak" disabled={parts <= 2} onClick={() => pickParts(parts - 1)}>−</button>
              <b>{parts}</b>
              <button type="button" aria-label="Një më shumë" disabled={parts >= 20} onClick={() => pickParts(parts + 1)}>+</button>
            </div>
          </div>
          <Field label="Kjo pjesë (Lek)" name="share" type="number" inputMode="numeric" min="1" max={due} step="1"
            value={share} onChange={(e) => setShare(e.target.value)} />
        </div>
      )}
      {mode === "items" && (
        itemsBlocked ? (
          <div className="info-note"><Icon name="info" size={18} /><p>Kjo llogari ka tashmë pagesa të pjesshme: paguani mbetjen te "Gjithçka" ose "Ndaj në pjesë".</p></div>
        ) : (
          <ul className="payment-items" aria-label="Artikujt që paguhen tani">
            {table.lines.filter((l) => l.qty - (l.comp || 0) > 0).map((l) => {
              const max = l.qty - (l.comp || 0), n = units[l.key] || 0;
              const set = (q) => setUnits({ ...units, [l.key]: Math.max(0, Math.min(max, q)) });
              return (
                <li key={l.key} className={n ? "is-picked" : ""}>
                  <button type="button" className="payment-item-name" onClick={() => set(n ? 0 : max)}>
                    <b>{l.name}</b><small>{max} × {money(l.price)}</small>
                  </button>
                  <div className="quantity">
                    <button type="button" aria-label={`Një ${l.name} më pak`} disabled={!n} onClick={() => set(n - 1)}>−</button>
                    <b>{n}</b>
                    <button type="button" aria-label={`Një ${l.name} më shumë`} disabled={n >= max} onClick={() => set(n + 1)}>+</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )
      )}
      <div className="payment-amount">
        <span>{mode === "full" ? "Për t’u paguar" : "Paguhet tani"}</span>
        <strong>{money(charge)}</strong>
      </div>
      <div className="payment-methods three" role="group" aria-label="Mënyra e pagesës">
        <button type="button" aria-pressed={method === "Cash"} onClick={() => (setMethod("Cash"), setTyped(null))}><Icon name="cash" size={18} /> Cash</button>
        <button type="button" aria-pressed={method === "Kartë"} onClick={() => (setMethod("Kartë"), setTyped(null))}><Icon name="card" size={18} /> Kartë</button>
        <button type="button" aria-pressed={method === "Mix"} aria-label="Të dyja: një pjesë cash, pjesa tjetër me kartë" onClick={() => (setMethod("Mix"), setTyped(null))}><Icon name="card" size={18} /> Të dyja</button>
      </div>
      {method === "Mix" && (
        <div className="payment-mix">
          <Field label="Me kartë (Lek)" name="cardPart" type="number" inputMode="numeric" min="1" max={Math.max(1, charge - 1)} step="1"
            value={cardPart} onChange={(e) => setCardPart(e.target.value)} placeholder="p.sh. 500" />
          <p>Cash: <b>{money(cash)}</b></p>
        </div>
      )}
      {showTip ? (
        <Field label="Bakshish (opsional, Lek)" name="tip" type="number" inputMode="numeric" min="0" step="1"
          value={tip} onChange={(e) => setTip(e.target.value)} placeholder="0" />
      ) : (
        <button type="button" className="link-button payment-tip-add" onClick={() => setShowTip(true)}>+ Bakshish</button>
      )}
      {cashDue > 0 ? (
        <>
          <Field
            label={`Cash i marrë (Lek) · duhen ${money(cashDue)}`}
            name="received"
            type="number"
            inputMode="numeric"
            min={cashDue}
            max="100000000"
            step="1"
            required
            value={received}
            onChange={(e) => (setTyped(e.target.value), setPicked(false))}
            placeholder={String(cashDue)}
          />
          <div className="cash-quick" role="group" aria-label="Shuma të shpejta">
            {quickCash(cashDue).map((v) => (
              <button type="button" key={v} aria-pressed={Number(received) === v} onClick={() => setReceived(String(v))}>
                {v === cashDue ? "Saktë" : amount(v)}
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
            <strong>{money(Math.max(0, Number(received) - cashDue))}</strong>
          </div>
          {received !== String(cashDue) && short && <button type="button" className="link-button" onClick={exact}>Vendos shumën e saktë</button>}
        </>
      ) : (
        <div className="info-note">
          <Icon name="info" size={18} />
          <p>Konfirmoni vetëm pasi pagesa të jetë kryer në terminalin e kartës.</p>
        </div>
      )}
      <p className="helper">
        {mode === "items"
          ? "Artikujt e zgjedhur dalin në një faturë më vete; pjesa tjetër mbetet në tavolinë."
          : left > 0
            ? `Tavolina mbetet e hapur me ${money(left)} për t’u paguar. Fatura del me pagesën e fundit.`
            : "Pagesa mbyll porosinë dhe liron tavolinën. Pas konfirmimit mund të printoni faturën."}
      </p>
      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>Kthehu</button>
        <button value="skip-fiscalize" className={fiscalEnabled ? undefined : "primary"} disabled={invalid}>
          <Icon name="check" size={17} />
          Konfirmo
        </button>
        {fiscalEnabled && (
          <button className="primary" value="fiscalize" disabled={invalid}>
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
      {invoice.fiscalStatus === "fiskalizuar" ? (
        <p className="helper warning-text">
          Kjo faturë është fiskalizuar{invoice.fiscalIic ? ` (NIVF ${invoice.fiscalIic})` : ""}: rimbursimi duhet deklaruar te tatimet me një
          faturë korrigjuese. BlueBill nuk e lëshon ende vetë — lëshojeni te BlueBill ose nga kontabilisti. Fatura do të mbajë shënimin
          "kërkon korrigjim". Stoku nuk kthehet vetë.
        </p>
      ) : (
        <p className="helper">Stoku nuk kthehet vetë. Fatura nuk është fiskalizuar, ndaj nuk ka gjë për të deklaruar te tatimet.</p>
      )}
      <div className="actions">
        <button type="button" onClick={() => setOpen(false)}>Anulo</button>
        <button className="primary">Rimburso</button>
      </div>
    </form>
  );
}
