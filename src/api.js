export const venueSlug = new URLSearchParams(window.location.search).get("business") || "bluebar";
const headers = { "Content-Type": "application/json", "X-BlueBar-Client": "1", "X-BlueBar-Venue": venueSlug };
let onUnauthorized = () => {};
// The app registers one handler that drops back to the sign-in screen when the session ends.
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new ApiError(
      "Serveri nuk përgjigjet. Kontrolloni lidhjen dhe provoni përsëri.",
      0,
    );
  }
  const body = await response
    .json()
    .catch(() => ({ error: "Përgjigje e pavlefshme nga serveri." }));
  if (response.status === 401) onUnauthorized();
  if (!response.ok)
    throw new ApiError(body.error || "Kërkesa dështoi.", response.status);
  return body;
}
// since: the revision this device already has; the reply is { unchanged: true } if nothing moved.
export const fetchState = (since) => request(since === undefined ? "/state" : `/state?since=${since}`);
// Best-effort; call after a payment succeeds. Safe to ignore failures — a manager can
// retry the same invoice later from Faturat, and this never blocks the sale itself.
export const fiscalizeInvoice = (id, method) =>
  send("POST", `/invoices/${id}/fiscalize`, method ? { method } : undefined);
export const sendCommand = (command) =>
  request("/commands", { method: "POST", body: JSON.stringify(command) });
const send = (method, path, body) =>
  request(path, { method, body: JSON.stringify(body ?? {}) });
export const fetchSession = () => request("/auth/session");
export const fetchLoginWaiters = () => request("/auth/waiters");
export const loginWaiter = (waiterId, pin) => send("POST", "/auth/waiter-login", { waiterId, pin });
export const loginWaiterPattern = (waiterId, pattern) => send("POST", "/auth/waiter-pattern", { waiterId, pattern });
export const loginManager = (body) => send("POST", "/auth/manager-login", body);
export const logout = () => send("POST", "/auth/logout");
export const setWaiterPin = (id, pin) => send("PUT", `/accounts/waiters/${id}/pin`, { pin });
export const setWaiterPattern = (id, pattern) => send("PUT", `/accounts/waiters/${id}/pattern`, { pattern });

export const fetchVenue = () => request("/venue");
export const registerVenue = (body) => send("POST", "/venues/register", body);
export const fetchNetwork = () => request("/venue/network");
export const saveNetwork = (allowedIps) => send("PUT", "/venue/network", { allowedIps });
export const saveLoginMode = (loginMode) => send("PUT", "/venue/login-mode", { loginMode });
export function openBusiness(slug) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("business", slug);
  window.location.assign(url);
}
export const fetchPrintStatus = () => request("/print/status");
export const createPrintKey = () => send("POST", "/print/key");
export const testPrinter = (printerId) => send("POST", "/print/test", { printerId });
// { queued: false } means no network printer covers it: print from the browser instead.
export const reprintDocument = (kind, id) => send("POST", "/print/reprint", { kind, id: String(id) });
export const fetchShiftReport = (id) => request(`/shifts/${id}/report`);
