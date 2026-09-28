import React, { useRef, useState } from "react";
import { setWaiterPattern } from "./api.js";

const DOTS = Array.from({ length: 9 }, (_, index) => ({
  id: index + 1,
  x: 36 + (index % 3) * 72,
  y: 36 + Math.floor(index / 3) * 72,
}));
const dot = (id) => DOTS[id - 1];
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

// Fill in dots crossed by a straight line, as an Android-style pattern does.
export function extendPattern(path, id) {
  if (path.includes(id)) return path;
  if (!path.length) return [id];
  const from = dot(path.at(-1));
  const to = dot(id);
  const dx = (to.x - from.x) / 72;
  const dy = (to.y - from.y) / 72;
  const steps = gcd(Math.abs(dx), Math.abs(dy));
  const next = [...path];
  for (let step = 1; step <= steps; step++) {
    const x = from.x + (dx / steps) * step * 72;
    const y = from.y + (dy / steps) * step * 72;
    const crossed = DOTS.find((point) => point.x === x && point.y === y)?.id;
    if (crossed && !next.includes(crossed)) next.push(crossed);
  }
  return next;
}

function position(event, board) {
  const rect = board.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 216,
    y: ((event.clientY - rect.top) / rect.height) * 216,
  };
}

function crossedDots(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy || 1;
  return DOTS.map((point) => {
    const along = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));
    const x = from.x + dx * along;
    const y = from.y + dy * along;
    return { id: point.id, along, distance: Math.hypot(point.x - x, point.y - y) };
  }).filter((point) => point.distance <= 25).sort((a, b) => a.along - b.along);
}

export function PatternPad({ label = "Pattern", onComplete, disabled = false }) {
  const board = useRef(null);
  const gesture = useRef(null);
  const pathRef = useRef([]);
  const [path, setPath] = useState([]);
  const [pointer, setPointer] = useState(null);
  const [message, setMessage] = useState("Lidhni të paktën 4 pika.");

  const change = (next) => {
    pathRef.current = next;
    setPath(next);
  };
  const clear = () => {
    change([]);
    setPointer(null);
  };
  const add = (id) => {
    const next = extendPattern(pathRef.current, id);
    if (next === pathRef.current) return;
    change(next);
    setMessage(`${next.length} ${next.length === 1 ? "pikë" : "pika"} të zgjedhura.`);
  };
  const finish = () => {
    const answer = [...pathRef.current];
    clear();
    if (answer.length < 4) {
      setMessage("Lidhni të paktën 4 pika të ndryshme dhe provoni përsëri.");
      return;
    }
    setMessage("Pattern u dërgua.");
    onComplete(answer);
  };
  const onPointerDown = (event) => {
    if (disabled || gesture.current) return;
    const point = position(event, board.current);
    const first = crossedDots(point, point)[0];
    if (!first) return;
    event.preventDefault();
    board.current.setPointerCapture(event.pointerId);
    gesture.current = { id: event.pointerId, start: point, last: point, moved: false };
    add(first.id);
    setPointer(point);
  };
  const onPointerMove = (event) => {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    const point = position(event, board.current);
    if (Math.hypot(point.x - current.start.x, point.y - current.start.y) > 12) current.moved = true;
    for (const crossed of crossedDots(current.last, point)) add(crossed.id);
    current.last = point;
    setPointer(point);
  };
  const onPointerEnd = (event) => {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    gesture.current = null;
    if (board.current.hasPointerCapture(event.pointerId)) board.current.releasePointerCapture(event.pointerId);
    setPointer(null);
    if (current.moved && pathRef.current.length >= 4) finish();
  };

  return (
    <div className="pattern-control" role="group" aria-label={label}>
      <div
        ref={board}
        className="pattern-board"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={() => { gesture.current = null; clear(); }}
        onKeyDown={(event) => { if (event.key === "Escape") clear(); }}
      >
        <svg className="pattern-lines" viewBox="0 0 216 216" aria-hidden="true">
          {path.length > 1 && <polyline points={path.map((id) => `${dot(id).x},${dot(id).y}`).join(" ")} />}
          {pointer && path.length > 0 && <line x1={dot(path.at(-1)).x} y1={dot(path.at(-1)).y} x2={pointer.x} y2={pointer.y} />}
        </svg>
        {DOTS.map((point) => (
          <button
            key={point.id}
            type="button"
            className="pattern-dot"
            style={{ left: `${(point.x / 216) * 100}%`, top: `${(point.y / 216) * 100}%` }}
            aria-label={`Pika ${point.id}`}
            aria-pressed={path.includes(point.id)}
            disabled={disabled}
            onClick={(event) => { if (event.detail === 0) add(point.id); }}
          />
        ))}
      </div>
      <p className="pattern-message" role="status">{message}</p>
      <div className="pattern-actions">
        <button type="button" disabled={disabled || !path.length} onClick={() => { clear(); setMessage("Pattern u pastrua. Nisni nga një pikë."); }}>Pastro</button>
        <button type="button" className="primary" disabled={disabled || path.length < 4} onClick={finish}>Përfundo</button>
      </div>
    </div>
  );
}

export function WaiterPatternEditor({ waiter, onSaved, onCancel }) {
  const [first, setFirst] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const complete = async (pattern) => {
    if (!first) {
      setFirst(pattern);
      setError("");
      return;
    }
    if (pattern.join("-") !== first.join("-")) {
      setFirst(null);
      setError("Pattern-et nuk përputhen. Vizatojeni përsëri nga fillimi.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await setWaiterPattern(waiter.id, pattern);
      setFirst(null);
      await onSaved();
    } catch (cause) {
      setFirst(null);
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="staff-pattern-editor">
      <div className="staff-pattern-heading">
        <div>
          <strong>Pattern për {waiter.name}</strong>
          <p>{first ? "Vizatojeni përsëri për konfirmim." : "Lidhni të paktën 4 pika në rendin që do të përdorë kamarieri."}</p>
        </div>
        <button type="button" disabled={busy} onClick={onCancel}>Anulo</button>
      </div>
      {error && <p className="notice error" role="alert">{error}</p>}
      <PatternPad key={first ? "confirm" : "new"} label={`Pattern për ${waiter.name}`} onComplete={complete} disabled={busy} />
      {busy && <p role="status">Po ruhet pattern…</p>}
    </div>
  );
}
