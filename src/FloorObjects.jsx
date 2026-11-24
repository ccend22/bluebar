import React, { useEffect, useRef, useState } from "react";
import { Icon } from "./components.jsx";
import { roomBox } from "./floorGeometry.js";

// What furnishes a room besides its tables (Menaxho sallën): walls and windows that divide it,
// doors, plants, sofas, a counter, rugs and signs. Each is { id, kind, x, y, w, h, r, text?,
// area? }: its centre and size in percent of the room, turned r degrees. Drawn in code, so it
// stays sharp at any size; it never takes a tap from a table outside Menaxho sallën.

// The room is 16:10, so a square thing is 1.6 times as tall (in percent) as it is wide.
const SQ = 1.6;
export const OBJECT_KINDS = {
  // Walls and windows keep one thickness (fixed): only their length changes.
  wall: { name: "Mur", w: 25, h: 1.6, min: [3.125, 1.6], fixed: true },
  window: { name: "Dritare", w: 12.5, h: 1.6, min: [3.125, 1.6], fixed: true },
  door: { name: "Derë", w: 8, h: 8 * SQ, square: true, min: [4, 4 * SQ] },
  plant: { name: "Bimë", w: 5.5, h: 5.5 * SQ, square: true, min: [2.5, 2.5 * SQ] },
  sofa: { name: "Divan", w: 20, h: 10, min: [8, 6] },
  armchair: { name: "Kolltuk", w: 6.5, h: 6.5 * SQ, min: [4, 5] },
  counter: { name: "Banak", w: 26, h: 9, min: [6, 4] },
  rug: { name: "Qilim", w: 18, h: 24, min: [5, 5] },
  sign: { name: "Shenjë", w: 12, h: 5, min: [5, 3], text: "Hyrja" },
  column: { name: "Kolonë", w: 4, h: 4 * SQ, square: true, min: [2, 2 * SQ] },
  umbrella: { name: "Çadër", w: 10, h: 10 * SQ, square: true, min: [4, 4 * SQ] },
  stairs: { name: "Shkallë", w: 10, h: 20, min: [5, 8] },
  stage: { name: "Skenë", w: 30, h: 18, min: [10, 8] },
  bench: { name: "Stol", w: 14, h: 5, min: [5, 3] },
  planter: { name: "Fioriera", w: 16, h: 5, min: [5, 3] },
  fridge: { name: "Frigorifer", w: 8, h: 9, min: [4, 5] },
  tv: { name: "Ekran", w: 12, h: 1.6, min: [4, 1.6], fixed: true },
  piano: { name: "Piano", w: 12, h: 16, min: [7, 9] },
  register: { name: "Arka", w: 5, h: 5 * SQ, square: true, min: [3, 3 * SQ] },
  fireplace: { name: "Oxhak", w: 14, h: 6, min: [6, 3] },
  dj: { name: "DJ", w: 14, h: 7, min: [7, 4] },
};
export const newObject = (kind, area) => {
  const k = OBJECT_KINDS[kind];
  return {
    id: `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    kind, x: 50, y: 50, w: k.w, h: k.h, r: 0,
    ...(k.text && { text: k.text }),
    ...(area && { area }),
  };
};

// A leafy plant from above: a pot rim and two rings of leaves, each with its midrib.
function Plant() {
  const leaf = (a, len, wid, fill) => (
    <g key={`${a}-${len}`} transform={`rotate(${a} 50 50)`}>
      <path d={`M50 50 C ${50 - wid} ${50 - len * 0.35}, ${50 - wid * 0.6} ${50 - len * 0.85}, 50 ${50 - len} C ${50 + wid * 0.6} ${50 - len * 0.85}, ${50 + wid} ${50 - len * 0.35}, 50 50Z`} fill={fill} />
      <path d={`M50 50 L50 ${50 - len * 0.92}`} stroke="rgba(255,255,255,0.28)" strokeWidth="0.9" />
    </g>
  );
  return (
    <svg viewBox="0 0 100 100" className="fo-art">
      <circle cx="50" cy="50" r="17" fill="#3b3f44" />
      <circle cx="50" cy="50" r="14" fill="#5a4636" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => leaf(a + 10, 46, 13, "var(--object-color, #2f7a45)"))}
      {[22, 77, 132, 187, 242, 297, 352].map((a) => leaf(a, 36, 11, "var(--leaf-mid, #4e9b5c)"))}
      {[60, 170, 280].map((a) => leaf(a, 24, 8, "var(--leaf-light, #7cbd74)"))}
    </svg>
  );
}

// A door from above: the frame in the wall, the open leaf and the arc it swings through.
function Door() {
  return (
    <svg viewBox="0 0 100 100" className="fo-art">
      <path d="M8 6 A86 86 0 0 1 94 92" fill="rgba(255,255,255,0.18)" stroke="rgba(40,45,52,0.55)" strokeWidth="1.4" strokeDasharray="4 3" />
      <rect x="3" y="4" width="6" height="90" rx="1.5" fill="var(--object-color, #7b5a3d)" stroke="#4d3826" strokeWidth="1" />
      <rect x="0" y="92" width="100" height="6" rx="1" fill="#4a535e" />
      <circle cx="6" cy="92" r="3" fill="#c9cfd6" />
    </svg>
  );
}

// The rest, drawn from above in their own proportions (the viewBox is the default size in the
// room's px, scaled down). On the plan they stretch to the size given; previews keep the shape.
// --object-color is the colour the manager picked; each has its own default.
const c = (fallback) => `var(--object-color, ${fallback})`;
const DRAWN = {
  column: ["0 0 100 100", <>
    <rect x="6" y="6" width="88" height="88" rx="6" fill={c("#d9d4cb")} stroke="#8f877b" strokeWidth="2" />
    <rect x="18" y="18" width="64" height="64" rx="3" fill="rgba(255,255,255,0.28)" stroke="rgba(0,0,0,0.14)" strokeWidth="1.5" />
  </>],
  umbrella: ["0 0 100 100", <>
    <polygon points="50,4 82.5,17.5 96,50 82.5,82.5 50,96 17.5,82.5 4,50 17.5,17.5" fill={c("#2f6f8f")} />
    {[0, 2, 4, 6].map((i) => { const p = (k) => [50 + 46 * Math.cos((k * Math.PI) / 4 - Math.PI / 2), 50 + 46 * Math.sin((k * Math.PI) / 4 - Math.PI / 2)].map((v) => v.toFixed(1)).join(","); return <polygon key={i} points={`50,50 ${p(i)} ${p(i + 1)}`} fill="rgba(255,255,255,0.22)" />; })}
    <circle cx="50" cy="50" r="4" fill="#e8e2d6" stroke="rgba(0,0,0,0.3)" />
  </>],
  stairs: ["0 0 80 100", <>
    <rect x="1" y="1" width="78" height="98" rx="2" fill={c("#8a8f96")} stroke="#5d6269" strokeWidth="2" />
    {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M2 ${10 + i * 10}H78`} stroke="rgba(0,0,0,0.28)" strokeWidth="1.6" />)}
    <path d="M40 88V16M32 26l8-10 8 10" fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </>],
  stage: ["0 0 160 60", <>
    <rect x="1" y="1" width="158" height="58" rx="3" fill={c("#4a3428")} />
    {[12, 24, 36].map((y) => <path key={y} d={`M2 ${y}H158`} stroke="rgba(0,0,0,0.25)" strokeWidth="0.8" />)}
    <rect x="1" y="50" width="158" height="9" rx="2" fill="rgba(0,0,0,0.35)" />
    <rect x="6" y="5" width="12" height="10" rx="1.5" fill="#1b1d20" /><rect x="142" y="5" width="12" height="10" rx="1.5" fill="#1b1d20" />
    <circle cx="80" cy="26" r="3" fill="#c9cfd6" />
  </>],
  bench: ["0 0 180 40", <>
    {[3, 13, 23, 33].map((y) => <rect key={y} x="2" y={y} width="176" height="7" rx="2" fill={c("#9a6a43")} stroke="rgba(60,35,15,0.5)" strokeWidth="0.8" />)}
    <rect x="12" y="1" width="6" height="38" rx="1.5" fill="#33383e" /><rect x="162" y="1" width="6" height="38" rx="1.5" fill="#33383e" />
  </>],
  planter: ["0 0 200 40", <>
    <rect x="1" y="1" width="198" height="38" rx="4" fill={c("#5b6168")} />
    <rect x="6" y="6" width="188" height="28" rx="2" fill="#4a3a2c" />
    {Array.from({ length: 9 }, (_, i) => <circle key={i} cx={16 + i * 21} cy={i % 2 ? 22 : 18} r="11" fill={i % 2 ? "#4e9b5c" : "#2f7a45"} />)}
  </>],
  fridge: ["0 0 100 70", <>
    <rect x="2" y="2" width="96" height="66" rx="4" fill={c("#e9edf1")} stroke="#9aa3ad" strokeWidth="2" />
    <rect x="8" y="50" width="84" height="13" rx="2" fill="#bfe0f0" stroke="#7fa7bd" strokeWidth="1.2" />
    <rect x="44" y="54" width="12" height="3" rx="1.5" fill="#6b747e" />
    <path d="M10 14H90M10 26H90M10 38H90" stroke="rgba(0,0,0,0.08)" strokeWidth="2" />
  </>],
  tv: ["0 0 120 10", <>
    <rect x="0" y="0" width="120" height="10" rx="1.5" fill={c("#1c1f24")} />
    <rect x="4" y="6.5" width="112" height="2" rx="1" fill="#5aa9e6" opacity="0.8" />
  </>],
  piano: ["0 0 120 100", <>
    <path d="M6 80V22Q6 4 30 4Q58 4 72 28Q84 50 114 58V80Z" fill={c("#17191c")} stroke="#000" strokeWidth="1.5" />
    <path d="M14 22Q16 12 30 12Q52 12 64 32" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="2" />
    <rect x="6" y="80" width="108" height="16" rx="1.5" fill="#f6f4ef" stroke="#2a2a2a" strokeWidth="1.2" />
    {Array.from({ length: 15 }, (_, i) => <rect key={i} x={10 + i * 7} y="80" width="3.5" height="9" fill="#1b1b1b" />)}
  </>],
  register: ["0 0 100 100", <>
    <rect x="8" y="8" width="84" height="84" rx="8" fill={c("#3a4048")} />
    <rect x="18" y="14" width="64" height="20" rx="3" fill="#9fd6b0" />
    {Array.from({ length: 12 }, (_, i) => <rect key={i} x={20 + (i % 4) * 16} y={42 + Math.floor(i / 4) * 12} width="10" height="7" rx="1.5" fill="#d7dbe0" />)}
    <rect x="14" y="80" width="72" height="6" rx="2" fill="rgba(0,0,0,0.35)" />
  </>],
  fireplace: ["0 0 150 40", <>
    <rect x="1" y="1" width="148" height="38" rx="3" fill={c("#8b8378")} stroke="#5f584f" strokeWidth="1.5" />
    <rect x="35" y="14" width="80" height="25" rx="2" fill="#231b16" />
    <ellipse cx="75" cy="33" rx="26" ry="7" fill="#e0662c" /><ellipse cx="75" cy="33" rx="14" ry="4" fill="#f6c14b" />
  </>],
  dj: ["0 0 160 50", <>
    <rect x="1" y="1" width="158" height="48" rx="4" fill={c("#22252a")} />
    {[32, 128].map((x) => <g key={x}><circle cx={x} cy="25" r="19" fill="#3a3e45" /><circle cx={x} cy="25" r="16" fill="#111" /><circle cx={x} cy="25" r="4" fill="#d14b4b" /></g>)}
    <rect x="62" y="8" width="36" height="34" rx="3" fill="#3a3e45" />
    {[70, 80, 90].map((x) => <g key={x}><path d={`M${x} 14V36`} stroke="#15171a" strokeWidth="2" /><rect x={x - 3} y={x === 80 ? 18 : 26} width="6" height="4" rx="1" fill="#c9cfd6" /></g>)}
  </>],
};

export function ObjectArt({ kind, text, stretch = false }) {
  if (DRAWN[kind]) return <svg viewBox={DRAWN[kind][0]} className="fo-art fo-art-fit" preserveAspectRatio={stretch ? "none" : undefined}>{DRAWN[kind][1]}</svg>;
  if (kind === "plant") return <Plant />;
  if (kind === "door") return <Door />;
  if (kind === "sign") return <span className="fo-sign-text">{text || "Shenjë"}</span>;
  if (kind === "sofa" || kind === "armchair")
    return (
      <span className="fo-seat-art">
        <i className="fo-back" />
        <i className="fo-arm left" />
        <i className="fo-arm right" />
        <span className="fo-cushions">{Array.from({ length: kind === "sofa" ? 3 : 1 }, (_, i) => <i key={i} />)}</span>
      </span>
    );
  return null; // walls, windows, the counter and rugs are drawn by their box (style.css)
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const round2 = (v) => Math.round(v * 100) / 100;

// Snapping, so a room comes out tidy without effort. A quarter of a table cell is the grid
// (the room is 8 × 5 cells). While an object moves, its edges and centre first catch on what
// is near: the room's walls and centre lines, other objects, tables (a blue guide shows the
// line); failing that its near edge lands on the grid. Alt held: placed freely.
export const STEP_X = 100 / 8 / 4, STEP_Y = 100 / 5 / 4;
// What an object covers on the floor, turned: in percent of the room's width and height
// (the room is 1.6 times as wide as it is tall).
export function boxOf(o) {
  const a = ((o.r || 0) * Math.PI) / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  const W = o.w * SQ, H = o.h;
  const ew = (W * c + H * s) / SQ, eh = W * s + H * c;
  return { l: o.x - ew / 2, c: o.x, r: o.x + ew / 2, t: o.y - eh / 2, m: o.y, b: o.y + eh / 2, ew, eh };
}
function snapAxis(centre, half, lines, step, tol) {
  let best = null;
  for (const off of [-half, 0, half])
    for (const line of lines) {
      const d = line - (centre + off);
      if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, line };
    }
  if (best) return { at: centre + best.d, guide: best.line };
  return { at: Math.round((centre - half) / step) * step + half, guide: null };
}
// The room measured in px for people: 1600 wide, 1000 deep (the plan's 16:10).
export const ROOM_PX = { x: 1600, y: 1000 };
export const toPx = (pct, axis) => Math.round((pct / 100) * ROOM_PX[axis]);
export const fromPx = (px, axis) => round2((px / ROOM_PX[axis]) * 100);
// The whole object stays inside the room's walls, however it is turned.
export function fitRoom(o) {
  const { ew, eh } = boxOf(o);
  return {
    x: round2(ew >= 100 ? 50 : clamp(o.x, ew / 2, 100 - ew / 2)),
    y: round2(eh >= 100 ? 50 : clamp(o.y, eh / 2, 100 - eh / 2)),
  };
}
// Resizing from a handle (n, s, e, w or a corner): the side or corner held follows the pointer
// while the opposite one stays where it is, as in a drawing program. Worked out in the
// object's own turned frame, in pixels, then back to percent of the room. Sizes land on the
// grid (Alt: free); square things keep their shape; walls keep their thickness.
export function resizeFrom(saved, kind, handle, ev, canvas, snap = true) {
  const W = canvas.width, H = canvas.height;
  const a = ((saved.r || 0) * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const px = ev.clientX - (canvas.left + (saved.x / 100) * W), py = ev.clientY - (canvas.top + (saved.y / 100) * H);
  const lx = px * cos + py * sin, ly = -px * sin + py * cos;
  const hw = ((saved.w / 100) * W) / 2, hh = ((saved.h / 100) * H) / 2;
  const dx = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
  const dy = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
  let wpx = (saved.w / 100) * W, hpx = (saved.h / 100) * H;
  if (dx) wpx = dx * (lx + dx * hw);
  if (dy) hpx = dy * (ly + dy * hh);
  if (kind.square) wpx = hpx = Math.max(dx ? wpx : 0, dy ? hpx : 0);
  // While held, the side follows the pointer exactly; let go, it settles onto the grid.
  const grid = (v, step) => (!snap || ev.altKey ? v : Math.round(v / step) * step);
  let w = clamp(grid((wpx / W) * 100, kind.square ? STEP_X / 2 : STEP_X), kind.min[0], 100);
  let h = kind.square ? w * SQ : kind.fixed ? saved.h : clamp(grid((hpx / H) * 100, STEP_Y / 2), kind.min[1], 100);
  // The new centre: half the new size away from the side that stayed put.
  const at = (w2, h2) => {
    const ox = dx ? dx * (((w2 / 100) * W) / 2 - hw) : 0, oy = dy ? dy * (((h2 / 100) * H) / 2 - hh) : 0;
    return { ...saved, w: round2(w2), h: round2(h2), x: saved.x + ((ox * cos - oy * sin) / W) * 100, y: saved.y + ((ox * sin + oy * cos) / H) * 100 };
  };
  // Growing into a wall: the side held stops at the wall, the other stays put (the largest
  // size between the old one and the asked one that still fits).
  const inside = (o) => { const b = boxOf(o); return b.l >= -0.01 && b.r <= 100.01 && b.t >= -0.01 && b.b <= 100.01; };
  let next = at(w, h);
  if (!inside(next) && inside(saved)) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 14; i++) { const t = (lo + hi) / 2; if (inside(at(saved.w + (w - saved.w) * t, saved.h + (h - saved.h) * t))) lo = t; else hi = t; }
    next = at(saved.w + (w - saved.w) * lo, saved.h + (h - saved.h) * lo);
  }
  return { w: next.w, h: next.h, ...fitRoom(next) };
}
// targets: boxes of everything else in the room (boxOf for objects, tables as boxes too).
export function snapPosition(o, targets) {
  const box = boxOf(o);
  const xs = [0, 50, 100, ...targets.flatMap((b) => [b.l, b.c, b.r])];
  const ys = [0, 50, 100, ...targets.flatMap((b) => [b.t, b.m, b.b])];
  const sx = snapAxis(o.x, box.ew / 2, xs, STEP_X, 1.1);
  const sy = snapAxis(o.y, box.eh / 2, ys, STEP_Y, 1.8);
  return {
    x: round2(clamp(sx.at, 0, 100)),
    y: round2(clamp(sy.at, 0, 100)),
    guides: [sx.guide !== null && { axis: "x", at: sx.guide }, sy.guide !== null && { axis: "y", at: sy.guide }].filter(Boolean),
  };
}

// One object in the room. editing: it can be taken hold of; selected: handles to turn and size.
export function FloorObject({ o: saved, color, changedColor, editing, isSelected, onSelect, onChange, onCopy, targets = [], onGuides }) {
  const [live, setLive] = useState(null);
  const liveRef = useRef(null);
  const ref = useRef(null);
  const hold = useRef(null);
  const lastClick = useRef(0);
  // The saved room changed (this object came back from the server): show it as saved.
  useEffect(() => { if (!liveRef.current) setLive(null); }, [saved.x, saved.y, saved.w, saved.h, saved.r, saved.kind]);
  useEffect(() => () => clearTimeout(hold.current), []);
  const o = live ? { ...saved, ...live } : saved;
  const kind = OBJECT_KINDS[o.kind] || OBJECT_KINDS.plant;
  const set = (patch) => setLive((liveRef.current = { ...liveRef.current, ...patch }));
  // finish(lastEvent, canvas): the final change when let go (a resize settling on the grid).
  const drag = (step, finish) => (e) => {
    if (!editing) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(o.id);
    const canvas = roomBox(ref.current.closest(".floor-plan"));
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const from = { x: e.clientX, y: e.clientY };
    let moved = false, last = null;
    liveRef.current = null;
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - from.x, ev.clientY - from.y) < 5) return;
      moved = true;
      last = ev;
      step(ev, canvas, from);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      if (moved && finish && last) liveRef.current = { ...liveRef.current, ...finish(last, canvas) };
      onGuides?.([]);
      if (moved && liveRef.current) {
        // It keeps where it was put until the room comes back saved, so it never jumps back.
        const { sizing, ...patch } = liveRef.current;
        onChange(o.id, patch);
        setLive(patch);
        clearTimeout(hold.current);
        hold.current = setTimeout(() => setLive(null), 4000);
      } else setLive(null);
      liveRef.current = null;
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };
  const centre = (canvas) => ({ cx: canvas.left + (saved.x / 100) * canvas.width, cy: canvas.top + (saved.y / 100) * canvas.height });
  return (
    <div
      ref={ref}
      className={`fp-object fo-${o.kind} ${isSelected ? "selected" : ""} ${color ? "has-object-color" : ""} ${changedColor ? "drafted-color" : ""} ${live && liveRef.current ? "dragging" : ""} ${live?.sizing ? "sizing" : ""}`}
      style={{ left: `${o.x}%`, top: `${o.y}%`, width: `${o.w}%`, height: `${o.h}%`, transform: `translate(-50%, -50%) rotate(${o.r || 0}deg)`, "--object-color": color }}
      role={editing ? "button" : undefined}
      tabIndex={editing ? 0 : undefined}
      aria-label={editing ? `${kind.name}${o.text ? `: ${o.text}` : ""}` : undefined}
      aria-hidden={editing ? undefined : o.kind === "sign" ? undefined : "true"}
      onClick={(e) => {
        if (!editing) return;
        e.stopPropagation();
        onSelect(o.id);
        // Two clicks (or taps) in a row: a copy of it, next to it.
        const now = Date.now();
        if (e.detail === 2 || (e.detail < 2 && now - lastClick.current < 600)) (lastClick.current = 0, onCopy?.(o.id));
        else lastClick.current = now;
      }}
      onKeyDown={(e) => editing && (e.key === "Enter" || e.key === " ") && onSelect(o.id)}
      onPointerDown={drag((ev, canvas, from) => {
        const free = { ...saved, x: clamp(saved.x + ((ev.clientX - from.x) / canvas.width) * 100, 0, 100), y: clamp(saved.y + ((ev.clientY - from.y) / canvas.height) * 100, 0, 100) };
        if (ev.altKey) return (onGuides?.([]), set(fitRoom(free)));
        const { x, y, guides } = snapPosition(free, targets);
        onGuides?.(guides);
        set(fitRoom({ ...free, x, y }));
      })}
    >
      <ObjectArt kind={o.kind} text={o.text} stretch />
      {/* Its size while being resized, in the room's px (1600 × 1000), upright whatever its turn. */}
      {live?.sizing && <span className="fo-dims" style={{ transform: `translate(-50%, 0) rotate(${-(o.r || 0)}deg)` }}>{toPx(o.w, "x")} × {toPx(o.h, "y")}</span>}
      {editing && isSelected && (
        <>
          <button
            type="button"
            className="fp-handle fp-rotate"
            aria-label={`Rrotullo: ${kind.name}`}
            style={{ transform: `rotate(${-(o.r || 0)}deg) translateY(-26px)` }}
            onPointerDown={drag((ev, canvas) => {
              const { cx, cy } = centre(canvas);
              const raw = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90;
              // 45° steps (any angle with Alt): straight, square-on or on the diagonal.
              const stepR = ev.altKey ? 1 : 45;
              const r = ((Math.round(raw / stepR) * stepR) % 360 + 360) % 360;
              set({ r, ...fitRoom({ ...saved, r }) });
            })}
          >
            <Icon name="rotate" size={13} />
          </button>
          {(kind.fixed ? ["w", "e"] : kind.square ? ["nw", "ne", "se", "sw"] : ["nw", "n", "ne", "e", "se", "s", "sw", "w"]).map((h) => (
            <button
              key={h}
              type="button"
              className={`fo-h fo-h-${h}`}
              aria-label={`Ndrysho madhësinë nga ${{ n: "lart", s: "poshtë", e: "djathtas", w: "majtas", ne: "qoshja lart djathtas", nw: "qoshja lart majtas", se: "qoshja poshtë djathtas", sw: "qoshja poshtë majtas" }[h]}: ${kind.name}`}
              onPointerDown={drag(
                (ev, canvas) => set({ ...resizeFrom(saved, kind, h, ev, canvas, false), sizing: true }),
                (ev, canvas) => ({ ...resizeFrom(saved, kind, h, ev, canvas), sizing: undefined }),
              )}
            />
          ))}
        </>
      )}
    </div>
  );
}
