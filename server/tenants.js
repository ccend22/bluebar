import { randomUUID, createHmac } from "node:crypto";
import { AppError } from "./commands.js";
import { hashSecret, validPin, ipPolicy } from "./auth.js";
import { migrateTenant, tenantSQL } from "./migrate.js";

export const validSlug = slug => typeof slug === "string" && /^[a-z0-9][a-z0-9-]{2,39}$/.test(slug);
export const publicVenue = venue => ({ slug: venue.slug, name: venue.name, loginMode: venue.login_mode, managerLogin: venue.manager_login || "pin_only" });

// Every auth and business query uses a request-local wrapper. No shared search_path
// or mutable tenant state can leak between concurrent pooled connections.
export function tenantPool(pool, schema) {
  tenantSQL("", schema);
  const wrap = client => ({
    query: (sql, params) => client.query(tenantSQL(sql, schema), params),
    release: () => client.release(),
  });
  return {
    query: (sql, params) => pool.query(tenantSQL(sql, schema), params),
    connect: async () => wrap(await pool.connect()),
  };
}
export async function resolveVenue(pool, slug) {
  if (!validSlug(slug)) throw new AppError("Kodi i biznesit është i pavlefshëm.", 400);
  const venue = (await pool.query("SELECT * FROM bluebar_catalog.venues WHERE slug=$1", [slug])).rows[0];
  if (!venue) throw new AppError("Biznesi nuk u gjet. Kontrolloni kodin.", 404);
  return venue;
}
// Database-backed hourly budget, shared by every serverless instance. Returns the
// attempts used so far this hour for `key` (an IP, optionally prefixed per purpose).
// The IP is stored only as a keyed hash (a bare SHA-256 of an IPv4 address can be
// reversed by trying all of them), and rows are dropped a day after they expire.
export async function spendBudget(pool, key) {
  await pool.query("DELETE FROM bluebar_catalog.registration_limits WHERE reset_at < now() - interval '1 day'");
  return (await pool.query(`
    INSERT INTO bluebar_catalog.registration_limits(ip_hash, attempts, reset_at)
    VALUES ($1, 1, now() + interval '1 hour')
    ON CONFLICT (ip_hash) DO UPDATE SET
      attempts = CASE WHEN bluebar_catalog.registration_limits.reset_at < now() THEN 1 ELSE bluebar_catalog.registration_limits.attempts + 1 END,
      reset_at = CASE WHEN bluebar_catalog.registration_limits.reset_at < now() THEN now() + interval '1 hour' ELSE bluebar_catalog.registration_limits.reset_at END
    RETURNING attempts`, [createHmac("sha256", process.env.BLUEBAR_SECRET_KEY || "bluebar-rate-limit").update(key).digest("hex")])).rows[0].attempts;
}
export async function registerVenue(pool, { slug, name, pin }, ip) {
  if (!validSlug(slug) || typeof name !== "string" || name.trim().length < 2 || name.trim().length > 80)
    throw new AppError("Vendosni emrin dhe kodin e vlefshëm të biznesit.");
  if (!validPin(pin)) throw new AppError("PIN-i është shumë i thjeshtë. Shmangni shifra të përsëritura ose në varg.");
  if ((await spendBudget(pool, ip)) > 5) throw new AppError("Shumë regjistrime. Provoni pas një ore.", 429);
  const secret = await hashSecret(pin);
  const schema = `bluebar_${randomUUID().replaceAll("-", "")}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize provisioning with migrations, never with normal order entry.
    await client.query("SELECT pg_advisory_xact_lock(70483201)");
    const venue = (await client.query(`INSERT INTO bluebar_catalog.venues(slug, name, schema_name)
      VALUES($1,$2,$3) RETURNING *`, [slug, name.trim(), schema])).rows[0];
    await migrateTenant(client, schema);
    const query = (sql, params) => client.query(tenantSQL(sql, schema), params);
    // Configuration seeds are for the legacy installation; new businesses start empty.
    await query("DELETE FROM bluebar.dining_tables");
    await query("DELETE FROM bluebar.categories");
    await query("DELETE FROM bluebar.departments");
    const account = (await query("INSERT INTO bluebar.accounts(role,username,secret_hash) VALUES('manager','manager',$1) RETURNING id", [secret])).rows[0];
    await client.query("COMMIT");
    return { venue, accountId: account.id };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally { client.release(); }
}
export function validateNetworks(entries) {
  if (!Array.isArray(entries) || entries.length > 20 || entries.some(x => typeof x !== "string" || x.length > 60))
    throw new AppError("Vendosni deri në 20 adresa IP ose rrjete CIDR.");
  try { ipPolicy(entries); } catch { throw new AppError("Një adresë IP ose rrjet CIDR është i pavlefshëm."); }
  return [...new Set(entries.map(x => x.trim()))];
}
