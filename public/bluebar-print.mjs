#!/usr/bin/env node
// BlueBar print agent — runs on one always-on computer inside the venue (Windows, macOS
// or Linux; only Node 18+ is needed). It collects print jobs from BlueBar and sends each
// straight to its network printer as ESC/POS over TCP (port 9100): no drivers, no print
// dialogs, and every department's ticket lands on its own printer.
//
//   node bluebar-print.mjs --url https://bluebar.vercel.app --venue bluebar --key <çelësi>
//
// Options can also come from BLUEBAR_URL, BLUEBAR_VENUE, BLUEBAR_PRINT_KEY. Add --ascii
// for printers without code page 850 (prints ë as e).
import net from "node:net";
import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ESC = 0x1b;
const GS = 0x1d;
const FS = 0x1c;
// Code page 850 covers the Albanian letters; everything else falls back to plain ASCII.
const CP850 = {
  Ç: 0x80, ü: 0x81, é: 0x82, â: 0x83, ä: 0x84, à: 0x85, ç: 0x87, ê: 0x88, ë: 0x89,
  è: 0x8a, ï: 0x8b, î: 0x8c, Ä: 0x8e, É: 0x90, ô: 0x93, ö: 0x94, û: 0x96, ù: 0x97,
  Ö: 0x99, Ü: 0x9a, "×": 0x9e, á: 0xa0, í: 0xa1, ó: 0xa2, ú: 0xa3, ñ: 0xa4, Ñ: 0xa5,
  Ë: 0xd3, "·": 0xfa,
};
const plain = (ch) => ch.normalize("NFD").replace(/[̀-ͯ]/g, "");

export function textBytes(text, ascii = false) {
  const out = [];
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    // Control characters (ESC, GS, …) would be read as printer commands: drop them.
    if (code < 0x20 || code === 0x7f) continue;
    if (code < 0x80) out.push(code);
    else if (!ascii && CP850[ch]) out.push(CP850[ch]);
    else if (ch === "·") out.push(0x2d);
    else for (const c of plain(ch)) out.push(c.codePointAt(0) < 0x80 ? c.codePointAt(0) : 0x3f);
  }
  return out;
}

const wrap = (text, width) => {
  const lines = [];
  let line = "";
  for (const word of String(text).split(/\s+/)) {
    if (!word) continue;
    if ((line ? line.length + 1 : 0) + word.length <= width) line = line ? `${line} ${word}` : word;
    else {
      if (line) lines.push(line);
      line = word;
      while (line.length > width) {
        lines.push(line.slice(0, width));
        line = line.slice(width);
      }
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
};
// Left text wraps; the amount stays right-aligned on the last line.
const pair = (left, right, width) => {
  const room = Math.max(1, width - right.length - 1);
  const lines = wrap(left, room);
  const last = lines.pop();
  return [...lines, last + " ".repeat(Math.max(1, width - last.length - right.length)) + right];
};

// document: the block list BlueBar's /api/print/jobs returns. width: characters per line
// in the normal font (56 on 88mm paper, 48 on 80mm, 32 on 58mm).
export function encode(document, width = 56, { ascii = false, cut = true } = {}) {
  // init; Chinese double-byte mode off (many Chinese-made printers start in it and turn
  // ë/ç into other symbols); font A (some start in a tiny font that prints too faint
  // to read); code page 850.
  const out = [ESC, 0x40, FS, 0x2e, ESC, 0x4d, 0x00, ESC, 0x74, 0x02];
  const text = (t) => out.push(...textBytes(t, ascii), 0x0a);
  const align = (n) => out.push(ESC, 0x61, n);
  const size = (n) => out.push(GS, 0x21, n);
  const bold = (on) => out.push(ESC, 0x45, on ? 1 : 0);
  for (const block of document) {
    switch (block.type) {
      case "title":
        align(1), bold(true), size(0x11);
        wrap(block.text, Math.floor(width / 2)).forEach(text);
        size(0), bold(false), align(0);
        break;
      case "center":
        align(1);
        wrap(block.text, width).forEach(text);
        align(0);
        break;
      case "pair":
        pair(block.left, block.right, width).forEach(text);
        break;
      case "total":
        bold(true), size(0x01);
        pair(block.left, block.right, width).forEach(text);
        size(0), bold(false);
        break;
      case "big":
        bold(true), size(0x11);
        wrap(block.text, Math.floor(width / 2)).forEach(text);
        size(0), bold(false);
        break;
      case "rule":
        text("-".repeat(width));
        break;
      case "qr": {
        const data = textBytes(block.text, true);
        const len = data.length + 3;
        align(1);
        out.push(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // model 2
        out.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x05); // module size
        out.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x30); // error correction L
        out.push(GS, 0x28, 0x6b, len & 0xff, len >> 8, 0x31, 0x50, 0x30, ...data);
        out.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30); // print
        out.push(0x0a);
        align(0);
        break;
      }
      default:
        wrap(block.text ?? "", width).forEach(text);
    }
  }
  // Feed the last printed line past the cutter / tear bar (a few cm above the print
  // head), then cut with "GS V 1", the basic cut every cutter knows. Without a working
  // cutter no cut is sent: a jammed cutter stops the printer mid-receipt.
  out.push(ESC, 0x64, cut ? 0x06 : 0x08);
  if (cut) out.push(GS, 0x56, 0x01);
  return Buffer.from(out);
}

// "usb:<queue>": a printer on this computer, sent raw through its print queue (CUPS).
function sendToQueue(queue, data) {
  return new Promise((resolve, reject) => {
    const lp = spawn("lp", ["-d", queue, "-o", "raw"], { stdio: ["pipe", "ignore", "pipe"] });
    let error = "";
    lp.stderr.on("data", (c) => (error += c));
    lp.once("error", reject);
    lp.once("close", (code) => (code === 0 ? resolve() : reject(new Error(error.trim() || `lp doli me kodin ${code}`))));
    lp.stdin.end(data);
  });
}
const localPrinters = () =>
  new Promise((resolve) => execFile("lpstat", ["-e"], (e, out) => resolve(e ? "" : out.trim().split(/\s+/).join(","))));

export function sendToPrinter({ host, port }, data, timeout = 5000) {
  if (host.startsWith("usb:")) return sendToQueue(host.slice(4), data);
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(timeout, () => socket.destroy(new Error("Printeri nuk u përgjigj (timeout).")));
    socket.once("error", reject);
    socket.once("connect", () => socket.end(data));
    socket.once("close", (failed) => (failed ? null : resolve()));
  });
}

// One pass: fetch pending jobs, print them, report back. Different printers work in
// parallel; within one printer jobs go in order, and the first failure stops that
// printer for this pass (the rest retry on the next one) so nothing prints out of order.
export async function runOnce({ url, venue, key, ascii = false, send = sendToPrinter, log = () => {} }) {
  const headers = {
    "x-bluebar-client": "1",
    "x-bluebar-venue": venue,
    authorization: `Bearer ${key}`,
    "x-bluebar-usb": await localPrinters(),
  };
  const response = await fetch(`${url}/api/print/jobs`, { headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `BlueBar u përgjigj ${response.status}`);
  const report = (id, result) =>
    fetch(`${url}/api/print/jobs/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify(result),
    });
  const byPrinter = new Map();
  for (const job of body.jobs) {
    const target = `${job.printer.host}:${job.printer.port}`;
    if (!byPrinter.has(target)) byPrinter.set(target, []);
    byPrinter.get(target).push(job);
  }
  let printed = 0;
  await Promise.all(
    [...byPrinter].map(async ([target, jobs]) => {
      for (const job of jobs) {
        try {
          await send(job.printer, encode(job.document, job.printer.width, { ascii: ascii || job.printer.ascii, cut: job.printer.cutter !== false }));
          await report(job.id, { ok: true });
          printed++;
          log(`✓ ${target} · ${job.document[0]?.text ?? ""}`);
        } catch (error) {
          await report(job.id, { ok: false, error: error.message }).catch(() => {});
          log(`✗ ${target} · ${error.message}`);
          break;
        }
      }
    }),
  );
  return printed;
}

function options(argv) {
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    url: (get("--url") || process.env.BLUEBAR_URL || "https://bluebar.vercel.app").replace(/\/+$/, ""),
    venue: get("--venue") || process.env.BLUEBAR_VENUE || "bluebar",
    key: get("--key") || process.env.BLUEBAR_PRINT_KEY,
    ascii: argv.includes("--ascii"),
  };
}

async function main() {
  const config = options(process.argv.slice(2));
  if (!config.key) {
    console.error("Mungon çelësi. Krijojeni te BlueBar → Repartet → Agjenti i printimit, pastaj:");
    console.error("  node bluebar-print.mjs --url https://bluebar.vercel.app --venue bluebar --key <çelësi>");
    process.exit(1);
  }
  const time = () => new Date().toLocaleTimeString();
  console.log(`BlueBar Print · ${config.url} · ${config.venue} — po pret fletë…`);
  let failing = false;
  for (;;) {
    try {
      await runOnce({ ...config, log: (m) => console.log(`${time()} ${m}`) });
      if (failing) console.log(`${time()} Lidhja me BlueBar u rikthye.`);
      failing = false;
    } catch (error) {
      if (!failing) console.error(`${time()} Nuk lidhet me BlueBar: ${error.message} — po riprovoj…`);
      failing = true;
    }
    await new Promise((resolve) => setTimeout(resolve, failing ? 5000 : 2000));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
