import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOrder } from "./voice.js";

const menu = [
  { id: 1, name: "Birrë Korça", i18n: { en: { name: "Korça Beer" } } },
  { id: 2, name: "Birrë Peroni", i18n: { en: { name: "Peroni Beer" } } },
  { id: 3, name: "Macchiato" },
  { id: 4, name: "Ujë natyral", i18n: { en: { name: "Natural water" }, it: { name: "Acqua naturale" } } },
  { id: 5, name: "Cappuccino" },
  { id: 6, name: "Picë Margarita" },
];
const said = (text) => parseOrder(text, menu).map((x) => [x.product.name, x.qty]);

test("what the guest said becomes menu items; what isn't on the menu is dropped", () => {
  assert.deepEqual(said("1 birrë peroni, 2 makiato, 2 ujë"), [["Birrë Peroni", 1], ["Macchiato", 2], ["Ujë natyral", 2]]);
  assert.deepEqual(said("dy kapuçino dhe një pizza margarita"), [["Cappuccino", 2], ["Picë Margarita", 1]]);
  assert.deepEqual(said("2 cappuccino and two korca beers"), [["Cappuccino", 2], ["Birrë Korça", 2]]);
  assert.deepEqual(said("due acqua naturale"), [["Ujë natyral", 2]]);
  assert.deepEqual(said("3 sushi, 1 makiato"), [["Macchiato", 1]], "sushi isn't on the menu");
  assert.deepEqual(said("macchiato e due macchiato"), [["Macchiato", 3]], "the same product adds up");
  assert.deepEqual(said("dua dicka te mire"), []);
  assert.deepEqual(said(""), []);
});

test("corrections the way a waiter says them", () => {
  assert.deepEqual(said("2 ujë, doja makiato jo ujë"), [["Macchiato", 2]], "not water: macchiato, as many");
  assert.deepEqual(said("1 birrë korça jo, peroni"), [["Birrë Peroni", 1]], "Peroni instead of Korça");
  assert.deepEqual(said("2 makiato 1 ujë hiq ujin"), [["Macchiato", 2]], "take the water off");
  assert.deepEqual(said("2 makiato jo 3 kapuçino"), [["Cappuccino", 3]], "a quantity said with the correction wins");
  assert.deepEqual(said("dy birra korça dhe ujët"), [["Birrë Korça", 2], ["Ujë natyral", 1]], "Albanian endings");
});
