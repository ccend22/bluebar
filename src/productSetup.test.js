import { test } from "node:test";
import assert from "node:assert/strict";
globalThis.crypto ??= (await import("node:crypto")).webcrypto;
const { parseList, productRowProblem, validDeliveryQuantity } = await import("./parseList.js");

test("a pasted list becomes product rows: prices, category headings, Excel rows", () => {
  const rows = parseList("Kafe:\nEspresso 100\nMacchiato - 120 lek\n\nPije:\nCoca-Cola, 150\nUjë natyral 1.000\nPa çmim\nPeroni\t300\tBirra\tBar\t24", "Ushqim");
  const simple = rows.map(({ name, price, category, department, stock }) => ({ name, price, category, department, stock }));
  assert.deepEqual(simple, [
    { name: "Espresso", price: "100", category: "Kafe", department: "", stock: "" },
    { name: "Macchiato", price: "120", category: "Kafe", department: "", stock: "" },
    { name: "Coca-Cola", price: "150", category: "Pije", department: "", stock: "" },
    { name: "Ujë natyral", price: "1000", category: "Pije", department: "", stock: "" },
    { name: "Pa çmim", price: "", category: "Pije", department: "", stock: "" },
    { name: "Peroni", price: "300", category: "Birra", department: "Bar", stock: "24" },
  ]);
  assert.equal(parseList("Tost 200", "Ushqim")[0].category, "Ushqim", "no heading: the current category");
});

test("pasted amounts never silently change sign, decimals or empty columns", () => {
  const rows = parseList("Produkt\t12.50\tKafe\tBar\t-5\n\t100\tKafe\tBar\t2\nUjë\t1.000\tPije\tBar\t100.000");
  assert.equal(rows[0].price, "12.50");
  assert.equal(rows[0].stock, "-5");
  assert.ok(productRowProblem(rows[0]));
  assert.equal(rows[1].name, "");
  assert.equal(productRowProblem(rows[1]), "Emri mungon");
  assert.equal(rows[2].price, "1000");
  assert.equal(rows[2].stock, "100000");
  assert.equal(productRowProblem(rows[2]), "");
  for (const value of ["-1", "1.5", "100001", "NaN", "0"]) assert.equal(validDeliveryQuantity(value), false);
  for (const value of ["1", "24", "100000"]) assert.equal(validDeliveryQuantity(value), true);
});
