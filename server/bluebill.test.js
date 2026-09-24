import test from "node:test";
import assert from "node:assert/strict";
import { checkBlueBillConnection } from "./bluebill.js";

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
