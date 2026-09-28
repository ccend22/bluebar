const BLUEBILL_API = "https://bluebill-745501573999.europe-north1.run.app/api/v1";

// This read-only probe never sends invoice data. Keep the bearer on the server.
export async function checkBlueBillConnection(token, fetchImpl = fetch) {
  if (typeof token !== "string" || !token.trim())
    throw new Error("BlueBill token is not configured");

  try {
    const response = await fetchImpl(`${BLUEBILL_API}/invoices`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
    await response.body?.cancel();
    return { connected: response.ok, providerStatus: response.status };
  } catch {
    // Provider and network errors may contain URLs or headers. Do not return them.
    return { connected: false, providerStatus: null };
  }
}

// Albania's standard VAT rate. BlueBar doesn't track VAT anywhere else (no fiscalization
// otherwise), and bar/restaurant food & beverage sales are uniformly standard-rate —
// unlike the reduced 6% rate, which applies specifically to hotel accommodation, not F&B.
const VAT_RATE = 20;
// "XPP" (Albania's "Copë" / piece unit) fits every BlueBar line item: drinks and food are
// always sold as whole units, never weighed or metered.
const UNIT_CODE = "XPP";

// invoice: the app's own invoice record (see repository.js loadState) — {id, method, lines}.
// methodOverride ("Cash"/"Kartë"), when given, is what gets reported to BlueBill instead
// of invoice.method — BlueBar's own record of how the customer paid never changes either
// way. Exists because BlueBill currently rejects a Card-method invoice at the fiscalize
// step (its internal invoice `type` won't move off CASH — see bluebill.test.js), so a
// manager can choose to report a card sale as Cash to BlueBill until that's resolved.
export function buildBlueBillPayload(invoice, methodOverride) {
  const method = methodOverride || invoice.method;
  return {
    externalId: `bluebar-${invoice.id}`,
    guestName: "Klient",
    paymentMethod: method === "Kartë" ? "Card" : "Cash",
    lines: invoice.lines.map((l) => ({
      name: l.name,
      unitCode: UNIT_CODE,
      quantity: l.qty,
      totalAfterVat: l.price * l.qty,
      vatRate: VAT_RATE,
    })),
  };
}

async function blueBillRequest(url, token, options, idempotencyKey) {
  const response = await options.fetchImpl(url, {
    method: options.method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(options.body && { "Content-Type": "application/json" }),
      ...(idempotencyKey && { "Idempotency-Key": idempotencyKey }),
    },
    ...(options.body && { body: JSON.stringify(options.body) }),
    // create+fiscalize run sequentially in one request; each gets a slice of the
    // server's own 20s requestTimeout (app.js), with margin for the rest of the request.
    signal: AbortSignal.timeout(8000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.data)
    throw new Error(`BlueBill request failed (${response.status})`);
  return body.data;
}

// Creates a draft invoice, then fiscalizes it. idempotencyKey should be derived from
// BlueBar's own invoice id, so a retry (manual or automatic) never double-files it.
export async function fiscalizeInvoice(token, invoice, idempotencyKey, fetchImpl = fetch, methodOverride) {
  const created = await blueBillRequest(
    `${BLUEBILL_API}/invoices`,
    token,
    { method: "POST", body: buildBlueBillPayload(invoice, methodOverride), fetchImpl },
    idempotencyKey,
  );
  const fiscalized = await blueBillRequest(
    `${BLUEBILL_API}/invoices/${created.id}/fiscalize`,
    token,
    { method: "POST", fetchImpl },
    `${idempotencyKey}-fiscalize`,
  );
  return {
    iic: fiscalized.fiscal?.iic ?? null,
    fic: fiscalized.fiscal?.fic ?? null,
    verificationUrl: fiscalized.fiscal?.verificationUrl ?? null,
  };
}
