// Words, formatting and small helpers shared by the guest menu's components.
export const TEXT = {
  sq: {
    table: "Tavolina", soldOut: "Mbaruar", extras: "Shtesa", unavailable: "Menuja nuk është e disponueshme për momentin.",
    retry: "Provo përsëri", prices: "Çmimet janë në Lek, me TVSH.", close: "Mbyll", categories: "Kategoritë",
    add: "Shto", yourOrder: "Porosia juaj", view: "Shiko porosinë",
    note: "Shënim për kuzhinën", notePlaceholder: "Opsionale", orderNotePlaceholder: "p.sh. sillni pijet së pari", orderNote: "Shënim për porosinë", total: "Totali",
    send: "Dërgo porosinë", sending: "Po dërgohet…", confirmHint: "Porosia shkon direkt në bar dhe kuzhinë. Pagesa bëhet te kamarieri, si zakonisht.",
    pending: "Kamarieri po e konfirmon porosinë", accepted: "Porosia u dërgua dhe po përgatitet", rejected: "Porosia nuk u pranua",
    sent: "Porosia u dërgua", orderMore: "Vazhdo me menunë", scan: "Për të porositur, skanoni kodin QR në tavolinën tuaj.",
    empty: "Porosia është bosh.", myOrders: "Porositë e mia", orderingOff: "Porositë nga menuja nuk janë aktive tani.", venueClosed: "Lokali nuk merr porosi tani. Thërrisni kamarierin.", myOrdersHint: "Gjithçka që keni porositur nga ky telefon. Për llogarinë dhe pagesën, thërrisni kamarierin.", soFar: "Totali deri tani", estimate: "Çmimi përfundimtar është ai i faturës.", orderNo: "Porosia", stateSent: "Dërguar", stateWaiting: "Në pritje", stateRejected: "Nuk u pranua", less: "Një më pak", more: "Një më shumë", collapse: "Mbyll pjatën", language: "Gjuha",
  },
  en: {
    table: "Table", soldOut: "Sold out", extras: "Extras", unavailable: "The menu isn't available right now.",
    retry: "Try again", prices: "Prices are in Albanian Lek (ALL), VAT included.", close: "Close", categories: "Categories",
    add: "Add", yourOrder: "Your order", view: "View order",
    note: "Note for the kitchen", notePlaceholder: "Optional", orderNotePlaceholder: "e.g. bring the drinks first", orderNote: "Note for the order", total: "Total",
    send: "Send order", sending: "Sending…", confirmHint: "Your order goes straight to the bar and kitchen. You pay the waiter, as usual.",
    pending: "Your waiter is confirming the order", accepted: "Order sent — it's being prepared", rejected: "Order not accepted",
    sent: "Order sent", orderMore: "Back to the menu", scan: "To order, scan the QR code on your table.",
    empty: "Your order is empty.", myOrders: "My orders", orderingOff: "Ordering from the menu is off right now.", venueClosed: "The venue isn't taking orders right now. Please ask your waiter.", tooMany: "Too many orders from this table. Please ask your waiter.", changed: "Something on the menu changed. Please refresh and try again.", myOrdersHint: "Everything you ordered from this phone. For the bill and payment, ask your waiter.", soFar: "Total so far", estimate: "The final price is the one on your bill.", orderNo: "Order", stateSent: "Sent", stateWaiting: "Waiting", stateRejected: "Not accepted", less: "One less", more: "One more", collapse: "Close dish", language: "Language",
  },
};
export const price = (n) => `${new Intl.NumberFormat("sq-AL").format(n)} Lek`;
// What one unit costs: the product plus its chosen extras. (An estimate: the server prices it.)
export const unit = (product, extras) =>
  product.price + product.extras.filter((x) => extras.includes(x.name)).reduce((s, x) => s + x.price, 0);
export const store = {
  get(key, fallback) {
    try { return JSON.parse(sessionStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
};
export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
