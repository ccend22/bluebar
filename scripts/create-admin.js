// Usage: npm run auth:admin -- <email> [password]   (creates the superadmin for /admin, or gives
// it a new password; without one, a strong password is made up here and shown once)
import { createPool } from "../server/db.js";
import { setAdminPassword } from "../server/admin.js";

const pool = createPool();
try {
  if (!pool) throw new Error("DATABASE_URL is missing.");
  const { email, password } = await setAdminPassword(pool, process.argv[2], process.argv[3] || undefined);
  console.log(`Superadmin: ${email}\nPassword: ${password}\n\nShown once. Sign in at /admin and change it from the menu at the top right.\nRun this command again to reset it.`);
} catch (e) {
  console.error("Failed:", e.code === "42P01" ? "run npm run db:migrate first." : e.message);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
