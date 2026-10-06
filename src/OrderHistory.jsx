import React, { useEffect, useState } from "react";
import { fetchInvoiceHistory, fetchTableHistory } from "./api.js";

const time = (v) => new Date(v).toLocaleTimeString("sq-AL", { hour: "2-digit", minute: "2-digit", hour12: false });
const LABELS = { add: "Shtoi", remove: "Hoqi", void: "Anulim", send: "Dërgim", assign: "Kalim", cancel: "Anulim", pay: "Pagesë" };

// Who changed what in an order, and when: an open table's (tableId) or a paid invoice's.
// refreshKey reloads it when the order changes while it's open.
export function OrderHistory({ tableId, invoiceId, refreshKey }) {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    (invoiceId ? fetchInvoiceHistory(invoiceId) : fetchTableHistory(tableId))
      .then((e) => alive && (setEvents(e), setError("")))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [tableId, invoiceId, refreshKey]);
  if (error) return <p className="helper">{error}</p>;
  if (!events) return <p className="helper">Po ngarkohet…</p>;
  if (!events.length) return <p className="helper">Ende pa ndryshime të regjistruara.</p>;
  return (
    <ol className="order-history">
      {events.map((e, i) => (
        <li key={i} className={e.kind === "void" || e.kind === "cancel" ? "warn" : ""}>
          <time>{time(e.date)}</time>
          <div>
            <strong>{LABELS[e.kind]}</strong> {e.detail}
            {e.actor && <small>{e.actor}</small>}
          </div>
        </li>
      ))}
    </ol>
  );
}
