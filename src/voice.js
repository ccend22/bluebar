// Ordering by voice: what the guest said ("1 birrë Peroni, 2 makiato, 2 ujë") into menu
// products and quantities. Only what is on the menu comes back; anything else is dropped.
// Pure, so it is tested on its own (voice.test.js).

// Numbers as guests say them, in the menu's six languages (after plain(): no marks).
const NUMBERS = {
  nje: 1, dy: 2, tre: 3, kater: 4, pese: 5, gjashte: 6, shtate: 7, tete: 8, nente: 9, dhjete: 10,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  uno: 1, una: 1, due: 2, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10,
  ein: 1, eine: 1, einen: 1, zwei: 2, drei: 3, vier: 4, funf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8, neuf: 9, dix: 10,
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
};
// Words that only join items: "… dhe 2 ujë", "… and a water".
const JOINS = new Set(["dhe", "edhe", "and", "und", "et", "y", "plus", ",",
  // Asking for something starts a new item too: "2 ujë doja makiato".
  "dua", "doja", "desha", "duam", "sill", "sillni", "jep", "jepni", "merr", "merrni", "want", "wanted", "bring"]);

// Lower case, no marks: "Birrë" → "birre".
export const plain = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// How a word sounds, roughly: "macchiato" and "makiato", "cappuccino" and "kapucino" agree.
const sound = (w) =>
  w.replace(/cch|ch|ck|q/g, "k").replace(/c/g, "k").replace(/ph/g, "f").replace(/(.)\1+/g, "$1");
// Words, with a pause in writing (comma, full stop…) kept as "," so it can end an item.
const words = (s) => plain(s).replace(/[,.;!?]+/g, " , ").replace(/[^a-z0-9,]+/g, " ").trim().split(" ").filter(Boolean);

// 1 for the same word, falling towards 0 the more letters differ (Levenshtein).
function similar(a, b) {
  if (a === b) return 1;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = keep;
    }
  }
  return 1 - row[b.length] / Math.max(a.length, b.length);
}

// Albanian endings change with the sentence: "ujë", "ujin", "ujët" are all water. Compared
// without them too (only when enough of the word is left).
const stem = (w) => {
  const cut = w.replace(/(in|un|en|et|at|it|ra|t|n|a|e)$/, "");
  return cut.length >= 2 ? cut : w;
};
const close = (w, t) => Math.max(similar(w, t), similar(stem(w), stem(t)));

// How well a spoken phrase names a product: the share of the name's words heard. Short
// words must be heard exactly; longer ones may be a letter or two off.
function score(said, name) {
  const target = words(name).filter((w) => w !== ",").map(sound);
  if (!target.length) return 0;
  let total = 0;
  for (const t of target) {
    const best = Math.max(0, ...said.map((w) => close(w, t)));
    if (best >= (t.length <= 3 ? 1 : 0.8)) total += best;
  }
  return total / target.length;
}

// Corrections, said the way a waiter says them: "doja makiato jo ujë" (macchiato, not water),
// "1 birrë korça… jo, peroni" (not Korça: Peroni), "hiq ujin" (take the water off).
const NOT = new Set(["jo", "no", "not", "nein", "non"]);
const REMOVE = new Set(["hiq", "fshi", "anulo", "remove", "cancel"]);

function bestProduct(said, products) {
  let best = null;
  for (const p of products) {
    const names = [p.name, ...Object.values(p.i18n || {}).map((x) => x?.name)].filter(Boolean);
    const s = Math.max(...names.map((name) => score(said, name)));
    // A tie goes to the shorter name: "birrë" is the plain beer, not every beer.
    if (s >= 0.5 && (!best || s > best.s || (s === best.s && p.name.length < best.p.name.length))) best = { p, s };
  }
  return best?.p;
}

// The whole phrase, read in order as a list of actions on the order. Each piece starts at a
// number, a joining word or a correction word and runs to the next; every name a product has
// (Albanian and its translations) is tried.
export function parseOrder(text, products) {
  const pieces = [];
  let current = null;
  let mode = "add";
  for (const w of words(text)) {
    const n = /^\d+$/.test(w) ? Number(w) : NUMBERS[w];
    if (n) (current = { qty: n, explicit: true, said: [], mode }), pieces.push(current), (mode = "add");
    else if (JOINS.has(w)) current = null;
    else if (NOT.has(w) || REMOVE.has(w)) (current = null), (mode = NOT.has(w) ? "not" : "remove");
    else {
      if (!current) (current = { qty: 1, explicit: false, said: [], mode }), pieces.push(current), (mode = "add");
      current.said.push(sound(w));
    }
  }
  const order = new Map();
  const put = (p, qty) => {
    const left = (order.get(p.id)?.qty || 0) + qty;
    if (left > 0) order.set(p.id, { product: p, qty: Math.min(20, left) });
    else order.delete(p.id);
  };
  let last = null; // the piece just added: what a "jo" right after it corrects
  for (const piece of pieces) {
    const p = piece.said.length && bestProduct(piece.said, products);
    if (!p) continue;
    if (piece.mode === "add") (put(p, piece.qty), (last = { p, qty: piece.qty, explicit: piece.explicit }));
    else if (piece.mode === "remove") (order.delete(p.id), (last = null));
    else if (order.has(p.id)) {
      // "… makiato jo ujë": the water goes; the macchiato takes its quantity unless one was said.
      const was = order.get(p.id).qty;
      order.delete(p.id);
      if (last && last.p.id !== p.id && !last.explicit) put(last.p, was - last.qty);
      last = null;
    } else if (last) {
      // "1 birrë korça jo, peroni": Peroni in place of Korça, same quantity unless one was said.
      put(last.p, -last.qty);
      const qty = piece.explicit ? piece.qty : last.qty;
      put(p, qty);
      last = { p, qty, explicit: true };
    }
  }
  return [...order.values()];
}
