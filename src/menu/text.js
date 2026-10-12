// Words, formatting and small helpers shared by the guest menu's components.
// Form labels (TAVOLINA, SASIA…) are printed on the pad: short, in capitals.
export const TEXT = {
  sq: {
    search: "Kërko në menu…", noResults: "Asnjë produkt nuk përputhet.",
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
    search: "Search the menu…", noResults: "No product matches.",
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
    pricesEur: (r) => `Prices in euro at 1 € = ${r} Lek, VAT included. The bill is in Lek.`,
    close: "Close", categories: "Categories", language: "Language", collapse: "Close item",
    scan: "To order, scan the QR code on your table.", orderingOff: "Ordering from the menu is off right now.",
    venueClosed: "The venue isn't taking orders right now. Please ask your waiter.",
    tooMany: "Too many orders from this table. Please ask your waiter.", changed: "Something on the menu changed. Please refresh and try again.",
    inOrder: (n) => `${n} in your order`,
  },
  it: {
    search: "Cerca nel menu…", noResults: "Nessun prodotto trovato.",
    table: "Tavolo", time: "Ora", qty: "Qtà", item: "Articolo", price: "Prezzo", total: "Totale",
    soldOut: "Esaurito", extras: "Extra", note: "Nota per la cucina", notePlaceholder: "Facoltativa",
    orderNote: "Nota per l’ordine", orderNotePlaceholder: "es. portate prima le bevande",
    add: "Aggiungi", remove: "Rimuovi", less: "Uno in meno", more: "Uno in più",
    check: "Il tuo ordine", checkOpen: "Apri il tuo ordine", send: "Invia ordine", sending: "Invio…",
    sentToast: "Ordine inviato al bar e alla cucina", sentHint: "L’ordine va direttamente al bar e alla cucina. Si paga al cameriere, come sempre.",
    copies: "I miei ordini", copiesHint: "Copie degli ordini da questo telefono. Per il conto e il pagamento, chiedete al cameriere.",
    soFar: "Totale finora", estimate: "Il prezzo finale è quello del conto.",
    stampSent: "Inviato", stampWaiting: "In attesa", stampRejected: "Non accettato",
    waiting: "L’ordine attende il cameriere", accepted: "Ordine accettato, in preparazione", rejected: "Ordine non accettato",
    empty: "L’ordine è vuoto. Toccate la casella della quantità su un prodotto.",
    unavailable: "Il menu non è disponibile al momento.", retry: "Riprova", prices: "Prezzi in Lek albanesi (ALL), IVA inclusa.",
    pricesEur: (r) => `Prezzi in euro al cambio 1 € = ${r} Lek, IVA inclusa. Il conto è in Lek.`,
    close: "Chiudi", categories: "Categorie", language: "Lingua", collapse: "Chiudi prodotto",
    scan: "Per ordinare, scansionate il codice QR sul vostro tavolo.", orderingOff: "Gli ordini dal menu non sono attivi ora.",
    venueClosed: "Il locale non accetta ordini ora. Chiedete al cameriere.",
    tooMany: "Troppi ordini da questo tavolo. Chiedete al cameriere.", changed: "Qualcosa nel menu è cambiato. Aggiornate e riprovate.",
    inOrder: (n) => `${n} nell’ordine`,
  },
  de: {
    search: "In der Karte suchen…", noResults: "Kein Produkt gefunden.",
    table: "Tisch", time: "Zeit", qty: "Menge", item: "Artikel", price: "Preis", total: "Gesamt",
    soldOut: "Ausverkauft", extras: "Extras", note: "Hinweis für die Küche", notePlaceholder: "Optional",
    orderNote: "Hinweis zur Bestellung", orderNotePlaceholder: "z. B. Getränke zuerst bringen",
    add: "Hinzufügen", remove: "Entfernen", less: "Eins weniger", more: "Eins mehr",
    check: "Ihre Bestellung", checkOpen: "Bestellung öffnen", send: "Bestellung senden", sending: "Wird gesendet…",
    sentToast: "Bestellung an Bar und Küche gesendet", sentHint: "Ihre Bestellung geht direkt an Bar und Küche. Bezahlt wird wie gewohnt beim Kellner.",
    copies: "Meine Bestellungen", copiesHint: "Kopien der Bestellungen von diesem Telefon. Für Rechnung und Zahlung fragen Sie den Kellner.",
    soFar: "Bisher gesamt", estimate: "Maßgeblich ist der Preis auf Ihrer Rechnung.",
    stampSent: "Gesendet", stampWaiting: "Wartet", stampRejected: "Nicht angenommen",
    waiting: "Ihre Bestellung wartet auf den Kellner", accepted: "Bestellung angenommen, wird zubereitet", rejected: "Bestellung nicht angenommen",
    empty: "Ihre Bestellung ist leer. Tippen Sie auf das Mengenfeld eines Produkts.",
    unavailable: "Die Speisekarte ist gerade nicht verfügbar.", retry: "Erneut versuchen", prices: "Preise in albanischen Lek (ALL), inkl. MwSt.",
    pricesEur: (r) => `Preise in Euro zum Kurs 1 € = ${r} Lek, inkl. MwSt. Die Rechnung ist in Lek.`,
    close: "Schließen", categories: "Kategorien", language: "Sprache", collapse: "Produkt schließen",
    scan: "Zum Bestellen scannen Sie den QR-Code auf Ihrem Tisch.", orderingOff: "Bestellen über die Karte ist gerade nicht möglich.",
    venueClosed: "Das Lokal nimmt gerade keine Bestellungen an. Bitte fragen Sie den Kellner.",
    tooMany: "Zu viele Bestellungen von diesem Tisch. Bitte fragen Sie den Kellner.", changed: "Die Karte hat sich geändert. Bitte neu laden und erneut versuchen.",
    inOrder: (n) => `${n} in der Bestellung`,
  },
  fr: {
    search: "Rechercher dans le menu…", noResults: "Aucun produit trouvé.",
    table: "Table", time: "Heure", qty: "Qté", item: "Article", price: "Prix", total: "Total",
    soldOut: "Épuisé", extras: "Suppléments", note: "Note pour la cuisine", notePlaceholder: "Facultatif",
    orderNote: "Note pour la commande", orderNotePlaceholder: "ex. apportez d’abord les boissons",
    add: "Ajouter", remove: "Retirer", less: "Un de moins", more: "Un de plus",
    check: "Votre commande", checkOpen: "Ouvrir votre commande", send: "Envoyer la commande", sending: "Envoi…",
    sentToast: "Commande envoyée au bar et à la cuisine", sentHint: "Votre commande part directement au bar et en cuisine. Vous payez le serveur, comme d’habitude.",
    copies: "Mes commandes", copiesHint: "Copies des commandes de ce téléphone. Pour l’addition et le paiement, demandez au serveur.",
    soFar: "Total jusqu’ici", estimate: "Le prix final est celui de l’addition.",
    stampSent: "Envoyée", stampWaiting: "En attente", stampRejected: "Refusée",
    waiting: "Votre commande attend le serveur", accepted: "Commande acceptée, en préparation", rejected: "Commande refusée",
    empty: "Votre commande est vide. Touchez la case de quantité d’un produit.",
    unavailable: "Le menu n’est pas disponible pour le moment.", retry: "Réessayer", prices: "Prix en leks albanais (ALL), TVA comprise.",
    pricesEur: (r) => `Prix en euros au taux 1 € = ${r} Lek, TVA comprise. L’addition est en leks.`,
    close: "Fermer", categories: "Catégories", language: "Langue", collapse: "Fermer le produit",
    scan: "Pour commander, scannez le code QR de votre table.", orderingOff: "La commande depuis le menu est désactivée pour le moment.",
    venueClosed: "L’établissement ne prend pas de commandes pour le moment. Demandez au serveur.",
    tooMany: "Trop de commandes pour cette table. Demandez au serveur.", changed: "Le menu a changé. Actualisez et réessayez.",
    inOrder: (n) => `${n} dans la commande`,
  },
  es: {
    search: "Buscar en el menú…", noResults: "Ningún producto coincide.",
    table: "Mesa", time: "Hora", qty: "Cant.", item: "Artículo", price: "Precio", total: "Total",
    soldOut: "Agotado", extras: "Extras", note: "Nota para la cocina", notePlaceholder: "Opcional",
    orderNote: "Nota para el pedido", orderNotePlaceholder: "p. ej. traed primero las bebidas",
    add: "Añadir", remove: "Quitar", less: "Uno menos", more: "Uno más",
    check: "Tu pedido", checkOpen: "Abrir tu pedido", send: "Enviar pedido", sending: "Enviando…",
    sentToast: "Pedido enviado al bar y a la cocina", sentHint: "Tu pedido va directo al bar y a la cocina. Pagas al camarero, como siempre.",
    copies: "Mis pedidos", copiesHint: "Copias de los pedidos de este teléfono. Para la cuenta y el pago, pregunta al camarero.",
    soFar: "Total hasta ahora", estimate: "El precio final es el de la cuenta.",
    stampSent: "Enviado", stampWaiting: "En espera", stampRejected: "No aceptado",
    waiting: "Tu pedido espera al camarero", accepted: "Pedido aceptado, en preparación", rejected: "Pedido no aceptado",
    empty: "Tu pedido está vacío. Toca la casilla de cantidad de un producto.",
    unavailable: "El menú no está disponible ahora.", retry: "Reintentar", prices: "Precios en lek albaneses (ALL), IVA incluido.",
    pricesEur: (r) => `Precios en euros al cambio 1 € = ${r} Lek, IVA incluido. La cuenta es en lek.`,
    close: "Cerrar", categories: "Categorías", language: "Idioma", collapse: "Cerrar producto",
    scan: "Para pedir, escanea el código QR de tu mesa.", orderingOff: "Los pedidos desde el menú no están activos ahora.",
    venueClosed: "El local no acepta pedidos ahora. Pregunta al camarero.",
    tooMany: "Demasiados pedidos desde esta mesa. Pregunta al camarero.", changed: "Algo cambió en el menú. Recarga y vuelve a intentarlo.",
    inOrder: (n) => `${n} en tu pedido`,
  },
};
// The languages a guest can pick, each in its own words.
export const LANGS = { sq: "Shqip", en: "English", it: "Italiano", de: "Deutsch", fr: "Français", es: "Español" };
// Prices: Lek, or for a foreign guest (when the venue turned it on) euro at the venue's
// rate, rounded to the cent. money() gives the text; flow() the props of a NumberFlow.
export function currency(lang, euroRate) {
  const eur = lang !== "sq" && euroRate > 0;
  const value = (lek) => (eur ? Math.round((lek / euroRate) * 100) / 100 : lek);
  const format = eur ? { style: "currency", currency: "EUR" } : { maximumFractionDigits: 0 };
  const locales = eur ? lang : "sq-AL";
  return {
    money: (lek) => (eur ? new Intl.NumberFormat(locales, format).format(value(lek)) : `${new Intl.NumberFormat("sq-AL").format(lek)} Lek`),
    flow: (lek) => ({ value: value(lek), locales, format, ...(!eur && { suffix: " Lek" }) }),
    priceNote: eur ? TEXT[lang].pricesEur(new Intl.NumberFormat(locales).format(euroRate)) : TEXT[lang].prices,
  };
}
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
