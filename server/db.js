import pg from "pg";

export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString?.trim()) return null;
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL nuk ka format të vlefshëm PostgreSQL.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("DATABASE_URL duhet të jetë PostgreSQL.");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  // Explicit TLS verification; never inherit an insecure sslmode from a pasted URL.
  for (const key of [
    "sslmode",
    "sslcert",
    "sslkey",
    "sslrootcert",
    "uselibpqcompat",
  ])
    url.searchParams.delete(key);
  const pool = new pg.Pool({
    connectionString: url.toString(),
    ssl: local ? false : { rejectUnauthorized: true },
    max: 5,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    statement_timeout: 15000,
    application_name: "bluebar-api",
    enableChannelBinding: true,
  });
  pool.on("error", () =>
    console.error("Database pool connection interrupted."),
  );
  return pool;
}
export function provider() {
  try {
    return new URL(process.env.DATABASE_URL).hostname.endsWith(".neon.tech")
      ? "Neon PostgreSQL"
      : "PostgreSQL";
  } catch {
    return "PostgreSQL";
  }
}
