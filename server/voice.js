// A waiter's spoken order, understood by Gemini in one step: the recording plus the menu in,
// what was said and which menu products (with quantities, corrections applied) out.
// GEMINI_MODEL picks the model; no key, no voice ordering (the mic says so). Measured on an
// Albanian order with a spoken correction: gemini-3.5-flash with minimal thinking gets it right
// in ~1.7 s (~9 s thinking freely); the "lite" models get the correction wrong.
const SCHEMA = {
  type: "OBJECT",
  properties: {
    heard: { type: "STRING" },
    items: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { id: { type: "INTEGER" }, qty: { type: "INTEGER" } }, required: ["id", "qty"] },
    },
  },
  required: ["heard", "items"],
};

const instructions = (menu) => `A waiter in a bar or restaurant in Albania is speaking an order, mostly in Albanian;
product names may be said in Italian or English, and pronounced loosely ("makiato" is Macchiato).

1. "heard": write down exactly what the waiter said, in the language they said it.
2. "items": the products ordered, using ONLY the ids from the menu below, each with its quantity.
   - Quantities may be digits or words: një 1, dy 2, tre 3, katër 4, pesë 5, gjashtë 6, shtatë 7, tetë 8, nëntë 9, dhjetë 10. No number means 1.
   - Apply the waiter's corrections: "jo", "hiq", "fshi", "në vend të". "doja makiato jo ujë" means macchiato instead of the water,
     with the water's quantity unless another was said; "1 birrë korça… jo, peroni" means Peroni instead of Korça; "hiq ujin" removes the water.
   - The same product said twice adds up.
   - Leave out anything that is not on the menu. Never guess an id that was not said.
3. If the recording is silent, noise, or you cannot clearly make out an order, return "heard": "" and "items": [].
   Never invent an order: a wrong item reaches the kitchen.

Menu (id: name):
${menu}`;

// Gemini 2.x takes a thinking budget, 3.x a thinking level.
const QUICK = (model) => (/^gemini-2/.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: "minimal" });

// One structured Gemini answer: parts in, JSON matching the schema out.
async function gemini(key, model, fetchImpl, parts, schema, timeout) {
  const ask = (thinking) =>
    fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: schema, ...(thinking && { thinkingConfig: thinking }) },
      }),
      signal: AbortSignal.timeout(timeout),
    });
  let response = await ask(QUICK(model));
  // A model that doesn't take that setting: ask again with its default (slower, still right).
  if (response.status === 400) response = await ask(null);
  if (!response.ok) {
    // Google's reason (quota, region, key…) for the server log; the user sees only the status.
    const reason = await response.json().then((b) => b.error?.message, () => "");
    throw Object.assign(new Error(`Gemini ${response.status}: ${String(reason || "").slice(0, 300)}`), { status: response.status });
  }
  const out = (await response.json()).candidates?.[0]?.content?.parts || [];
  return JSON.parse(out.map((p) => p.text || "").join(""));
}

export function geminiVoice(key, { model = process.env.GEMINI_MODEL || "gemini-3.5-flash", fetchImpl = fetch } = {}) {
  if (!key) return null;
  return ({ audio, mime, products }) => {
    const menu = products.map((p) => `${p.id}: ${p.name}`).join("\n");
    return gemini(key, model, fetchImpl, [{ text: instructions(menu) }, { inline_data: { mime_type: mime, data: audio } }], SCHEMA, 20000);
  };
}

// Produktet → "Shto shumë" → "Nga një foto": a photo of a printed menu (or a board) read into
// rows for the import table, which the manager checks before anything is saved.
const MENU_SCHEMA = {
  type: "OBJECT",
  properties: {
    products: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { name: { type: "STRING" }, price: { type: "NUMBER" }, category: { type: "STRING" } },
        required: ["name", "price", "category"],
      },
    },
  },
  required: ["products"],
};

const MENU_INSTRUCTIONS = `This is a menu from a bar, café or restaurant in Albania: a photo of it, or its text copied from somewhere.
List every item on it with its price, in the order they appear.
- "name": the item's name exactly as written (keep the menu's language and spelling; fix only obvious OCR-style slips).
- "price": the price as a number, in Lek. "1.200" or "1,200" is 1200. If an item has two sizes or prices, list it twice
  with the size in the name ("Birrë Korça 0.33", "Birrë Korça 0.5").
- "category": the heading the item is listed under ("Kafe", "Pije freskuese", "Pica"…); if there is none, a short sensible one in Albanian.
Leave out anything with no readable price, and descriptions, addresses, opening hours. Never invent items or prices.
If it is not a menu or nothing is readable, return "products": [].`;

export function geminiMenuPhoto(key, { model = process.env.GEMINI_MODEL || "gemini-3.5-flash", fetchImpl = fetch } = {}) {
  if (!key) return null;
  // note: the manager's own hint ("only the drinks", "prices are in euro").
  return ({ image, mime, text, note }) =>
    gemini(key, model, fetchImpl, [
      { text: MENU_INSTRUCTIONS + (note ? `\n\nThe manager adds: ${note}` : "") },
      image ? { inline_data: { mime_type: mime, data: image } } : { text: `The menu:\n${text}` },
    ], MENU_SCHEMA, 45000);
}
