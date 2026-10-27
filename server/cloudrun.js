// Cloud Run entry: one container serves the built app (dist/) and the API.
// /api/* goes to buildApp(); everything
// else is a file from dist/, with the menu's and the app's HTML as the fallbacks.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, provider } from "./db.js";
import { buildApp } from "./app.js";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const list = (v) => (v || "").split(",").map((x) => x.trim()).filter(Boolean);
const app = buildApp({
  pool: createPool(),
  provider: provider(),
  origins: list(process.env.APP_ORIGINS),
  allowedHosts: list(process.env.ALLOWED_HOSTS),
  allowedIps: list(process.env.WAITER_ALLOWED_IPS),
  // Google's front end is the one hop in front: the client's IP is the last
  // X-Forwarded-For entry (the one it added), never one a client wrote itself.
  trustProxy: (_address, hop) => hop === 0,
  secureCookies: true,
});
await app.ready();

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
};
// Security headers on every page.
const SECURITY = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self' https://apis.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com; frame-src https://*.firebaseapp.com; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(self), geolocation=(), payment=(), usb=()",
};

async function file(path) {
  const full = normalize(join(DIST, path));
  if (!full.startsWith(DIST)) return null; // never outside dist/
  try {
    if (!(await stat(full)).isFile()) return null;
    return { body: await readFile(full), type: TYPES[extname(full)] || "application/octet-stream" };
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const path = decodeURIComponent((req.url || "/").split("?")[0]);
  if (path.startsWith("/api/")) return app.server.emit("request", req, res);
  if (req.method !== "GET" && req.method !== "HEAD") return res.writeHead(405).end();
  const found =
    (path !== "/" && (await file(path))) ||
    (path.startsWith("/menu/") ? await file("menu.html") : await file("index.html"));
  if (!found) return res.writeHead(404).end();
  res.writeHead(200, {
    ...SECURITY,
    "Content-Type": found.type,
    // Vite names assets by content: cache them for good. Pages and the worker: always fresh.
    "Cache-Control": path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
  });
  res.end(req.method === "HEAD" ? undefined : found.body);
}).listen(Number(process.env.PORT || 8080), "0.0.0.0", () => console.log(`BlueBar on :${process.env.PORT || 8080}`));

process.once("SIGTERM", async () => {
  await app.close();
  process.exit(0);
});
