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
