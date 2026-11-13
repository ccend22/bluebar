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
  const signal = AbortSignal.timeout(timeout);
  const ask = (thinking) =>
    fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: schema, ...(thinking && { thinkingConfig: thinking }) },
      }),
      signal,
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

// The room (Ndrysho sallën → "Pamja nga foto"): the venue's own table, or its floor, drawn
// from a photo by Gemini's image model. GEMINI_IMAGE_MODEL picks the model.
// A table comes back on flat green, which the browser cuts away (src/RoomEditor.jsx).
const DRAW = {
  table: `Redraw the table and its chairs from this photo as one clean 3D-rendered asset for a floor plan.
- View: straight from above (top-down, bird's-eye), with soft depth: the tabletop's edge and the chairs' seats and backs shaded so they read as solid objects. The table square to the frame, its chairs evenly around it.
- Keep the real materials, colours and shapes from the photo: the tabletop, the legs, the style of the chairs.
- If several tables are visible, draw only the main one with its own chairs. If the photo shows only chairs, draw them around a simple matching table.
- Soft even light. No shadow on the ground, no people, nothing on the table, no text.
- The whole object visible and centred, with a small margin around it.
- Background: one flat pure green, exactly #00FF00, everywhere outside the object.`,
  floor: `From this photo of a bar, cafe or restaurant, make one seamless square texture tile of its floor material (wood planks, tiles, stone, terrazzo, concrete...).
Seen straight from above, evenly lit, the pattern at a small scale so it can repeat. No furniture, no shadows, no perspective, no text, no border.
If no floor is visible, use the room's dominant material and colours.`,
};
export function geminiFurniture(key, { model = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image", fetchImpl = fetch } = {}) {
  if (!key) return null;
  return async ({ image, mime, kind }) => {
    const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: DRAW[kind] }, { inline_data: { mime_type: mime, data: image } }] }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1" } },
      }),
      signal: AbortSignal.timeout(90000),
    });
    if (!response.ok) {
      const reason = await response.json().then((b) => b.error?.message, () => "");
      throw Object.assign(new Error(`Gemini ${response.status}: ${String(reason || "").slice(0, 300)}`), { status: response.status });
    }
    const parts = (await response.json()).candidates?.[0]?.content?.parts || [];
    const picture = parts.map((p) => p.inlineData || p.inline_data).find(Boolean);
    if (!picture?.data) throw new Error("Gemini returned no picture");
    return { mime: picture.mimeType || picture.mime_type || "image/png", image: picture.data };
  };
}

// Inventari → "Importo me AI": a supplier's invoice or delivery note (photo or text) read into
// what arrived, each line matched to one of the venue's counted products by id (0: none fits).
const DELIVERY_SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { id: { type: "INTEGER" }, name: { type: "STRING" }, qty: { type: "INTEGER" } }, required: ["id", "name", "qty"] },
    },
  },
  required: ["items"],
};
const deliveryInstructions = (products) => `This is a supplier's invoice, delivery note or receipt for a bar or restaurant in Albania (a photo of it, or its text).
List every product line on it:
- "name": the line's product name as written.
- "qty": how many single units arrived. "2 x 24" or "2 arka x 24" is 48; a case of 6 bottles counted once is 6 if the case size is written, else the number written.
- "id": the id of the venue's product below that this line is (same product, any spelling, brand or size written differently); 0 if none of them is it. Never guess an id for a product that is not in the list.
Leave out totals, VAT, deposits, delivery charges and anything that is not a product. If nothing is readable, return "items": [].

The venue's counted products (id: name):
`;
export function geminiDelivery(key, { model = process.env.GEMINI_MODEL || "gemini-3.5-flash", fetchImpl = fetch } = {}) {
  if (!key) return null;
  return ({ image, mime, text, note, products }) =>
    gemini(key, model, fetchImpl, [
      { text: deliveryInstructions() + products.map((p) => `${p.id}: ${p.name}`).join("\n") + (note ? `\n\nThe manager adds: ${note}` : "") },
      image ? { inline_data: { mime_type: mime, data: image } } : { text: `The document:\n${text}` },
    ], DELIVERY_SCHEMA, 90000);
}

// Raportet → Shpenzimet → "Importo me AI": receipts, bills or a bank statement read into the
// venue's spending, one row per payment.
const EXPENSES_SCHEMA = {
  type: "OBJECT",
  properties: {
    expenses: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { date: { type: "STRING" }, amount: { type: "NUMBER" }, category: { type: "STRING" }, method: { type: "STRING" }, note: { type: "STRING" } },
        required: ["date", "amount", "category", "method", "note"],
      },
    },
  },
  required: ["expenses"],
};
const EXPENSES_INSTRUCTIONS = `These are receipts, bills, invoices or a bank statement of a bar or restaurant in Albania (a photo, or their text). List each payment the venue made:
- "date": the payment's date as YYYY-MM-DD, or "" if none is written.
- "amount": the total paid, as a number in Lek ("1.200" or "1,200" is 1200). On a bank statement, only money going out.
- "category": one short Albanian word or two for what it was: Furnitorë, Staff, Qira, Utilities, Taksa, Mirëmbajtje, Transport, Marketing, or another if none fits.
- "method": "Cash" if paid in cash, "Bankë" if by card, transfer or a bank statement line, "" if it does not say.
- "note": who was paid and what for, in a few words (e.g. "OSHEE, drita tetor").
Leave out money coming in, subtotals and VAT lines. Never invent payments. If nothing is readable, return "expenses": [].`;
export function geminiExpenses(key, { model = process.env.GEMINI_MODEL || "gemini-3.5-flash", fetchImpl = fetch } = {}) {
  if (!key) return null;
  return ({ image, mime, text, note }) =>
    gemini(key, model, fetchImpl, [
      { text: EXPENSES_INSTRUCTIONS + (note ? `\n\nThe manager adds: ${note}` : "") },
      image ? { inline_data: { mime_type: mime, data: image } } : { text: `The documents:\n${text}` },
    ], EXPENSES_SCHEMA, 90000);
}
