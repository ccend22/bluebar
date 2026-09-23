import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "./migrate.js";
import { execute } from "./repository.js";
import { verifyTenants } from "./verify-tenants.js";


test("businesses isolate data, cookies, IDs, PINs, networks, invoices and migrations", async () => {
  const db = new PGlite();
  const query = (sql, params) => params ? db.query(sql, params) : db.exec(sql).then(r => r.at(-1) || { rows: [] });
  const pool = { query, connect: async () => ({ query, release() {} }) };
  try {
    await migrate(pool);
    await execute(pool, { id: randomUUID(), version: 0, type: "shift.open", payload: { opening: 5000 } });
    await verifyTenants(pool);
  } finally { await db.close(); }
});
