import React, { useRef, useState } from "react";
import {
  CELL_H,
  CELL_W,
  GRID_COLS,
  GRID_ROWS,
  MAX_SPAN,
  cellsOf,
  centerOf,
  fits,
  sizeFor,
  spanOf,
} from "./floorGeometry.js";
import { money, total } from "./domain.js";
import { Icon } from "./components.jsx";

// The floor tile itself should read as the same furniture shape a manager picked in
// the table editor, not a generic card — otherwise every table looks identical.
const shapeClass = {
  Rreth: "shape-round",
  Oval: "shape-oval",
  Katror: "shape-square",
  Bar: "shape-bar",
};

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function FloorTable({ t, editing, isSelected, onSelect, onChange, onGhost, others }) {
  const occupied = t.lines.length > 0;
  const itemCount = t.lines.reduce((sum, line) => sum + line.qty, 0);
  const ref = useRef(null);
  // Always drawn on its own block of cells, so what you see is exactly what the
  // collision rules use — including older layouts saved off the lattice.
  const block = cellsOf(t);
  const center = centerOf(block);
  const span = spanOf(t);
  const size = sizeFor(t.shape, span.cols, span.rows);
  // Apply a change only if the table would land on free cells; either way show
  // the target block (green / red) while the pointer is down.
  const attempt = (candidate, patch) => {
    const ok = fits(candidate, others);
    onGhost({ ...candidate, ok });
    if (ok) onChange(t.id, { ...patch, ...centerOf(candidate) });
  };
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
      onGhost(null);
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
        left: `${center.posX}%`,
        top: `${center.posY}%`,
        width: `${size.width}%`,
        height: `${size.height}%`,
        transform: `translate(-50%, -50%) rotate(${t.rotation}deg)`,
      }}
      onPointerDown={drag((ev, canvas) => {
        const x = clamp(((ev.clientX - canvas.left) / canvas.width) * 100, 0, 100);
        const y = clamp(((ev.clientY - canvas.top) / canvas.height) * 100, 0, 100);
        attempt(cellsOf(t, { posX: x, posY: y }), {});
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
              const cx = canvas.left + (center.posX / 100) * canvas.width;
              const cy = canvas.top + (center.posY / 100) * canvas.height;
              const raw = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90;
              // 15° steps: tables line up with each other instead of sitting at 87°.
              const rotation = ((Math.round(raw / 15) * 15) % 360 + 360) % 360;
              attempt(cellsOf({ ...t, rotation }, center), { rotation });
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
              // pixels, so both axes share one scale) into the table's own frame,
              // then read it as a whole number of cells, growing from the top-left.
              const cx = canvas.left + (center.posX / 100) * canvas.width;
              const cy = canvas.top + (center.posY / 100) * canvas.height;
              const rad = (-t.rotation * Math.PI) / 180;
              const dx = ev.clientX - cx, dy = ev.clientY - cy;
              const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
              const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
              // Width from the table's own left edge to the pointer, in cells.
              const cellW = canvas.width / GRID_COLS, cellH = canvas.height / GRID_ROWS;
              const edgeX = (size.width / 100) * canvas.width / 2;
              const edgeY = (size.height / 100) * canvas.height / 2;
              const cols = clamp(Math.round((localX + edgeX) / cellW + 0.3), 1, MAX_SPAN);
              const rows = t.shape === "Bar" ? 1 : clamp(Math.round((localY + edgeY) / cellH + 0.3), 1, MAX_SPAN);
              const turned = { ...t, ...sizeFor(t.shape, cols, rows) };
              const { cols: fc, rows: fr } = cellsOf(turned);
              attempt(
                {
                  left: clamp(block.left, 0, GRID_COLS - fc),
                  top: clamp(block.top, 0, GRID_ROWS - fr),
                  cols: fc,
                  rows: fr,
                },
                sizeFor(t.shape, cols, rows),
              );
            })}
          />
        </>
      )}
    </div>
  );
}

export function FloorPlan({ tables, editing, selected, onSelectTable, onLayoutChange }) {
  const canvasRef = useRef(null);
  // The block a dragged/resized/turned table is aiming at: green if free, red if taken.
  const [ghost, setGhost] = useState(null);
  const blocks = tables.map((t) => ({ id: t.id, ...cellsOf(t) }));
  return (
    <div className="floor-plan-viewport" role="region" aria-label="Plani i tavolinave" tabIndex={0}>
      <div className={`floor-plan ${editing ? "editing" : ""} ${tables.length ? "" : "is-empty"}`} ref={canvasRef} onClick={() => editing && onSelectTable(null)}>
        {ghost && (
          <div
            className={`fp-ghost ${ghost.ok ? "ok" : "blocked"}`}
            aria-hidden="true"
            style={{
              left: `${ghost.left * CELL_W}%`,
              top: `${ghost.top * CELL_H}%`,
              width: `${ghost.cols * CELL_W}%`,
              height: `${ghost.rows * CELL_H}%`,
            }}
          />
        )}
        {tables.map((t) => (
          <FloorTable
            key={t.id}
            t={t}
            editing={editing}
            isSelected={selected === t.id}
            onSelect={onSelectTable}
            others={blocks.filter((b) => b.id !== t.id)}
            onChange={onLayoutChange}
            onGhost={setGhost}
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
