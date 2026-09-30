import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "./migrate.js";
import { buildApp } from "./app.js";
import { execute, readSnapshot } from "./repository.js";
import { applyCommand } from "./commands.js";
import { createManager, setWaiterPin } from "./auth.js";
import { initialState } from "../src/domain.js";
import { encode, runOnce, textBytes } from "../public/bluebar-print.mjs";

// A network receipt printer: accepts raw ESC/POS on TCP and keeps what it received.
async function fakePrinter() {
  const jobs = [];
  const server = net.createServer((socket) => {
    const chunks = [];
    socket.on("data", (c) => chunks.push(c));
    socket.on("end", () => jobs.push(Buffer.concat(chunks)));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { port: server.address().port, jobs, close: () => new Promise((r) => server.close(r)) };
}
const has = (buffer, text) => buffer.includes(Buffer.from(textBytes(text)));

test("encode wraps to the paper width and keeps Albanian letters in code page 850", () => {
  const bytes = encode([{ type: "pair", left: "2 x Picë Margarita e madhe", right: "1,100 Lek" }], 32);
  assert.ok(bytes.includes(Buffer.from([0x1b, 0x74, 0x02])), "selects CP850");
  assert.ok(bytes.includes(Buffer.from([0x89])), "ë is 0x89 in CP850");
  const lines = bytes.toString("latin1").split("\n").filter((l) => l.includes("Lek") || l.includes("Pic"));
  assert.ok(lines.every((l) => l.replace(/^[\x00-\x1f\x1b@t\x02]+/, "").length <= 32));
  assert.ok(encode([{ type: "rule" }], 56).includes(Buffer.from("-".repeat(56))), "88 mm receipts use 56 columns");
  assert.deepEqual(textBytes("Ëmbëltore", true), [...Buffer.from("Embeltore")]);
});

test("cashier printers default to 88 mm while station printers keep 80 mm", () => {
  const cashier = applyCommand(initialState(), "printer.save", {
    name: "Arka", host: "127.0.0.1", departments: [], receipts: true,
  }).state;
  const station = applyCommand(cashier, "printer.save", {
    name: "Bari", host: "127.0.0.1", departments: ["Tjetër"], receipts: false,
  }).state;
  assert.equal(station.printers.find((p) => p.name === "Arka").width, 56);
  assert.equal(station.printers.find((p) => p.name === "Bari").width, 48);
});

test("88 mm migration upgrades existing cashier printers without widening station printers", async () => {
  const db = new PGlite();
  const query = (sql, params) => (params ? db.query(sql, params) : db.exec(sql).then((r) => r.at(-1) || { rows: [] }));
  const pool = { query, connect: async () => ({ query, release() {} }) };
  try {
    await migrate(pool);
    await pool.query("INSERT INTO bluebar.printers(name,host,width,receipts) VALUES ('Bari','127.0.0.1',48,false),('Arka','127.0.0.1',48,true)");
    await pool.query("ALTER TABLE bluebar.printers DROP CONSTRAINT printers_width_check");
    await pool.query("ALTER TABLE bluebar.printers ADD CONSTRAINT printers_width_check CHECK (width IN (32,42,48))");
    await pool.query(await readFile(new URL("./migrations/010_receipt_88mm.sql", import.meta.url), "utf8"));
    const { rows } = await pool.query("SELECT name,width FROM bluebar.printers ORDER BY name");
    assert.deepEqual(rows, [{ name: "Arka", width: 56 }, { name: "Bari", width: 48 }]);
  } finally {
    await db.close();
  }
});

test("print agent: each department's ticket reaches its own network printer; the full invoice reaches the cashier", async () => {
  const db = new PGlite();
  const query = (sql, params) => (params ? db.query(sql, params) : db.exec(sql).then((r) => r.at(-1) || { rows: [] }));
  const pool = { query, connect: async () => ({ query, release() {} }) };
  await migrate(pool);
  let data = await readSnapshot(pool);
  const seed = async (type, payload) => (data = await execute(pool, { id: randomUUID(), version: data.version, type, payload }));
  await seed("waiter.create", { name: "Ana" });
  await setWaiterPin(pool, 1, "482913");
  const manager = await createManager(pool, "boss");
  await seed("shift.open", { opening: 0 });
  for (const [name, department, category] of [["Ujë", "Bar", "Pije"], ["Picë", "Restorant", "Ushqim"], ["Tiramisu", "Ëmbëltore", "Ushqim"]]) {
    await seed("product.save", { name, price: 200, category, department });
    await seed("stock.receive", { productId: data.state.products.at(-1).id, qty: 20 });
  }

  const [bar, kitchen, cashier] = [await fakePrinter(), await fakePrinter(), await fakePrinter()];
  const app = buildApp({ pool, origins: [] });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const url = `http://127.0.0.1:${app.server.address().port}`;
  const call = (method, path, { cookie, body, key } = {}) =>
    fetch(url + path, {
      method,
      headers: {
        "x-bluebar-client": "1",
        ...(cookie && { cookie }),
        ...(key && { authorization: `Bearer ${key}` }),
        ...(body && { "content-type": "application/json" }),
      },
      body: body && JSON.stringify(body),
    });
  const login = async (path, body) => (await call("POST", path, { body })).headers.get("set-cookie").split(";")[0];
  const boss = await login("/api/auth/manager-login", { pin: manager.pin });
  const ana = await login("/api/auth/waiter-login", { waiterId: 1, pin: "482913" });
  const cmd = async (cookie, type, payload) => {
    const { version } = await (await call("GET", "/api/state", { cookie: boss })).json();
    const r = await call("POST", "/api/commands", { cookie, body: { id: randomUUID(), version, type, payload } });
    assert.equal(r.status, 200, await r.clone().text());
    return r.json();
  };
  try {
    await cmd(boss, "printer.save", { name: "Bari", host: "127.0.0.1", port: bar.port, departments: ["Bar"] });
    await cmd(boss, "printer.save", { name: "Kuzhina", host: "127.0.0.1", port: kitchen.port, width: 32, departments: ["Restorant", "Ëmbëltore"] });
    await cmd(boss, "printer.save", { name: "Arka", host: "127.0.0.1", port: cashier.port, departments: [], receipts: true });
    const printers = (await readSnapshot(pool)).state.printers;
    assert.equal(printers.find((p) => p.name === "Arka").width, 56);
    assert.equal(printers.find((p) => p.name === "Bari").width, 48);
    assert.equal((await call("POST", "/api/print/key", { cookie: ana })).status, 403, "only a manager creates the agent key");
    const { key } = await (await call("POST", "/api/print/key", { cookie: boss })).json();
    assert.equal((await call("GET", "/api/print/jobs")).status, 401);
    assert.equal((await call("GET", "/api/print/jobs", { key: "x".repeat(32) })).status, 401);
    const agent = { url, venue: "bluebar", key };

    // Water + pizza + tiramisu: one "Dërgo", three tickets, two printers.
    for (const productId of [1, 2, 3]) await cmd(ana, "order.add", { tableId: 1, productId, waiterId: 1 });
    await cmd(ana, "order.send", { tableId: 1 });
    assert.equal(await runOnce(agent), 3);
    assert.equal(bar.jobs.length, 1);
    assert.ok(has(bar.jobs[0], "BAR") && has(bar.jobs[0], "1 x Ujë") && !has(bar.jobs[0], "Picë"));
    assert.equal(kitchen.jobs.length, 2);
    assert.ok(kitchen.jobs.some((j) => has(j, "RESTORANT") && has(j, "1 x Picë")));
    assert.ok(kitchen.jobs.some((j) => has(j, "ËMBËLTORE") && has(j, "1 x Tiramisu")));
    assert.equal(cashier.jobs.length, 0);
    assert.equal(await runOnce(agent), 0, "printed jobs never print twice");

    // "Konfirmo dhe fiskalizo": the cashier's copy waits for the NIVF, then prints with it.
    await cmd(ana, "order.pay", { tableId: 1, method: "Kartë", fiscalize: true });
    assert.equal(await runOnce(agent), 0);
    await pool.query("UPDATE bluebar.invoices SET fiscal_status='fiskalizuar', fiscal_iic='IIC-9', fiscal_fic='FIC-9' WHERE id=1");
    assert.equal(await runOnce(agent), 1);
    assert.ok(has(cashier.jobs[0], "FATURË E FISKALIZUAR") && has(cashier.jobs[0], "NIVF: IIC-9"));
    assert.ok(has(cashier.jobs[0], "TOTALI") && has(cashier.jobs[0], "600 Lek"));
    assert.ok(cashier.jobs[0].includes(Buffer.from("-".repeat(56))), "cashier receipt spans 56 columns on 88 mm paper");

    // A printer that's off loses nothing: the ticket prints once it's back.
    await cmd(boss, "printer.save", { id: 1, name: "Bari", host: "127.0.0.1", port: 1, departments: ["Bar"] });
    await cmd(ana, "order.add", { tableId: 2, productId: 1, waiterId: 1 });
    await cmd(ana, "order.send", { tableId: 2 });
    assert.equal(await runOnce(agent), 0);
    const status = await (await call("GET", "/api/print/status", { cookie: boss })).json();
    assert.equal(status.pending, 1);
    assert.ok(status.lastSeen, "the agent's polling shows as online");
    await cmd(boss, "printer.save", { id: 1, name: "Bari", host: "127.0.0.1", port: bar.port, departments: ["Bar"] });
    assert.equal(await runOnce(agent), 1);
    assert.equal(bar.jobs.length, 2);

    // Reprint and test print go through the network printer too.
    assert.deepEqual(await (await call("POST", "/api/print/reprint", { cookie: ana, body: { kind: "invoice", id: "1" } })).json(), { queued: true });
    assert.equal((await call("POST", "/api/print/test", { cookie: boss, body: { printerId: 2 } })).status, 200);
    assert.equal(await runOnce(agent), 2);
    assert.ok(has(kitchen.jobs.at(-1), "PROVË PRINTIMI"));
    assert.equal(cashier.jobs.length, 2);
  } finally {
    await app.close();
    await Promise.all([bar, kitchen, cashier].map((p) => p.close()));
    await db.close();
  }
});

test("pairing a venue computer: one-time code → installer → key → the bash agent prints", async () => {
  const { spawn, spawnSync } = await import("node:child_process");
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const db = new PGlite();
  const query = (sql, params) => (params ? db.query(sql, params) : db.exec(sql).then((r) => r.at(-1) || { rows: [] }));
  const pool = { query, connect: async () => ({ query, release() {} }) };
  await migrate(pool);
  await execute(pool, { id: randomUUID(), version: 0, type: "waiter.create", payload: { name: "Ana" } });
  await setWaiterPin(pool, 1, "482913");
  const manager = await createManager(pool, "boss");
  const printer = await fakePrinter();
  const app = buildApp({ pool, origins: [], allowedHosts: ["127.0.0.1"] });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const url = `http://127.0.0.1:${app.server.address().port}`;
  const call = (method, path, { cookie, body, headers = { "x-bluebar-client": "1" } } = {}) =>
    fetch(url + path, {
      method,
      headers: { ...headers, ...(cookie && { cookie }), ...(body && { "content-type": "application/json" }) },
      body: body && JSON.stringify(body),
    });
  const login = async (path, body) => (await call("POST", path, { body })).headers.get("set-cookie").split(";")[0];
  const home = await mkdtemp(join(tmpdir(), "bluebar-agent-"));
  let agent;
  try {
    const boss = await login("/api/auth/manager-login", { pin: manager.pin });
    const ana = await login("/api/auth/waiter-login", { waiterId: 1, pin: "482913" });
    assert.equal((await call("POST", "/api/print/pairing", { cookie: ana })).status, 403);
    const { code } = await (await call("POST", "/api/print/pairing", { cookie: boss })).json();
    assert.match(code, /^\d{6}$/);

    // The installer needs no BlueBar header (curl | bash, a download link) and knows this server.
    const sh = await (await call("GET", `/api/print/install/${code}.sh`, { headers: {} })).text();
    assert.ok(sh.includes(`URL='${url}'`) && sh.includes(`CODE='${code}'`));
    assert.equal(spawnSync("bash", ["-n"], { input: sh }).status, 0, "installer is valid bash");
    const cmd = await call("GET", `/api/print/install/${code}.cmd`, { headers: {} });
    assert.match(cmd.headers.get("content-disposition"), /attachment; filename="BlueBar Print.cmd"/);
    assert.match(await cmd.text(), /\r\n/);
    assert.ok((await (await call("GET", `/api/print/install/${code}.ps1`, { headers: {} })).text()).includes(`$Code = '${code}'`));
    assert.equal((await call("GET", "/api/print/install/12345.sh", { headers: {} })).status, 404);

    // The code works once, and only the right one.
    const wrong = code === "000000" ? "000001" : "000000";
    assert.equal((await call("POST", "/api/print/pair", { body: { code: wrong } })).status, 400);
    const paired = await call("POST", "/api/print/pair?format=lines", { body: { code } });
    assert.equal(paired.status, 200);
    const [venue, key, name] = (await paired.text()).split("\n");
    assert.deepEqual([venue, name], ["bluebar", "BlueBar"]);
    assert.equal((await call("POST", "/api/print/pair", { body: { code } })).status, 400, "a code is single-use");

    // A job, fetched as ready ESC/POS bytes.
    const { version } = await (await call("GET", "/api/state", { cookie: boss })).json();
    await call("POST", "/api/commands", {
      cookie: boss,
      body: { id: randomUUID(), version, type: "printer.save", payload: { name: "Bari", host: "127.0.0.1", port: printer.port, departments: ["Bar"] } },
    });
    await call("POST", "/api/print/test", { cookie: boss, body: { printerId: 1 } });
    const auth = { "x-bluebar-client": "1", "x-bluebar-venue": venue, authorization: `Bearer ${key}` };
    const lines = await (await call("GET", "/api/print/jobs?format=lines", { headers: auth })).text();
    const [, host, port, data] = lines.split(" ");
    assert.deepEqual([host, Number(port)], ["127.0.0.1", printer.port]);
    const bytes = Buffer.from(data, "base64");
    assert.deepEqual([...bytes.subarray(0, 2)], [0x1b, 0x40], "starts with ESC @");

    // The real agent the installer writes, run against that job.
    await mkdir(join(home, ".bluebar-print"));
    await writeFile(join(home, ".bluebar-print", "config"), `URL='${url}'\nVENUE='${venue}'\nKEY='${key}'\n`);
    const agentScript = sh.split("<<'AGENT'\n")[1].split("\nAGENT\n")[0];
    agent = spawn("bash", ["-c", agentScript], { env: { ...process.env, HOME: home }, stdio: "ignore" });
    for (let i = 0; i < 100 && !printer.jobs.length; i++) await new Promise((r) => setTimeout(r, 100));
    assert.equal(printer.jobs.length, 1);
    assert.deepEqual(printer.jobs[0], bytes, "the printer receives exactly BlueBar's bytes");
    for (let i = 0; i < 50 && (await (await call("GET", "/api/print/jobs?format=lines", { headers: auth })).text()); i++)
      await new Promise((r) => setTimeout(r, 100));
    assert.equal(await (await call("GET", "/api/print/jobs?format=lines", { headers: auth })).text(), "", "reported as printed");
  } finally {
    agent?.kill();
    await rm(home, { recursive: true, force: true });
    await app.close();
    await printer.close();
    await db.close();
  }
});

test("USB printers: saved as usb:<queue>, printed raw through lp, optionally without ë/ç", async () => {
  const { spawn } = await import("node:child_process");
  const { mkdtemp, mkdir, writeFile, readFile: read, rm, chmod } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { installer } = await import("./installers.js");
  const { createAgentKey } = await import("./printing.js");
  const db = new PGlite();
  const query = (sql, params) => (params ? db.query(sql, params) : db.exec(sql).then((r) => r.at(-1) || { rows: [] }));
  const pool = { query, connect: async () => ({ query, release() {} }) };
  await migrate(pool);
  const manager = await createManager(pool, "boss");
  const app = buildApp({ pool, origins: [], allowedHosts: ["127.0.0.1"] });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const url = `http://127.0.0.1:${app.server.address().port}`;
  const home = await mkdtemp(join(tmpdir(), "bluebar-usb-"));
  let agent;
  try {
    // Validation: a queue name keeps its case; anything else in "usb:" is refused.
    const base = { name: "Arka", port: 9100, width: 42, departments: [], receipts: true };
    assert.throws(() => applyCommand(initialState(), "printer.save", { ...base, host: "usb:bad name;rm" }));
    const saved = applyCommand(initialState(), "printer.save", { ...base, host: "usb:GEZHI_micro_printer", ascii: true }).state;
    assert.deepEqual([saved.printers[0].host, saved.printers[0].ascii], ["usb:GEZHI_micro_printer", true]);

    const cookie = (await fetch(`${url}/api/auth/manager-login`, {
      method: "POST", headers: { "x-bluebar-client": "1", "content-type": "application/json" }, body: JSON.stringify({ pin: manager.pin }),
    })).headers.get("set-cookie").split(";")[0];
    const api = (method, path, body, headers = {}) =>
      fetch(url + path, { method, headers: { "x-bluebar-client": "1", cookie, "content-type": "application/json", ...headers }, body: body && JSON.stringify(body) });
    const { version } = await (await api("GET", "/api/state")).json();
    await api("POST", "/api/commands", { id: randomUUID(), version, type: "printer.save", payload: { ...base, host: "usb:GEZHI_micro_printer", ascii: true } });
    const key = await createAgentKey(pool);
    await api("POST", "/api/print/test", { printerId: 1 });

    // The agent reports its local printers; the manager's form lists them.
    const auth = { authorization: `Bearer ${key}`, "x-bluebar-venue": "bluebar", "x-bluebar-usb": "GEZHI_micro_printer,Other,bad name" };
    const line = await (await api("GET", "/api/print/jobs?format=lines", undefined, auth)).text();
    assert.deepEqual((await (await api("GET", "/api/print/status")).json()).usbPrinters, ["GEZHI_micro_printer", "Other"]);
    const bytes = Buffer.from(line.split(" ")[3], "base64");
    assert.ok(!bytes.includes(0x89), "ë is not sent to an ascii printer");
    assert.ok(bytes.includes(Buffer.from("PROVE PRINTIMI")), "it's spelled with e instead");

    // The bash agent hands it to lp, raw, for that queue. A fake lp records the call.
    const bin = join(home, "bin");
    await mkdir(bin);
    await writeFile(join(bin, "lp"), `#!/bin/bash\necho "$@" > "${home}/lp-args"\ncat "\${@: -1}" > "${home}/lp-data"\n`);
    await writeFile(join(bin, "lpstat"), "#!/bin/bash\necho GEZHI_micro_printer\n");
    await chmod(join(bin, "lp"), 0o755);
    await chmod(join(bin, "lpstat"), 0o755);
    await mkdir(join(home, ".bluebar-print"));
    await writeFile(join(home, ".bluebar-print", "config"), `URL='${url}'\nVENUE='bluebar'\nKEY='${key}'\n`);
    const sh = installer("sh", url, "123456");
    const agentScript = sh.split("<<'AGENT'\n")[1].split("\nAGENT\n")[0];
    agent = spawn("bash", ["-c", agentScript], { env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` }, stdio: "ignore" });
    let args = "";
    for (let i = 0; i < 100 && !args; i++) {
      await new Promise((r) => setTimeout(r, 100));
      args = await read(join(home, "lp-args"), "utf8").catch(() => "");
    }
    assert.match(args, /^-d GEZHI_micro_printer -o raw /);
    assert.deepEqual(await read(join(home, "lp-data")), bytes, "lp receives BlueBar's exact bytes");
  } finally {
    agent?.kill();
    await rm(home, { recursive: true, force: true });
    await app.close();
    await db.close();
  }
});

test("a printer without a working cutter is never sent a cut, and feeds further to tear", () => {
  const doc = [{ type: "text", text: "TOTALI 100 Lek" }];
  const cut = encode(doc, 42);
  const tear = encode(doc, 42, { cut: false });
  assert.ok(cut.includes(Buffer.from([0x1d, 0x56, 0x01])), "cuts with GS V 1");
  assert.ok(!tear.includes(Buffer.from([0x1d, 0x56])), "no cut command at all");
  assert.ok(tear.includes(Buffer.from([0x1b, 0x64, 0x08])), "feeds 8 lines to the tear bar");
  const saved = applyCommand(initialState(), "printer.save", {
    name: "Arka", host: "usb:GEZHI_micro_printer", width: 42, departments: [], receipts: true, cutter: false,
  }).state;
  assert.equal(saved.printers[0].cutter, false);
});

test("printed text can't carry printer commands: control characters are dropped", () => {
  assert.deepEqual(textBytes("Kafe\x1bp\x00\x01\x1d(k X"), [...Buffer.from("Kafep(k X")]);
});
