// Vercel serverless entry point. `server/index.js` is the local long-running dev server;
// this wraps the same buildApp() for a stateless request/response model instead of app.listen().
// The [...path] filename makes Vercel route every /api/* request here.
import { createPool, provider } from "../server/db.js";
import { buildApp } from "../server/app.js";

const list = (v) =>
  (v || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

// Cached across warm invocations of the same instance; a cold start rebuilds it.
let appPromise;
function getApp() {
  if (!appPromise) {
    const pool = createPool();
    const app = buildApp({
      pool,
      provider: provider(),
      origins: list(process.env.APP_ORIGINS),
      allowedHosts: list(process.env.ALLOWED_HOSTS),
      allowedIps: list(process.env.WAITER_ALLOWED_IPS),
      // Vercel's edge is the one hop in front of this function.
      trustProxy: true,
      secureCookies: true,
    });
    appPromise = app.ready().then(() => app);
  }
  return appPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  app.server.emit("request", req, res);
}
