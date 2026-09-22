import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createPool } from "../server/db.js";
import { verifyEmptyDatabase } from "../server/verify.js";
// Explicit disposable branch; never reads the production DATABASE_URL.
const project = "wandering-rice-50334443",
  branch = "br-purple-thunder-zap71blp";
let pool;
try {
  const { stdout } = await promisify(execFile)(
    "neon",
    [
      "connection-string",
      branch,
      "--project-id",
      project,
      "--ssl",
      "verify-full",
    ],
    { maxBuffer: 1024 * 1024 },
  );
  const url = stdout
    .split("\n")
    .map((s) => s.trim())
    .find((s) => /^postgres(?:ql)?:\/\//.test(s));
  if (!url) throw Error("No connection string returned");
  pool = createPool(url);
  console.log(JSON.stringify(await verifyEmptyDatabase(pool)));
} catch (e) {
  console.error("Isolated Neon validation failed:", e.code || e.name);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
