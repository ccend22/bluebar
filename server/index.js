import { createPool, provider } from "./db.js";
import { buildApp } from "./app.js";
if (process.env.NODE_ENV === "production") {
  console.error(
    "Ky backend është ende vetëm për zhvillim lokal: hyrja është gati, por publikimi kërkon HTTPS, host të lejuar dhe proxy të konfiguruar.",
  );
  process.exit(1);
}
let pool;
try {
  pool = createPool();
} catch {
  console.error("DATABASE_URL është i pavlefshëm. Kontrolloni .env.");
  process.exit(1);
}
const port = Number(process.env.API_PORT || 3001);
const origins = (
  process.env.APP_ORIGINS ||
  "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174"
)
  .split(",")
  .map((x) => x.trim());
const list = (v) => (v || "").split(",").map((x) => x.trim()).filter(Boolean);
// TRUST_PROXY: hop count (e.g. 1) or proxy IPs/CIDRs. Leave unset unless a reverse proxy you control is in front.
const proxy = process.env.TRUST_PROXY;
const app = buildApp({
  pool,
  provider: provider(),
  origins,
  allowedIps: list(process.env.WAITER_ALLOWED_IPS),
  trustProxy: !proxy ? false : /^\d+$/.test(proxy) ? Number(proxy) : list(proxy),
  secureCookies: process.env.NODE_ENV === "production",
});
try {
  await app.listen({ host: "127.0.0.1", port });
  console.log(
    `BlueBar API: http://127.0.0.1:${port} · ${pool ? "DATABASE_URL configured" : "DATABASE_URL missing"}`,
  );
} catch {
  console.error("API nuk mund të niset. Kontrolloni API_PORT.");
  await pool?.end();
  process.exit(1);
}
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, async () => {
    await app.close();
    await pool?.end();
    process.exit(0);
  });
