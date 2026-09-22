import { createPool, provider } from "../server/db.js";
let pool;
try {
  pool = createPool();
  if (!pool) throw Error("CONFIG");
  await pool.query("SELECT 1");
  const { rows } = await pool.query(
    "SELECT to_regclass('bluebar.control') IS NOT NULL AS initialized",
  );
  console.log(
    JSON.stringify({
      connected: true,
      provider: provider(),
      schemaReady: rows[0].initialized,
    }),
  );
} catch {
  console.error(
    "Lidhja nuk u verifikua. Kontrolloni DATABASE_URL dhe aksesin në rrjet.",
  );
  process.exitCode = 1;
} finally {
  await pool?.end();
}
