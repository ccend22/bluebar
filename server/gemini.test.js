import { test } from "node:test";
import assert from "node:assert/strict";
import { geminiMenuPhoto } from "./voice.js";

// A stand-in for Google: each call answers with the next status in the list (200 = a menu).
const google = (statuses) => {
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(url.match(/models\/([^:]+):/)[1]);
    const status = statuses[Math.min(asked.length - 1, statuses.length - 1)];
    const body = status === 200
      ? { candidates: [{ content: { parts: [{ text: JSON.stringify({ products: [{ name: "Espresso", price: 100, category: "Kafe" }] }) }] } }] }
      : { error: { message: status === 503 ? "This model is currently experiencing high demand." : "API key not valid." } };
    return { ok: status === 200, status, json: async () => body };
  };
  return { asked, fetchImpl };
};
const photo = { image: "AAAA", mime: "image/jpeg" };

test("Google busy: the menu is read by the next model", async () => {
  const g = google([503, 200]);
  const out = await geminiMenuPhoto("key", { model: "gemini-3.5-flash", fetchImpl: g.fetchImpl })(photo);
  assert.equal(out.products[0].name, "Espresso");
  assert.deepEqual(g.asked, ["gemini-3.5-flash", "gemini-3.8-flash"]);
});

test("Google busy on every model, twice round: a busy error, not a broken photo", async () => {
  const g = google([503]);
  await assert.rejects(geminiMenuPhoto("key", { model: "gemini-3.5-flash", fetchImpl: g.fetchImpl })(photo), (e) => e.busy === true && e.status === 503);
  assert.equal(g.asked.length, 6, "three models, two rounds");
});

test("a real error (a wrong key) is not retried", async () => {
  const g = google([401]);
  await assert.rejects(geminiMenuPhoto("key", { model: "gemini-3.5-flash", fetchImpl: g.fetchImpl })(photo), (e) => !e.busy && e.status === 401);
  assert.equal(g.asked.length, 1);
});
