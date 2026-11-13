import { validDeliveryQuantity } from './parseList.js';

export function validDocumentDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function deliveryItems(rows) {
  const totals = new Map();
  for (const row of rows) totals.set(Number(row.id), (totals.get(Number(row.id)) || 0) + Number(row.qty));
  return [...totals].map(([productId, qty]) => ({ productId, qty }));
}

export function validDeliveryRows(rows, products) {
  const known = new Set(products.filter((p) => p.trackStock !== false).map((p) => Number(p.id)));
  return rows.length > 0 && rows.every((r) => known.has(Number(r.id)) && validDeliveryQuantity(r.qty))
    && deliveryItems(rows).every((r) => validDeliveryQuantity(r.qty));
}

// Remove acknowledged writes immediately so a failed batch can retry only remaining rows.
export async function saveDocumentRows(rows, persist, acknowledge) {
  let count = 0;
  for (const row of rows) {
    await persist(row);
    count++;
    acknowledge(row);
  }
  return count;
}
