// Words, formatting and small helpers shared by the guest menu's components.
// Form labels (TAVOLINA, SASIA…) are printed on the pad: short, in capitals.
export const TEXT = {
  sq: {
    table: "Tavolina", time: "Ora", qty: "Sasia", item: "Artikulli", price: "Çmimi", total: "Gjithsej",
    soldOut: "Mbaruar", extras: "Shtesa", note: "Shënim për kuzhinën", notePlaceholder: "Opsionale",
    orderNote: "Shënim për porosinë", orderNotePlaceholder: "p.sh. sillni pijet së pari",
    add: "Shto", remove: "Hiq", less: "Një më pak", more: "Një më shumë",
    check: "Porosia", checkOpen: "Hap porosinë", send: "Dërgo porosinë", sending: "Po dërgohet…",
    sentToast: "Porosia u dërgua në bar dhe kuzhinë", sentHint: "Porosia shkon direkt në bar dhe kuzhinë. Pagesa bëhet te kamarieri, si zakonisht.",
    copies: "Porositë e mia", copiesHint: "Kopjet e porosive nga ky telefon. Për llogarinë dhe pagesën, thërrisni kamarierin.",
    soFar: "Gjithsej deri tani", estimate: "Çmimi përfundimtar është ai i faturës.",
    stampSent: "Dërguar", stampWaiting: "Në pritje", stampRejected: "Nuk u pranua",
    waiting: "Porosia pret kamarierin", accepted: "Porosia u pranua dhe po përgatitet", rejected: "Porosia nuk u pranua",
    empty: "Porosia është bosh. Prekni kutinë e sasisë te një artikull.",
    unavailable: "Menuja nuk është e disponueshme për momentin.", retry: "Provo përsëri", prices: "Çmimet janë në Lek, me TVSH.",
    close: "Mbyll", categories: "Kategoritë", language: "Gjuha", collapse: "Mbyll artikullin",
    scan: "Për të porositur, skanoni kodin QR në tavolinën tuaj.", orderingOff: "Porositë nga menuja nuk janë aktive tani.",
    venueClosed: "Lokali nuk merr porosi tani. Thërrisni kamarierin.",
    tooMany: "Shumë porosi nga kjo tavolinë. Thërrisni kamarierin.", changed: "Diçka ndryshoi në menu. Rifreskoni dhe provoni sërish.",
    inOrder: (n) => `${n} në porosi`,
  },
  en: {
    table: "Table", time: "Time", qty: "Qty", item: "Item", price: "Price", total: "Total",
    soldOut: "Sold out", extras: "Extras", note: "Note for the kitchen", notePlaceholder: "Optional",
    orderNote: "Note for the order", orderNotePlaceholder: "e.g. bring the drinks first",
    add: "Add", remove: "Remove", less: "One less", more: "One more",
    check: "Your order", checkOpen: "Open your order", send: "Send order", sending: "Sending…",
    sentToast: "Order sent to the bar and kitchen", sentHint: "Your order goes straight to the bar and kitchen. You pay the waiter, as usual.",
    copies: "My orders", copiesHint: "Copies of the orders from this phone. For the bill and payment, ask your waiter.",
    soFar: "Total so far", estimate: "The final price is the one on your bill.",
    stampSent: "Sent", stampWaiting: "Waiting", stampRejected: "Not accepted",
    waiting: "Your order is waiting for the waiter", accepted: "Order accepted and being prepared", rejected: "Order not accepted",
    empty: "Your order is empty. Tap the quantity box on any item.",
    unavailable: "The menu isn't available right now.", retry: "Try again", prices: "Prices are in Albanian Lek (ALL), VAT included.",
    close: "Close", categories: "Categories", language: "Language", collapse: "Close item",
    scan: "To order, scan the QR code on your table.", orderingOff: "Ordering from the menu is off right now.",
    venueClosed: "The venue isn't taking orders right now. Please ask your waiter.",
    tooMany: "Too many orders from this table. Please ask your waiter.", changed: "Something on the menu changed. Please refresh and try again.",
    inOrder: (n) => `${n} in your order`,
  },
};
export const price = (n) => `${new Intl.NumberFormat("sq-AL").format(n)} Lek`;
// What one unit costs: the product plus its chosen extras. (An estimate: the server prices it.)
export const unit = (product, extras) =>
  product.price + product.extras.filter((x) => extras.includes(x.name)).reduce((s, x) => s + x.price, 0);
export const clock = (date) => new Date(date).toLocaleTimeString("sq-AL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export const store = {
  get(key, fallback) {
    try { return JSON.parse(sessionStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
};
