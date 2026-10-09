// Turning pasted text into product rows (Produktet → "Shto shumë" → "Ngjit një listë").
export const blank = (category = "", department = "") => ({ key: crypto.randomUUID(), name: "", price: "", category, department, stock: "" });

// Only remove separators from unambiguous whole-number amounts. Keep invalid input
// visible for correction instead of turning -5 into 5 or 12.50 into 1250.
const amount = (value) => {
  const text = value.trim();
  return /^\d{1,3}(?:[.,]\d{3})+$/.test(text) ? text.replace(/[.,]/g, "") : text;
};

export function productRowProblem(row) {
  if (!row.name.trim()) return row.price !== "" || row.stock !== "" ? "Emri mungon" : "";
  if (!/^\d+$/.test(String(row.price)) || Number(row.price) < 1 || Number(row.price) > 1000000)
    return "Çmimi duhet të jetë numër i plotë nga 1 deri në 1 000 000 Lek";
  if (!row.category.trim()) return "Kategoria mungon";
  if (row.name.trim().length > 80 || row.category.trim().length > 40 || row.department.trim().length > 40)
    return "Emri është tepër i gjatë";
  if (row.stock !== "" && (!/^\d+$/.test(String(row.stock)) || Number(row.stock) > 100000))
    return "Stoku duhet të jetë numër i plotë nga 0 deri në 100 000";
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
