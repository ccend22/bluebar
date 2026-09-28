import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { BlockList, isIP } from "node:net";
import { promisify } from "node:util";
import { AppError } from "./commands.js";

const kdf = promisify(scrypt);
// OWASP scrypt profile (N=2^15, r=8, p=3); maxmem raised above Node's 32 MiB default.
const SCRYPT = { N: 2 ** 15, r: 8, p: 3, maxmem: 128 * 1024 * 1024 };
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

export async function hashSecret(secret) {
  const salt = randomBytes(16);
  const key = await kdf(secret, salt, 64, SCRYPT);
  return `s1$${salt.toString("base64")}$${key.toString("base64")}`;
}
export async function verifySecret(secret, stored) {
  const [version, salt, hash] = String(stored).split("$");
  if (version !== "s1" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await kdf(secret, Buffer.from(salt, "base64"), expected.length, SCRYPT);
  return timingSafeEqual(key, expected);
}
// Unknown accounts are verified against this so they cost the same as a wrong secret.
let decoy;
const decoyHash = async () => (decoy ??= await hashSecret("decoy"));

// A pattern: 4-9 distinct dots of the 3x3 grid (1-9, row by row), in drawing order.
export const validPattern = (p) =>
  Array.isArray(p) &&
  p.length >= 4 &&
  p.length <= 9 &&
  p.every((d) => Number.isInteger(d) && d >= 1 && d <= 9) &&
  new Set(p).size === p.length;
const patternSecret = (p) => p.join("-");
export const validPin = (p) =>
  /^\d{6}$/.test(p) && !/^(\d)\1{5}$/.test(p) && !"01234567890".includes(p) && !"09876543210".includes(p);

export const cookieName = (secure, slug = "bluebar") =>
  (secure ? "__Host-session" : "bluebar_session") + (slug === "bluebar" ? "" : `_${slug}`);
export const readCookie = (request, name) =>
  request.headers.cookie
    ?.split(/;\s*/)
    .map((c) => c.split("="))
    .find(([k]) => k === name)?.[1];
export const sessionCookie = (secure, token, maxAge = 12 * 3600, slug = "bluebar") =>
  `${cookieName(secure, slug)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;

// Empty list = loopback only, so an unconfigured deployment fails closed for waiters.
export function ipPolicy(entries = []) {
  const list = new BlockList();
  for (const entry of entries.length ? entries : ["127.0.0.1", "::1"]) {
    const parts = entry.trim().split("/");
    const [addr, len] = parts;
    const family = isIP(addr);
    if (!family || parts.length > 2 || (len !== undefined && (!/^\d+$/.test(len) || Number(len) > (family === 6 ? 128 : 32))))
      throw new Error(`Invalid IP in allowlist: ${entry}`);
    const type = family === 6 ? "ipv6" : "ipv4";
    len ? list.addSubnet(addr, Number(len), type) : list.addAddress(addr, type);
  }
  return (ip = "") => {
    const clean = ip.replace(/^::ffff:/i, "");
    const family = isIP(clean);
    return family !== 0 && list.check(clean, family === 6 ? "ipv6" : "ipv4");
  };
}

// ponytail: in-memory per process; move to the database if the API ever runs on several instances.
export function throttle(limit = 40, windowMs = 10 * 60_000) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    if (hits.size > 1000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    let h = hits.get(key);
    if (!h || h.reset < now) hits.set(key, (h = { n: 0, reset: now + windowMs }));
    return ++h.n <= limit;
  };
}

export async function issueSession(pool, accountId) {
  const token = randomBytes(32).toString("base64url");
  await pool.query("DELETE FROM bluebar.sessions WHERE expires_at < now()");
  await pool.query(
    "INSERT INTO bluebar.sessions(token_hash, account_id, expires_at) VALUES($1, $2, now() + interval '12 hours')",
    [sha256(token), accountId],
  );
  return token;
}
// Live join on accounts/waiters: deactivating a waiter or account ends their session immediately.
export async function findSession(pool, token) {
  const hash = sha256(token);
  const row = (
    await pool.query(
      `SELECT a.id, a.role, a.waiter_id, COALESCE(w.name, a.username) AS name
       FROM bluebar.sessions s
       JOIN bluebar.accounts a ON a.id = s.account_id
       LEFT JOIN bluebar.waiters w ON w.id = a.waiter_id
       WHERE s.token_hash = $1 AND s.expires_at > now() AND s.last_seen > now() - interval '2 hours'
         AND a.active AND (a.role = 'manager' OR w.active)`,
      [hash],
    )
  ).rows[0];
  if (!row) return null;
  await pool.query(
    "UPDATE bluebar.sessions SET last_seen = now() WHERE token_hash = $1 AND last_seen < now() - interval '1 minute'",
    [hash],
  );
  return { id: row.id, role: row.role, waiterId: row.waiter_id, name: row.name };
}
export const endSession = (pool, token) =>
  pool.query("DELETE FROM bluebar.sessions WHERE token_hash = $1", [sha256(token)]);

const bad = () => new AppError("Kredenciale të pasakta ose llogari e bllokuar përkohësisht.", 401);
// The attempt is counted before the secret is checked, so parallel guesses cannot outrun the lockout.
const reserve = async (pool, waiterId, username) =>
  (
    await pool.query(
      `UPDATE bluebar.accounts a
       SET failed_attempts = failed_attempts + 1,
           locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
       WHERE ((a.role = 'waiter' AND a.waiter_id = $1) OR (a.role = 'manager' AND a.username = $2))
         AND a.active AND (a.locked_until IS NULL OR a.locked_until <= now())
         AND (a.role = 'manager' OR EXISTS (SELECT 1 FROM bluebar.waiters w WHERE w.id = a.waiter_id AND w.active))
       RETURNING a.id, a.secret_hash, a.pattern_hash`,
      [waiterId, username],
    )
  ).rows[0];
const clear = (pool, id) =>
  pool.query("UPDATE bluebar.accounts SET failed_attempts = 0, locked_until = NULL WHERE id = $1", [id]);

export async function loginWaiterPattern(pool, { waiterId, pattern }) {
  const a = await reserve(pool, waiterId, null);
  const ok = await verifySecret(validPattern(pattern) ? patternSecret(pattern) : "invalid", a?.pattern_hash ?? (await decoyHash()));
  if (!a || !a.pattern_hash || !ok) throw bad();
  await clear(pool, a.id);
  return a.id;
}
export async function setWaiterPattern(pool, waiterId, pattern) {
  if (!validPattern(pattern)) throw new AppError("Lidhni të paktën 4 pika të ndryshme.");
  const r = await pool.query(
    `INSERT INTO bluebar.accounts(role, waiter_id, pattern_hash)
     SELECT 'waiter', w.id, $2 FROM bluebar.waiters w WHERE w.id = $1
     ON CONFLICT (waiter_id) DO UPDATE SET pattern_hash = $2, failed_attempts = 0, locked_until = NULL
     RETURNING id`,
    [waiterId, await hashSecret(patternSecret(pattern))],
  );
  if (!r.rows[0]) throw new AppError("Kamarieri nuk ekziston.", 404);
  await pool.query("DELETE FROM bluebar.sessions WHERE account_id = $1", [r.rows[0].id]);
}
export async function loginWaiter(pool, { waiterId, pin }) {
  const a = await reserve(pool, waiterId, null);
  const ok = await verifySecret(pin, a?.secret_hash ?? (await decoyHash()));
  if (!a || !ok) throw bad();
  await clear(pool, a.id);
  return a.id;
}
// No username at login: the PIN alone must pick the account. Every eligible manager
// row is reserved (attempt counted) atomically before any hash is checked, so this
// keeps the same race-safe lockout guarantee as the single-account waiter/manager
// lookup above — a wrong guess still can't outrun concurrent parallel attempts.
// With one manager (the common case) this behaves identically to before; with several,
// a wrong PIN charges all of them, so one mistyped guess can lock out every manager.
const reserveManagers = async (pool) =>
  (
    await pool.query(
      `UPDATE bluebar.accounts a
       SET failed_attempts = failed_attempts + 1,
           locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
       WHERE a.role = 'manager' AND a.active AND (a.locked_until IS NULL OR a.locked_until <= now())
       RETURNING a.id, a.secret_hash`,
    )
  ).rows;
export async function loginManager(pool, { pin }) {
  const candidates = await reserveManagers(pool);
  for (const c of candidates)
    if (await verifySecret(pin, c.secret_hash)) {
      await clear(pool, c.id);
      return c.id;
    }
  if (!candidates.length) await verifySecret(pin, await decoyHash());
  throw bad();
}

// Same trick as loginManager, but scoped to waiters (pin_only login mode): every
// eligible waiter account is reserved atomically before any hash is checked, so this
// keeps the same race-safe lockout guarantee with no name/waiterId given up front.
// A wrong guess charges every active waiter's lockout counter — the same tradeoff
// loginManager already accepts with several managers.
const reserveWaitersByPin = async (pool) =>
  (
    await pool.query(
      `UPDATE bluebar.accounts a
       SET failed_attempts = failed_attempts + 1,
           locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
       FROM bluebar.waiters w
       WHERE a.role = 'waiter' AND a.waiter_id = w.id AND w.active AND a.active
         AND (a.locked_until IS NULL OR a.locked_until <= now())
       RETURNING a.id, a.secret_hash`,
    )
  ).rows;
export async function loginWaiterByPin(pool, pin) {
  const candidates = await reserveWaitersByPin(pool);
  for (const c of candidates)
    if (await verifySecret(pin, c.secret_hash ?? (await decoyHash()))) {
      await clear(pool, c.id);
      return c.id;
    }
  if (!candidates.length) await verifySecret(pin, await decoyHash());
  throw bad();
}

export async function setWaiterPin(pool, waiterId, pin) {
  if (!validPin(pin)) throw new AppError("PIN-i është shumë i thjeshtë. Shmangni shifra të përsëritura ose në varg.");
  const r = await pool.query(
    `INSERT INTO bluebar.accounts(role, waiter_id, secret_hash)
     SELECT 'waiter', w.id, $2 FROM bluebar.waiters w WHERE w.id = $1
     ON CONFLICT (waiter_id) DO UPDATE SET secret_hash = $2, failed_attempts = 0, locked_until = NULL
     RETURNING id`,
    [waiterId, await hashSecret(pin)],
  );
  if (!r.rows[0]) throw new AppError("Kamarieri nuk ekziston.", 404);
  await pool.query("DELETE FROM bluebar.sessions WHERE account_id = $1", [r.rows[0].id]);
}
const genPin = () => {
  let p;
  do p = String(randomInt(1000000)).padStart(6, "0");
  while (!validPin(p));
  return p;
};
// Creates or resets a manager. The generated PIN is returned once; only its hash is stored.
export async function createManager(pool, username) {
  const pin = genPin();
  const r = await pool.query(
    `INSERT INTO bluebar.accounts(role, username, secret_hash) VALUES('manager', $1, $2)
     ON CONFLICT (username) DO UPDATE SET secret_hash = $2, failed_attempts = 0, locked_until = NULL, active = true
     RETURNING id`,
    [username, await hashSecret(pin)],
  );
  await pool.query("DELETE FROM bluebar.sessions WHERE account_id = $1", [r.rows[0].id]);
  return { id: r.rows[0].id, pin };
}
