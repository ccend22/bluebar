const headers = { "Content-Type": "application/json", "X-BlueBar-Client": "1" };
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
export const fetchState = () => request("/state");
export const sendCommand = (command) =>
  request("/commands", { method: "POST", body: JSON.stringify(command) });
const send = (method, path, body) =>
  request(path, { method, body: JSON.stringify(body ?? {}) });
export const fetchSession = () => request("/auth/session");
export const fetchLoginWaiters = () => request("/auth/waiters");
export const loginWaiter = (waiterId, pin) => send("POST", "/auth/waiter-login", { waiterId, pin });
export const loginManager = (body) => send("POST", "/auth/manager-login", body);
export const logout = () => send("POST", "/auth/logout");
export const setWaiterPin = (id, pin) => send("PUT", `/accounts/waiters/${id}/pin`, { pin });
