import React, { useRef, useState } from "react";
import { money, total } from "./domain.js";
import { Badge, Icon, TableSymbol } from "./components.jsx";

// Seats are auto-arranged around the table's own shape, not individually placed.
// ponytail: a real venue rarely needs to hand-place each chair; if that changes,
// store per-chair offsets the same way position/rotation are stored per table.
export function chairLayout(shape, seatCount) {
  const n = Math.max(1, Math.min(12, seatCount || 4));
  if (shape === "Bar")
    return Array.from({ length: n }, (_, i) => ({ x: ((i + 0.5) / n) * 100, y: 108, angle: 0, round: true }));
  const round = shape === "Rreth" || shape === "Oval";
  return Array.from({ length: n }, (_, i) => {
    const theta = (i / n) * 2 * Math.PI - Math.PI / 2;
    const cos = Math.cos(theta), sin = Math.sin(theta);
    let rx, ry;
    if (round) {
      rx = cos * 0.62;
      ry = sin * 0.62;
    } else {
      // Ray from center to the rectangle boundary: whichever edge it reaches first.
      const t = Math.min(cos === 0 ? Infinity : 0.5 / Math.abs(cos), sin === 0 ? Infinity : 0.5 / Math.abs(sin));
      rx = cos * t * 1.22;
      ry = sin * t * 1.22;
    }
    return { x: (0.5 + rx) * 100, y: (0.5 + ry) * 100, angle: (theta * 180) / Math.PI + 90, round };
  });
}

// The floor tile itself should read as the same furniture shape a manager picked in
// the table editor, not a generic card — otherwise every table looks identical.
const shapeClass = {
  Rreth: "shape-round",
  Oval: "shape-oval",
  Katror: "shape-square",
  Bar: "shape-bar",
};

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// Placement snaps to a fixed lattice of slots instead of free pixels: easier to line
// tables up. 8x5 on the canvas's 16:10 aspect ratio makes every cell square in real pixels.
export const GRID_COLS = 8;
export const GRID_ROWS = 5;
export const CELL_W = 100 / GRID_COLS;
export const CELL_H = 100 / GRID_ROWS;
// A big table (large party, pushed-together tables) can grow across a few slots, not
// just its own — capped at 3 cells so it still can't swallow the whole floor. A table
// sized to N cells still has chairs sitting ~11-12% of its own size beyond its edges
// (see chairLayout's ray-casting math), so the ceiling leaves that much margin inside
// its span — otherwise a maxed-out table's chairs poke into the next untouched slot.
export const MAX_TABLE_W = CELL_W * 3 * 0.8;
export const MAX_TABLE_H = CELL_H * 3 * 0.8;
const snapToCell = (v, cell) => clamp(Math.floor(v / cell) * cell + cell / 2, cell / 2, 100 - cell / 2);

function FloorTable({ t, editing, isSelected, onSelect, onDrag, onResize, onRotate, waiterName }) {
  const occupied = t.lines.length > 0;
  const itemCount = t.lines.reduce((sum, line) => sum + line.qty, 0);
  const ref = useRef(null);
  const drag = (start) => (e) => {
    if (!editing) return;
    e.preventDefault();
    e.stopPropagation();
    const canvas = ref.current.closest(".floor-plan").getBoundingClientRect();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (ev) => start(ev, canvas);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };
  return (
    <div
      ref={ref}
      className={`fp-table ${shapeClass[t.shape] || "shape-rect"} ${occupied ? "occupied" : ""} ${isSelected ? "selected" : ""} ${editing ? "editing" : ""}`}
      style={{
        left: `${t.posX}%`,
        top: `${t.posY}%`,
        width: `${t.width}%`,
        height: `${t.height}%`,
        transform: `translate(-50%, -50%) rotate(${t.rotation}deg)`,
      }}
      onPointerDown={drag((ev, canvas) => {
        const x = clamp(((ev.clientX - canvas.left) / canvas.width) * 100, 0, 100);
        const y = clamp(((ev.clientY - canvas.top) / canvas.height) * 100, 0, 100);
        onDrag(t.id, snapToCell(x, CELL_W), snapToCell(y, CELL_H));
      })}
      role="button"
      tabIndex={0}
      aria-label={`Tavolina ${t.id}, ${t.area}, ${occupied ? `e zënë, ${itemCount} ${itemCount === 1 ? "artikull" : "artikuj"}, ${money(total(t.lines))}` : "e lirë"}`}
      aria-pressed={isSelected}
      onClick={(e) => {
        if (editing) e.stopPropagation();
        onSelect(t);
      }}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(t)}
    >
      <div className="fp-chairs" aria-hidden={occupied || undefined}>
        {chairLayout(t.shape, t.seats).map((c, i) => (
          <span
            key={i}
            className={`fp-chair ${c.round ? "fp-chair-round" : ""}`}
            style={{ left: `${c.x}%`, top: `${c.y}%`, transform: `translate(-50%,-50%) rotate(${c.angle}deg)` }}
          />
        ))}
      </div>
      <div className="fp-body" style={{ transform: `rotate(${-t.rotation}deg)` }}>
        {occupied && <span className="fp-live-dot" aria-hidden="true" />}
        <strong>{String(t.id).padStart(2, "0")}</strong>
        {occupied && (
          <span className="fp-info">
            <span>{itemCount} {itemCount === 1 ? "artikull" : "artikuj"}</span>
            <b>{money(total(t.lines))}</b>
          </span>
        )}
      </div>
      {editing && isSelected && (
        <>
          <button
            type="button"
            className="fp-handle fp-rotate"
            style={{ transform: `rotate(${-t.rotation}deg) translateY(-26px)` }}
            aria-label={`Rrotullo tavolinën ${t.id}`}
            onPointerDown={drag((ev, canvas) => {
              const cx = canvas.left + (t.posX / 100) * canvas.width;
              const cy = canvas.top + (t.posY / 100) * canvas.height;
              const deg = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90;
              onRotate(t.id, ((Math.round(deg) % 360) + 360) % 360);
            })}
          >
            <Icon name="rotate" size={13} />
          </button>
          <button
            type="button"
            className="fp-handle fp-resize"
            aria-label={`Ndrysho madhësinë e tavolinës ${t.id}`}
            onPointerDown={drag((ev, canvas) => {
              // The handle sits at the table's own bottom-right corner, which is
              // rotated on screen. Un-rotate the pointer's offset from center (in
              // pixels, so the two axes share one scale before rotating) back into
              // the table's own frame before reading it as width/height.
              const cx = canvas.left + (t.posX / 100) * canvas.width;
              const cy = canvas.top + (t.posY / 100) * canvas.height;
              const rad = (-t.rotation * Math.PI) / 180;
              const dx = ev.clientX - cx, dy = ev.clientY - cy;
              const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
              const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
              // A table near an edge can't grow all the way to MAX_TABLE_W/H without
              // pushing past the canvas boundary — cap it to what actually still fits.
              const maxW = Math.min(MAX_TABLE_W, 2 * Math.min(t.posX, 100 - t.posX));
              const maxH = Math.min(MAX_TABLE_H, 2 * Math.min(t.posY, 100 - t.posY));
              const w = clamp(((localX * 2) / canvas.width) * 100, 4, maxW);
              const h = clamp(((localY * 2) / canvas.height) * 100, 4, maxH);
              onResize(t.id, w, h);
            })}
          />
        </>
      )}
    </div>
  );
}

export function FloorPlan({ tables, editing, selected, onSelectTable, onLayoutChange, waiters }) {
  const canvasRef = useRef(null);
  const waiterName = (id) => waiters.find((w) => w.id === id)?.name.split(" ")[0];
  return (
    <div className="floor-plan-viewport" role="region" aria-label="Plani i tavolinave" tabIndex={0}>
      <div className={`floor-plan ${editing ? "editing" : ""} ${tables.length ? "" : "is-empty"}`} ref={canvasRef} onClick={() => editing && onSelectTable(null)}>
        {tables.map((t) => (
          <FloorTable
            key={t.id}
            t={t}
            editing={editing}
            isSelected={selected === t.id}
            onSelect={onSelectTable}
            waiterName={waiterName(t.waiter)}
            onDrag={(id, x, y) => onLayoutChange(id, { posX: x, posY: y })}
            onResize={(id, w, h) => onLayoutChange(id, { width: w, height: h })}
            onRotate={(id, deg) => onLayoutChange(id, { rotation: deg })}
          />
        ))}
        {!tables.length && (
          <p className="fp-empty helper">Shtoni tavolina te "Menaxho tavolinat" për t'i parë këtu.</p>
        )}
      </div>
      {tables.length > 0 && <p className="floor-scroll-hint">Rrëshqitni majtas ose djathtas për të parë të gjitha tavolinat.</p>}
    </div>
  );
}

export function TableDetailPanel({ table, waiterName, time }) {
  if (!table) return null;
  const occupied = table.lines.length > 0;
  return (
    <div className="fp-detail-row">
      <span>
        <small>Vendet</small>
        <strong>{table.seats}</strong>
      </span>
      {occupied && table.occupiedSince && (
        <span>
          <small>Nisi</small>
          <strong>{time(table.occupiedSince)}</strong>
        </span>
      )}
      {occupied && waiterName && (
        <span>
          <small>Kamarieri</small>
          <strong>{waiterName}</strong>
        </span>
      )}
    </div>
  );
}
