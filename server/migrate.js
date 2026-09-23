import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createPool } from "./db.js";
// Only server-generated identifiers are accepted; user values remain SQL parameters.
export function tenantSQL(sql, schema) {
  if (!/^(bluebar|bluebar_[a-f0-9]{32})$/.test(schema)) throw Error("Invalid tenant schema");
  return sql.replace(/\bbluebar\b/g, schema);
}
export async function migrateTenant(client, schema = "bluebar") {
  const query = (sql, params) => client.query(tenantSQL(sql, schema), params);
  await query("CREATE SCHEMA IF NOT EXISTS bluebar");
  await query("CREATE TABLE IF NOT EXISTS bluebar.schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const applied = new Set((await query("SELECT name FROM bluebar.schema_migrations")).rows.map(r => r.name));
  const folder = new URL("./migrations/", import.meta.url);
  for (const name of (await readdir(folder)).filter(n => n.endsWith(".sql")).sort()) {
    if (applied.has(name)) continue;
    await query(await readFile(new URL(name, folder), "utf8"));
    await query("INSERT INTO bluebar.schema_migrations(name) VALUES($1)", [name]);
  }
}
export async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(70483201)");
    await migrateTenant(client);
    await client.query(await readFile(new URL("./tenant-catalog.sql", import.meta.url), "utf8"));
    const venues = (await client.query("SELECT schema_name FROM bluebar_catalog.venues WHERE schema_name <> 'bluebar'")).rows;
    for (const venue of venues) await migrateTenant(client, venue.schema_name);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally { client.release(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let pool;
  try {
    pool = createPool(
      process.env.DATABASE_URL_DIRECT ||
        process.env.DATABASE_URL_UNPOOLED ||
        process.env.DATABASE_URL,
    );
    if (!pool) throw Error("CONFIG");
    await migrate(pool);
    console.log("Migrimet BlueBar përfunduan.");
  } catch (e) {
    console.error(
      "Migrimi dështoi. Kontrolloni DATABASE_URL, rrjetin dhe lejet e databazës. Kodi:",
      /^[A-Z0-9_]+$/.test(e.code || "") ? e.code : "CONFIG_OR_CONNECTION",
    );
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}
