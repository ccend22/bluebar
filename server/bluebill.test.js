import test from "node:test";
import assert from "node:assert/strict";
import { checkBlueBillConnection, buildBlueBillPayload, fiscalizeInvoice } from "./bluebill.js";

const sampleInvoice = {
  id: 42,
  method: "Kartë",
  lines: [
    { id: 1, name: "Espresso", price: 100, qty: 2 },
    { id: 2, name: "Birra Tirana", price: 200, qty: 1 },
  ],
};

test("BlueBill probe uses the server bearer and only reads invoices", async () => {
  let call;
  const result = await checkBlueBillConnection("test-secret", async (url, options) => {
    call = { url, options };
    return new Response("[]", { status: 200 });
  });
  assert.deepEqual(result, { connected: true, providerStatus: 200 });
  assert.equal(call.url, "https://bluebill-745501573999.europe-north1.run.app/api/v1/invoices");
  assert.equal(call.options.method, "GET");
  assert.equal(call.options.headers.Authorization, "Bearer test-secret");
  assert.equal(call.options.signal.aborted, false);
});

test("BlueBill probe reports provider or transport failure without exposing details", async () => {
  assert.deepEqual(
    await checkBlueBillConnection("test-secret", async () => new Response("private", { status: 401 })),
    { connected: false, providerStatus: 401 },
  );
  assert.deepEqual(
    await checkBlueBillConnection("test-secret", async () => { throw Error("private"); }),
    { connected: false, providerStatus: null },
  );
});

test("buildBlueBillPayload maps a BlueBar invoice to the documented BlueBill shape", () => {
  assert.deepEqual(buildBlueBillPayload(sampleInvoice), {
    externalId: "bluebar-42",
    guestName: "Klient",
    paymentMethod: "Card",
    lines: [
      { name: "Espresso", unitCode: "XPP", quantity: 2, totalAfterVat: 200, vatRate: 20 },
      { name: "Birra Tirana", unitCode: "XPP", quantity: 1, totalAfterVat: 200, vatRate: 20 },
    ],
  });
  assert.equal(buildBlueBillPayload({ ...sampleInvoice, method: "Cash" }).paymentMethod, "Cash");
  // A manager can report a different method to BlueBill than what's on BlueBar's own
  // record — BlueBar's invoice.method itself never changes, only what's sent upstream.
  assert.equal(buildBlueBillPayload(sampleInvoice, "Cash").paymentMethod, "Cash");
  assert.equal(buildBlueBillPayload({ ...sampleInvoice, method: "Cash" }, "Kartë").paymentMethod, "Card");
});

test("fiscalizeInvoice creates then fiscalizes, and extracts iic/fic/verificationUrl", async () => {
  const calls = [];
  const fic = "a39171ce-a0bb-457a-b7ca-ea9fe273bade";
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/invoices"))
      return new Response(JSON.stringify({ data: { id: "bb-invoice-id", status: "draft" }, meta: {} }), { status: 201 });
    return new Response(
      JSON.stringify({
        data: { id: "bb-invoice-id", status: "fiscalized", fiscal: { iic: "AF1B0B49", fic, eic: null, verificationUrl: "https://efiskalizimi-app-test.tatime.gov.al/verify?iic=AF1B0B49", error: null } },
        meta: { alreadyFiscalized: false },
      }),
      { status: 200 },
    );
  };
  const result = await fiscalizeInvoice("test-secret", sampleInvoice, "bluebar-bluebar-42", fetchImpl);
  assert.deepEqual(result, { iic: "AF1B0B49", fic, verificationUrl: "https://efiskalizimi-app-test.tatime.gov.al/verify?iic=AF1B0B49" });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://bluebill-745501573999.europe-north1.run.app/api/v1/invoices");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["Idempotency-Key"], "bluebar-bluebar-42");
  assert.deepEqual(JSON.parse(calls[0].options.body), buildBlueBillPayload(sampleInvoice));
  assert.equal(calls[1].url, "https://bluebill-745501573999.europe-north1.run.app/api/v1/invoices/bb-invoice-id/fiscalize");
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[1].options.headers["Idempotency-Key"], "bluebar-bluebar-42-fiscalize");
});

test("fiscalizeInvoice rejects on a provider error without leaking details", async () => {
  await assert.rejects(
    () => fiscalizeInvoice("test-secret", sampleInvoice, "key", async () => new Response("private failure detail", { status: 500 })),
    /BlueBill request failed \(500\)/,
  );
});

// One fetch per failure kind; the reason is what the manager is told.
const reasonFor = (respond) =>
  fiscalizeInvoice("t", sampleInvoice, "k", async (url) =>
    url.endsWith("/invoices") ? new Response(JSON.stringify({ data: { id: "x" } }), { status: 201 }) : respond(),
  ).then(() => "ok", (e) => e.reason);

test("fiscalizeInvoice names why it failed, and never accepts a half answer", async () => {
  const json = (body, status) => () => new Response(JSON.stringify(body), { status });
  assert.equal(await reasonFor(json({ error: { code: "66", message: "Type of invoice doesn't match" } }, 422)), "card");
  assert.equal(await reasonFor(json({ error: { message: "bad token" } }, 401)), "token");
  assert.equal(await reasonFor(() => { throw new TypeError("fetch failed"); }), "unreachable");
  assert.equal(await reasonFor(json({ data: { id: "x", status: "draft", fiscal: null } }, 200)), "incomplete");
  assert.equal(await reasonFor(json({ data: { id: "x", status: "fiscalized", fiscal: { iic: "A" } } }, 200)), "incomplete");
  assert.equal(await reasonFor(json({ error: {} }, 500)), "rejected");
  assert.equal(await reasonFor(json({ data: { id: "x", status: "fiscalized", fiscal: { iic: "A", fic: "F" } } }, 200)), "ok");
});
