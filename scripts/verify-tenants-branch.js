import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createPool } from "../server/db.js";
import { migrate } from "../server/migrate.js";
import { verifyTenants } from "../server/verify-tenants.js";
// Explicit disposable branch; never reads the production DATABASE_URL.
// Mirrors verify-neon-branch.js, but for the schema-per-tenant isolation logic:
// PGlite (used by tenants.test.js) doesn't fully emulate advisory locks and schema
// creation the way real Postgres does, so this is the real check before onboarding
// actual businesses on a given branch.
const project = "wandering-rice-50334443",
  branch = "br-purple-thunder-zap71blp";
let pool;
try {
  const { stdout } = await promisify(execFile)(
    "neon",
    ["connection-string", branch, "--project-id", project, "--ssl", "verify-full"],
    { maxBuffer: 1024 * 1024 },
  );
  const url = stdout
    .split("\n")
    .map((s) => s.trim())
    .find((s) => /^postgres(?:ql)?:\/\//.test(s));
  if (!url) throw Error("No connection string returned");
  pool = createPool(url);
  await migrate(pool);
  console.log(JSON.stringify(await verifyTenants(pool)));
} catch (e) {
  console.error("Isolated Neon tenant validation failed:", e.code || e.name);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
