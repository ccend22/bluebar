// Usage: npm run auth:manager -- <username>   (creates the manager, or resets the PIN if it exists)
import { createPool } from "../server/db.js";
import { createManager } from "../server/auth.js";
import { resolveVenue, tenantPool } from "../server/tenants.js";

const username = (process.argv[2] || "").toLowerCase();
if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
  console.error("Usage: npm run auth:manager -- <username>   (3-32 chars: a-z 0-9 . _ -)");
  process.exit(1);
}
const pool = createPool();
try {
  if (!pool) throw new Error("DATABASE_URL is missing.");
  const venue = await resolveVenue(pool, process.argv[3] || "bluebar");
  const { pin } = await createManager(tenantPool(pool, venue.schema_name), username);
  console.log(`Business: ${venue.slug}\nManager: ${username}\nPIN: ${pin}\n\nShown once. Store it somewhere safe; run this command again to reset.`);
} catch (e) {
  console.error("Failed:", e.code === "42P01" ? "run npm run db:migrate first." : e.message);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
