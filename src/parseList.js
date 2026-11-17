// Turning pasted text into product rows (Produktet → "Shto shumë" → "Ngjit një listë").
export const blank = (category = "", department = "") => ({ key: crypto.randomUUID(), name: "", price: "", category, department, stock: "" });

// Only remove separators from unambiguous whole-number amounts. Keep invalid input
// visible for correction instead of turning -5 into 5 or 12.50 into 1250.
const amount = (value) => {
  const text = value.trim();
  return /^\d{1,3}(?:[.,]\d{3})+$/.test(text) ? text.replace(/[.,]/g, "") : text;
};

// A product's extras as text, one line each: "Djathë ekstra +100" is an add-on; a line with a
// colon is a group of one choice: "Madhësia: E vogël, E mesme +150, E madhe +300".
// The product form and the import tables both read and write this.
export function parseExtras(text) {
  const item = (part, group) => {
    const m = part.trim().match(/^(.*?)\s*\+\s*(\d+)\s*(lek)?$/i);
    const x = m ? { name: m[1].trim(), price: Number(m[2]) } : { name: part.trim(), price: 0 };
    return group ? { ...x, group } : x;
  };
  return String(text || "")
    .split("\n")
    .map((row) => row.trim())
    .filter(Boolean)
    .flatMap((row) => {
      const g = row.match(/^([^:]{1,30}):(.+)$/);
      return g ? g[2].split(",").filter((t) => t.trim()).map((t) => item(t, g[1].trim())) : [item(row)];
    });
}
export function extrasText(extras = []) {
  const price = (x) => `${x.name}${x.price ? ` +${x.price}` : ""}`;
  const rows = [];
  for (const x of extras) {
    if (!x.group) rows.push(price(x));
    else if (!rows.some((r) => r.startsWith(`${x.group}: `))) rows.push(`${x.group}: ${extras.filter((y) => y.group === x.group).map(price).join(", ")}`);
  }
  return rows.join("\n");
}

export function productRowProblem(row) {
  if (!row.name.trim()) return row.price !== "" || row.stock !== "" ? "Emri mungon" : "";
  if (!/^\d+$/.test(String(row.price)) || Number(row.price) < 1 || Number(row.price) > 1000000)
    return "Çmimi duhet të jetë numër i plotë nga 1 deri në 1 000 000 Lek";
  if (!row.category.trim()) return "Kategoria mungon";
  if (row.name.trim().length > 80 || row.category.trim().length > 40 || row.department.trim().length > 40)
    return "Emri është tepër i gjatë";
  if (row.stock !== "" && (!/^\d+$/.test(String(row.stock)) || Number(row.stock) > 100000))
    return "Stoku duhet të jetë numër i plotë nga 0 deri në 100 000";
  // What the AI import may add: the menu's description, portion, calories and options.
  if (row.calories && (!/^\d+$/.test(String(row.calories)) || Number(row.calories) > 5000)) return "Kaloritë duhet të jenë numër nga 0 deri në 5000";
  if ((row.portion || "").trim().length > 40) return "Porcioni është tepër i gjatë (deri 40 shkronja)";
  if ((row.description || "").trim().length > 300) return "Përshkrimi është tepër i gjatë (deri 300 shkronja)";
  if (parseExtras(row.options).some((x) => !x.name || x.name.length > 40)) return "Një opsion ka emër bosh ose tepër të gjatë";
  return "";
}

export const validDeliveryQuantity = (value) => /^\d+$/.test(String(value)) && Number(value) >= 1 && Number(value) <= 100000;

// "Espresso 100", "Birrë Korça - 250 lek", Excel/Sheets rows (tabs: name, price, category,
// department, stock), and a line ending in ":" ("Kafe:") as the category of what follows.
export function parseList(text, fallbackCategory = "") {
  let category = fallbackCategory;
  const rows = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.endsWith(":") && !/\d/.test(line)) {
      category = line.slice(0, -1).trim();
      continue;
    }
    if (raw.includes("\t")) {
      const [name = "", price = "", cat = "", department = "", stock = ""] = raw.split("\t").map((x) => x.trim());
      rows.push({ ...blank(cat || category, department), name, price: amount(price), stock: amount(stock) });
      continue;
    }
    const m = line.match(/^(.*?)[\s,;:–-]+(\d+(?:[.,]\d{3})*)\s*(?:lek|all|l)?\.?$/i);
    rows.push(m ? { ...blank(category), name: m[1].trim(), price: m[2].replace(/[.,]/g, "") } : { ...blank(category), name: line });
  }
  return rows;
}
