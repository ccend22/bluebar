import { useEffect, useState } from "react";
import { store, unit } from "./text.js";

// Ordering from the menu: can this table order, the basket (kept for the tab's life),
// sending, and following the latest order until a waiter decides it.
export function useOrder({ slug, table, tableKey, menu, t, lang }) {
  const cartKey = `menu-cart:${slug}:${table}`;
  const ordersKey = `menu-orders:${slug}:${table}`;
  const [tableState, setTableState] = useState(null);
  const [cart, setCart] = useState(() => store.get(cartKey, []));
  const [placed, setPlaced] = useState(() => store.get(ordersKey, []));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (!menu?.ordering || !table) return;
    fetch(`/api/menu/${encodeURIComponent(slug)}/table/${table}?k=${encodeURIComponent(tableKey)}`)
      .then((r) => r.json())
      .then(setTableState)
      .catch(() => setTableState({ open: false }));
  }, [menu?.ordering]);
  useEffect(() => store.set(cartKey, cart), [cart]);
  useEffect(() => store.set(ordersKey, placed), [placed]);
  const latest = placed.at(-1);
  // Follow every order still waiting for a waiter (normally none: orders go straight through).
  const waiting = placed.filter((o) => o.status === "pending").map((o) => o.id).join();
  useEffect(() => {
    if (!waiting) return;
    const poll = async () => {
      for (const o of placed.filter((x) => x.status === "pending")) {
        const r = await fetch(`/api/menu/${encodeURIComponent(slug)}/orders/${o.id}?token=${encodeURIComponent(o.token)}`).catch(() => null);
        if (!r?.ok) continue;
        const { status, reason } = await r.json();
        if (status !== "pending") setPlaced((list) => list.map((x) => (x.id === o.id ? { ...x, status, reason } : x)));
      }
    };
    const timer = setInterval(poll, 4000);
    poll();
    return () => clearInterval(timer);
  }, [waiting]);

  const productOf = (id) => menu?.products.find((p) => p.id === id);
  // A product that left the menu (or ran out) since it went in the basket drops out of it.
  const lines = cart.filter((l) => productOf(l.productId)?.available);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + l.qty * unit(productOf(l.productId), l.extras), 0);
  const add = (product, { qty = 1, extras = [], note = "" } = {}) => {
    setCart((list) => {
      const same = list.find((l) => l.productId === product.id && l.note === note && l.extras.join() === extras.join());
      return same
        ? list.map((l) => (l === same ? { ...l, qty: Math.min(20, l.qty + qty) } : l))
        : [...list, { uid: crypto.randomUUID(), productId: product.id, qty, extras, note }];
    });
    setBump((n) => n + 1);
    navigator.vibrate?.(8);
  };
  const setQty = (uid, qty) =>
    setCart((list) => (qty < 1 ? list.filter((l) => l.uid !== uid) : list.map((l) => (l.uid === uid ? { ...l, qty } : l))));
  async function send(note) {
    setSending(true);
    setError("");
    try {
      const r = await fetch(`/api/menu/${encodeURIComponent(slug)}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-BlueBar-Client": "1" },
        body: JSON.stringify({
          table, key: tableKey, note,
          items: lines.map(({ productId, qty, extras, note }) => ({ productId, qty, extras, ...(note ? { note } : {}) })),
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        const byStatus = { 403: t.scan, 404: t.unavailable, 409: t.changed, 429: t.tooMany };
        throw new Error((lang === "sq" && body.error) || byStatus[r.status] || body.error || t.unavailable);
      }
      // What was sent, kept on this phone so the guest can look back at their orders.
      const items = lines.map(({ productId, qty, extras, note }) => ({ productId, qty, extras, note }));
      setPlaced((list) => [...list, { id: body.id, token: body.token, status: body.status || "pending", items, total, at: new Date().toISOString() }]);
      setCart([]);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setSending(false);
    }
  }
  const dismiss = () => setPlaced((list) => list.map((o) => (o.id === latest.id ? { ...o, dismissed: true } : o)));
  return {
    canOrder: Boolean(menu?.ordering && tableState?.open),
    tableState, lines, count, total, bump, add, setQty, send, sending, error, latest, dismiss, productOf, placed,
  };
}
