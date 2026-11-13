import React, { useLayoutEffect, useRef, useState } from "react";
import { CELL_H, CELL_W, GRID_COLS, GRID_ROWS, MAX_SPAN, inRoom, rectFits, rectOf, sizeFor, spanOf } from "./floorGeometry.js";
import { bill, money, reservationTime, tableName } from "./domain.js";
import { Icon } from "./components.jsx";
import { floorAssetUrl } from "./api.js";

// The room seen from straight above, in the look the manager chose: "3d", a rendered plan
// (wood floor, wooden tables with their chairs, a stone bar with stools), or "flat", plain
// cards. Tables stand wherever they were put; each one's space (floorGeometry.js rectOf) never
// overlaps another's, which keeps a strip of floor between two tables.
const shapeClass = {
  Rreth: "shape-round",
  Oval: "shape-oval",
  Katror: "shape-square",
  Bar: "shape-bar",
};

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// In 3D the tabletop sits inside the table's space (percent of it, each side) and its chairs
// fill the rest: the whole space is the target a finger aims at.
const INSET = { table: 16, barX: 4, barTop: 6, barBottom: 40 };

// A chair for every seat: a point on the tabletop's edge (percent of the tabletop) and the way
// it faces. Round tables seat people evenly around; a bar has its stools along the front; the
// rest put one at each end from four seats up and share the others between the long sides.
function chairs(t, wide) {
  const n = Math.min(t.seats || 0, 12);
  if (t.shape === "Rreth" || t.shape === "Oval")
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * 2 * Math.PI - Math.PI / 2;
      return { left: 50 + 50 * Math.cos(a), top: 50 + 50 * Math.sin(a), turn: (a * 180) / Math.PI + 90 };
    });
  const along = (count, at) => Array.from({ length: count }, (_, i) => at(((i + 1) / (count + 1)) * 100));
  if (t.shape === "Bar") return along(n, (x) => ({ left: x, top: 100, turn: 180 }));
  const ends = n >= 4 ? 2 : n === 3 ? 1 : 0;
  const long = n - ends;
  return [
    ...along(Math.ceil(long / 2), (x) => (wide ? { left: x, top: 0, turn: 0 } : { left: 0, top: x, turn: 270 })),
    ...along(Math.floor(long / 2), (x) => (wide ? { left: x, top: 100, turn: 180 } : { left: 100, top: x, turn: 90 })),
    ...[wide ? { left: 0, top: 50, turn: 270 } : { left: 50, top: 0, turn: 0 }, wide ? { left: 100, top: 50, turn: 90 } : { left: 50, top: 100, turn: 180 }].slice(0, ends),
  ];
}

function FloorTable({ t: saved, look, waiter, reservation, editing, drafted, isSelected, onSelect, onChange, onGhost, others }) {
  // While a table (or its handle) is held it follows the pointer on its own, without redrawing
  // the room; it is handed over when let go, or glides back if the spot was taken.
  const [live, setLive] = useState(null);
  const liveRef = useRef(null);
  const t = live ? { ...saved, ...live.patch } : saved;
  const occupied = t.lines.length > 0;
  const itemCount = t.lines.reduce((sum, line) => sum + line.qty, 0);
  const ref = useRef(null);
  const center = { posX: t.posX, posY: t.posY };
  const span = spanOf(t);
  const size = sizeFor(t.shape, span.cols, span.rows);
  const bar = t.shape === "Bar";
  // Chairs are a fifth of a cell wide; stools along a short bar get narrower rather than overlap.
  const chairWidth = Math.min(((0.21 * CELL_W) / size.width) * 100, bar ? 90 / ((t.seats || 1) + 1) : Infinity);
  // A point on the tabletop's edge → the same point in the table's space.
  const ix = bar ? INSET.barX : INSET.table, iy = bar ? INSET.barTop : INSET.table, iy2 = bar ? INSET.barBottom : INSET.table;
  const onTable = (c) => ({ left: `${ix + (c.left * (100 - 2 * ix)) / 100}%`, top: `${iy + (c.top * (100 - iy - iy2)) / 100}%` });
  // Apply a change only if the table's space stays in the room and clear of every other table;
  // either way show that space (green / red) while the pointer is down.
  const attempt = (patch, at = center) => {
    const next = { ...saved, ...patch };
    const where = inRoom(next, at);
    const rect = rectOf(next, where);
    const ok = rectFits(rect, others);
    onGhost({ ...rect, ok });
    liveRef.current = { patch: { ...patch, ...where }, ok };
    setLive(liveRef.current);
  };
  // Arranging the room: the table (or one of its handles) follows the pointer from where it was
  // taken hold of. A tap is not a move: a finger wobbles a few pixels.
  const drag = (step) => (e) => {
    if (!editing) return;
    e.preventDefault();
    e.stopPropagation();
    const canvas = ref.current.closest(".floor-plan").getBoundingClientRect();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const from = { x: e.clientX, y: e.clientY };
    let moved = false;
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - from.x, ev.clientY - from.y) < 6) return;
      moved = true;
      step(ev, canvas, from);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      onGhost(null);
      if (liveRef.current?.ok) onChange(saved.id, liveRef.current.patch);
      liveRef.current = null;
      setLive(null);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };
  return (
    <div
      ref={ref}
      className={`fp-table ${shapeClass[t.shape] || "shape-rect"} ${occupied ? "occupied" : reservation ? "reserved" : ""} ${t.sprite && look === "3d" ? "has-sprite" : ""} ${drafted ? "drafted" : ""} ${isSelected ? "selected" : ""} ${editing ? "editing" : ""} ${live ? `dragging ${live.ok ? "" : "blocked"}` : ""}`}
      style={{
        left: `${center.posX}%`,
        top: `${center.posY}%`,
        width: `${size.width}%`,
        height: `${size.height}%`,
        transform: `translate(-50%, -50%) rotate(${t.rotation}deg)`,
        "--chair": `${chairWidth}%`,
      }}
      onPointerDown={drag((ev, canvas, from) => {
        const dx = ((ev.clientX - from.x) / canvas.width) * 100, dy = ((ev.clientY - from.y) / canvas.height) * 100;
        attempt({}, { posX: center.posX + dx, posY: center.posY + dy });
      })}
      role="button"
      tabIndex={0}
      aria-label={`${tableName(t)}, ${t.area}, ${occupied ? `e zënë${waiter ? ` nga ${waiter}` : ""}, ${itemCount} ${itemCount === 1 ? "artikull" : "artikuj"}, ${money(bill(t).remaining)}${bill(t).paid ? ", paguar pjesërisht" : ""}` : "e lirë"}${reservation ? `, e rezervuar në ${reservationTime(reservation)} për ${reservation.name}` : ""}${drafted ? ", e ndryshuar, pa konfirmuar" : ""}`}
      aria-pressed={isSelected}
      onClick={(e) => {
        if (editing) e.stopPropagation();
        onSelect(t);
      }}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(t)}
    >
      {look === "3d" &&
        (t.sprite ? (
          // The venue's own table, drawn from a photo (seen from above, chairs and all).
          <img className="fp-sprite" src={floorAssetUrl(t.sprite)} alt="" draggable="false" />
        ) : (
          <>
            {chairs(t, span.cols >= span.rows).map((c, i) => (
              <i key={i} className={`fp-chair ${bar ? "stool" : ""}`} style={{ ...onTable(c), "--turn": `${c.turn}deg` }} aria-hidden="true" />
            ))}
            <span className="fp-top" aria-hidden="true" />
          </>
        ))}
      <div className="fp-body" style={{ transform: `rotate(${-t.rotation}deg)` }}>
        <span className="fp-tag">
          <strong className={t.label ? "fp-label" : ""}>{t.label || String(t.id).padStart(2, "0")}</strong>
          {occupied && (
            <span className="fp-info">
              {/* Whose table it is, when there's a waiter on it; otherwise how much is on it. */}
              {waiter ? <span className="fp-waiter">{waiter}</span> : <span>{itemCount} {itemCount === 1 ? "artikull" : "artikuj"}</span>}
              {/* Small tables drop the currency so the amount fits; the aria-label keeps it. */}
              <b>{money(bill(t).remaining).replace(/ Lek$/, "")}<span className="fp-cur"> Lek</span></b>
            </span>
          )}
          {/* Today's reservation: the hour, and who for while the table still waits for them. */}
          {reservation && <span className="fp-res">{reservation.start}{!occupied && ` ${reservation.name.split(" ")[0]}`}</span>}
        </span>
      </div>
      {editing && isSelected && (
        <>
          <button
            type="button"
            className="fp-handle fp-rotate"
            style={{ transform: `rotate(${-t.rotation}deg) translateY(-26px)` }}
            aria-label={`Rrotullo tavolinën ${t.id}`}
            onPointerDown={drag((ev, canvas) => {
              const cx = canvas.left + (center.posX / 100) * canvas.width;
              const cy = canvas.top + (center.posY / 100) * canvas.height;
              const raw = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90;
              // 15° steps: tables line up with each other instead of sitting at 87°.
              const rotation = ((Math.round(raw / 15) * 15) % 360 + 360) % 360;
              attempt({ rotation });
            })}
          >
            <Icon name="rotate" size={13} />
          </button>
          <button
            type="button"
            className="fp-handle fp-resize"
            aria-label={`Ndrysho madhësinë e tavolinës ${t.id}`}
            onPointerDown={drag((ev, canvas) => {
              // The handle sits at the table's own bottom-right corner, which is rotated on
              // screen. Un-rotate the pointer's offset from center (in pixels, so both axes
              // share one scale) into the table's own frame, then read it as whole cells,
              // growing from the top-left.
              const cx = canvas.left + (center.posX / 100) * canvas.width;
              const cy = canvas.top + (center.posY / 100) * canvas.height;
              const rad = (-t.rotation * Math.PI) / 180;
              const dx = ev.clientX - cx, dy = ev.clientY - cy;
              const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
              const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
              const cellW = canvas.width / GRID_COLS, cellH = canvas.height / GRID_ROWS;
              const edgeX = ((size.width / 100) * canvas.width) / 2;
              const edgeY = ((size.height / 100) * canvas.height) / 2;
              const cols = clamp(Math.round((localX + edgeX) / cellW + 0.3), 1, MAX_SPAN);
              const rows = bar ? 1 : clamp(Math.round((localY + edgeY) / cellH + 0.3), 1, MAX_SPAN);
              // Growing to the right and down: the top-left corner stays where it is.
              const size2 = sizeFor(t.shape, cols, rows);
              const before = rectOf(t), after = rectOf({ ...t, ...size2 });
              attempt(size2, { posX: before.x + after.w / 2, posY: before.y + after.h / 2 });
            })}
          />
        </>
      )}
    </div>
  );
}

// reservations: today's, by table id (domain.js tableReservations). texture: the floor drawn
// from the venue's photo (a floor asset's id). drafted: ids of tables changed but not yet
// confirmed. onLayoutChange(id, patch) moves, turns or resizes a table while it is dragged.
export function FloorPlan({ tables, waiters = [], reservations, look = "3d", texture, editing, drafted, selected, onSelectTable, onLayoutChange }) {
  // The block a dragged table is aiming at: green if free, red if taken.
  const [ghost, setGhost] = useState(null);
  // The room at the largest 16:10 that fits its space, measured rather than left to container
  // queries (which some browsers stop repainting when a notice above pushes the room down).
  // --cell (one cell's width) sizes the lettering on the tables.
  const viewport = useRef(null);
  const [fit, setFit] = useState(null);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const w = Math.floor(Math.min(width, height ? height * 1.6 : width));
      setFit((f) => (f?.w === w ? f : { w, h: Math.floor(w / 1.6) }));
    });
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  const rects = tables.map((t) => ({ id: t.id, ...rectOf(t) }));
  return (
    <div className="floor-plan-viewport" ref={viewport} role="region" aria-label="Plani i tavolinave" tabIndex={0}>
      <div
        className={`floor-plan ${look === "3d" ? "look-3d" : ""} ${editing ? "editing" : ""} ${tables.length ? "" : "is-empty"}`}
        style={{
          ...(fit && { "--fit-w": `${fit.w}px`, "--fit-h": `${fit.h}px`, "--cell": `${fit.w / GRID_COLS}px` }),
          ...(look === "3d" && texture && { "--floor": `url("${floorAssetUrl(texture)}")` }),
        }}
        onClick={() => editing && onSelectTable(null)}
      >
        {ghost && (
          <div
            className={`fp-ghost ${ghost.ok ? "ok" : "blocked"}`}
            aria-hidden="true"
            style={{
              left: `${ghost.x}%`,
              top: `${ghost.y}%`,
              width: `${ghost.w}%`,
              height: `${ghost.h}%`,
            }}
          />
        )}
        {tables.map((t) => (
          <FloorTable
            key={t.id}
            t={t}
            look={look}
            reservation={reservations?.get(t.id)}
            waiter={waiters.find((w) => w.id === t.waiter)?.name.split(" ")[0]}
            editing={editing}
            drafted={drafted?.has(t.id)}
            isSelected={selected === t.id}
            onSelect={onSelectTable}
            others={rects.filter((b) => b.id !== t.id)}
            onChange={onLayoutChange}
            onGhost={setGhost}
          />
        ))}
        {!tables.length && (
          <p className="fp-empty helper">{editing ? "Shtypni \"Shto tavolinë\" për të nisur sallën." : "Ende pa tavolina në sallë."}</p>
        )}
      </div>
      {tables.length > 0 && <p className="floor-scroll-hint">Rrëshqitni majtas ose djathtas për të parë të gjitha tavolinat.</p>}
    </div>
  );
}
