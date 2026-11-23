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
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => leaf(a + 10, 46, 13, "#2f7a45"))}
      {[22, 77, 132, 187, 242, 297, 352].map((a) => leaf(a, 36, 11, "#4e9b5c"))}
      {[60, 170, 280].map((a) => leaf(a, 24, 8, "#7cbd74"))}
    </svg>
  );
}

// A door from above: the frame in the wall, the open leaf and the arc it swings through.
function Door() {
  return (
    <svg viewBox="0 0 100 100" className="fo-art">
      <path d="M8 6 A86 86 0 0 1 94 92" fill="rgba(255,255,255,0.18)" stroke="rgba(40,45,52,0.55)" strokeWidth="1.4" strokeDasharray="4 3" />
      <rect x="3" y="4" width="6" height="90" rx="1.5" fill="#7b5a3d" stroke="#4d3826" strokeWidth="1" />
      <rect x="0" y="92" width="100" height="6" rx="1" fill="#4a535e" />
      <circle cx="6" cy="92" r="3" fill="#c9cfd6" />
    </svg>
  );
}

export function ObjectArt({ kind, text }) {
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
export function FloorObject({ o: saved, editing, isSelected, onSelect, onChange, targets = [], onGuides }) {
  const [live, setLive] = useState(null);
  const liveRef = useRef(null);
  const ref = useRef(null);
  const hold = useRef(null);
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
      className={`fp-object fo-${o.kind} ${isSelected ? "selected" : ""} ${live && liveRef.current ? "dragging" : ""} ${live?.sizing ? "sizing" : ""}`}
      style={{ left: `${o.x}%`, top: `${o.y}%`, width: `${o.w}%`, height: `${o.h}%`, transform: `translate(-50%, -50%) rotate(${o.r || 0}deg)` }}
      role={editing ? "button" : undefined}
      tabIndex={editing ? 0 : undefined}
      aria-label={editing ? `${kind.name}${o.text ? `: ${o.text}` : ""}` : undefined}
      aria-hidden={editing ? undefined : o.kind === "sign" ? undefined : "true"}
      onClick={(e) => editing && (e.stopPropagation(), onSelect(o.id))}
      onKeyDown={(e) => editing && (e.key === "Enter" || e.key === " ") && onSelect(o.id)}
      onPointerDown={drag((ev, canvas, from) => {
        const free = { ...saved, x: clamp(saved.x + ((ev.clientX - from.x) / canvas.width) * 100, 0, 100), y: clamp(saved.y + ((ev.clientY - from.y) / canvas.height) * 100, 0, 100) };
        if (ev.altKey) return (onGuides?.([]), set(fitRoom(free)));
        const { x, y, guides } = snapPosition(free, targets);
        onGuides?.(guides);
        set(fitRoom({ ...free, x, y }));
      })}
    >
      <ObjectArt kind={o.kind} text={o.text} />
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
