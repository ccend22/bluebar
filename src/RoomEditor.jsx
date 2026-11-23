import React, { useEffect, useRef, useState } from "react";
import { useConfirm } from "./ConfirmDialog.jsx";
import { MAX_SPAN, inRoom, rectFits, rectOf, sizeFor, spanOf } from "./floorGeometry.js";
import { tableName } from "./domain.js";
import { deleteFloorAsset, drawFloorAsset, saveFloorAsset, setFloorTexture, setTableSprite } from "./api.js";
import { shrink } from "./OnlineMenu.jsx";
import { FloorPlan } from "./FloorPlan.jsx";
import { OBJECT_KINDS, ObjectArt, ROOM_PX, STEP_X, STEP_Y, fitRoom, fromPx, newObject, snapPosition, toPx } from "./FloorObjects.jsx";
import { FLOOR_MATERIALS, floorLook } from "./floorMaterials.js";
import { Icon, TableShapePicker } from "./components.jsx";

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const FURNITURE_SWATCHES = [
  ["Arrë", "#774e38"], ["Rërë", "#dbc4a3"], ["Grafit", "#343b45"],
  ["Ulliri", "#68725a"], ["Blu e thellë", "#365878"], ["Terrakotë", "#a66550"],
];

function ColorControl({ label, color, fallback, onChange, mixed = false }) {
  return (
    <fieldset className="room-color-control">
      <legend>{label}</legend>
      <div className="room-color-swatches">
        {FURNITURE_SWATCHES.map(([name, value]) => (
          <button key={value} type="button" aria-label={`${label}, ${name}`} aria-pressed={color === value}
            title={name} style={{ "--swatch": value }} onClick={() => onChange(value)} />
        ))}
      </div>
      <div className="room-color-custom">
        <label>
          <input type="color" value={color || fallback} onChange={(e) => onChange(e.target.value)} aria-label={`Ngjyrë me porosi për ${label.toLowerCase()}`} />
          <span>{mixed ? "Të përziera" : color || "Me porosi"}</span>
        </label>
        <button type="button" className="text-button" disabled={!color && !mixed} onClick={() => onChange(null)}>Parazgjedhje</button>
      </div>
    </fieldset>
  );
}

// Gemini draws a table on flat green: the green is cut away and the empty margin trimmed, so
// the drawing sits on the floor.
// ponytail: a plain green screen; a green table or a plant on it would be cut too. Ask the
// model for another background colour per photo if that ever happens.
async function cutOut(dataUrl) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const scale = Math.min(1, 640 / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h), d = pixels.data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < d.length; i += 4) {
    const green = d[i + 1] - Math.max(d[i], d[i + 2]);
    // Plainly green: gone. An edge pixel keeps part of itself, without its green cast.
    if (green > 30) {
      d[i + 3] = green > 90 ? 0 : Math.round(((90 - green) / 60) * d[i + 3]);
      d[i + 1] = Math.max(d[i], d[i + 2]);
    }
    if (d[i + 3] > 24) {
      const x = (i / 4) % w, y = Math.floor(i / 4 / w);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error("Vizatimi doli bosh. Provoni një foto tjetër.");
  ctx.putImageData(pixels, 0, 0);
  // Square, so it can turn with the table without stretching.
  const side = Math.max(x1 - x0, y1 - y0) + 1;
  const out = document.createElement("canvas");
  out.width = out.height = side;
  out.getContext("2d").drawImage(canvas, x0, y0, x1 - x0 + 1, y1 - y0 + 1, (side - (x1 - x0 + 1)) / 2, (side - (y1 - y0 + 1)) / 2, x1 - x0 + 1, y1 - y0 + 1);
  const url = out.toDataURL("image/webp", 0.9);
  // Safari can't write WebP: PNG keeps the transparency.
  return url.startsWith("data:image/webp") ? url : out.toDataURL("image/png");
}

// A floor without the drawing AI: a square of floor from the lower middle of the photo, mirrored
// four ways into a 512 px tile, so it repeats without seams.
async function floorTile(file) {
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height) * 0.55;
  const sx = (img.width - side) / 2;
  const sy = Math.max(0, img.height - side - img.height * 0.08);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d");
  for (const [fx, fy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    ctx.save();
    ctx.translate(fx < 0 ? 512 : 0, fy < 0 ? 512 : 0);
    ctx.scale(fx, fy);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, 256, 256);
    ctx.restore();
  }
  return canvas.toDataURL("image/jpeg", 0.86);
}

// A photo → Gemini's drawing → shown to the manager before it is used. When Google won't draw
// (no image quota, busy), a floor is made from the photo itself instead.
function PhotoButton({ label, kind, busy, onDrawn, onError, setBusy }) {
  return (
    <label className={`button-like ${busy ? "disabled" : ""}`}>
      <Icon name="sparkle" size={17} /> {label}
      <input
        type="file"
        accept="image/*"
        hidden
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          try {
            const { image } = await drawFloorAsset(kind, await shrink(file, { size: 1280 }));
            onDrawn(kind === "table" ? await cutOut(image) : await shrink(await (await fetch(image)).blob(), { size: 512 }));
          } catch (err) {
            if (kind === "floor") {
              try { onError(""); onDrawn(await floorTile(file)); } catch { onError(err.message); }
            } else onError(err.message);
          }
          setBusy(false);
        }}
      />
    </label>
  );
}

// Menaxho sallën: the room itself, big, and editable in place. Drag a table to move it; tap it
// for its panel, or pull its corner handles to turn and size it. A changed table turns yellow
// until the changes are confirmed, all at once, or thrown away.
// tables: the room's active tables, drawn as drafted. draft: the changes, by table id (whole
// table.save rows); onDraft(id, patch) adds to them.
export function RoomEditor({ state, tables: allTables, update, notify, refresh, selected, onSelect, draft, onDraft, objectColors, onObjectColor, onSaved, onDone, area, onRoom }) {
  const confirm = useConfirm();
  const removeTable = async (table) => {
    const name = tableName(table);
    const accepted = await confirm({
      title: "Fshi tavolinën?",
      description: "Tavolina do të hiqet përgjithmonë nga plani i sallës.",
      detail: { name },
      action: "Fshi tavolinën",
      destructive: true,
    });
    if (accepted && await update("table.delete", { id: table.id }, `${name} u fshi.`)) onSelect(null);
  };
  // Rooms of their own: the room being arranged, and only its tables.
  const separate = state.separateRooms === true;
  const zones = [...new Set(allTables.map((x) => x.area))].sort((a, b) => a.localeCompare(b, "sq"));
  const room = zones.includes(area) ? area : zones[0];
  const tables = separate ? allTables.filter((x) => x.area === room) : allTables;
  const [saving, setSaving] = useState(false);
  const [colorsOpen, setColorsOpen] = useState(false);
  const drafted = Object.keys(draft).map(Number);
  const changedColors = Object.entries(objectColors).map(([id, color]) => ({ id, color }));
  const confirmDraft = async () => {
    setSaving(true);
    const ok = await update("tables.save", {
      tables: drafted.map((id) => ({ id, ...draft[id] })),
      objectColors: changedColors,
    }, "Ndryshimet e sallës u ruajtën.");
    setSaving(false);
    if (ok) onSaved();
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [drawing, setDrawing] = useState(null); // { kind, image }
  const t = tables.find((x) => x.id === selected);
  const look = state.floorStyle || "3d";
  const inactive = state.tables.filter((x) => !x.active);
  const areas = [...new Set(state.tables.map((x) => x.area))];
  const save = (patch) => onDraft(t.id, patch);
  // Turned or resized where it stands: only if it stays in the room, clear of the others.
  const place = (patch, at = t) => {
    const next = { ...t, ...patch };
    const where = inRoom(next, at);
    const others = tables.filter((x) => x.id !== t.id).map((x) => rectOf(x));
    if (!rectFits(rectOf(next, where), others)) return notify("Nuk ka vend aty: lëvizni pak tavolinat përreth.", "error");
    onDraft(t.id, { ...patch, ...where });
  };
  const span = t && spanOf(t);
  // Growing to the right and down: the top-left corner stays where it is.
  const resize = (cols, rows) => {
    const size = sizeFor(t.shape, clamp(cols, 1, MAX_SPAN), t.shape === "Bar" ? 1 : clamp(rows, 1, MAX_SPAN));
    const before = rectOf(t), after = rectOf({ ...t, ...size });
    place(size, { posX: before.x + after.w / 2, posY: before.y + after.h / 2 });
  };
  const add = async () => {
    const data = await update("table.save", { area: room || areas[0] || "Salla", shape: "Katror", seats: 4 }, "Tavolina u shtua. Tërhiqeni ku e doni.");
    if (data) onSelect(Math.max(...data.state.tables.map((x) => x.id)));
  };
  // Saved drawings no table or floor uses any more go too.
  const forget = (id) => id && !state.tables.some((x) => x.sprite === id && x.id !== t?.id) && state.floorTexture !== id && deleteFloorAsset(id).catch(() => {});
  const run = async (work, message) => {
    setBusy(true);
    setError("");
    try {
      await work();
      await refresh();
      if (message) notify(message);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };
  useEffect(() => setDrawing((d) => (d?.kind === "table" ? null : d)), [selected]);
  // The room's objects (walls, doors, plants…): only this room's when rooms are separate. Each
  // change saves the whole list; a new one starts in the middle, chosen, ready to drag.
  const [objectId, setObjectId] = useState(null);
  // Changes show at once (local) and are saved one after another, the latest list winning, so
  // quick clicks on + never collide; a save refused because the room just changed (another
  // device) is sent once more on the fresh room.
  const [localObjects, setLocalObjects] = useState(null);
  const allObjects = localObjects ?? state.floorObjects ?? [];
  const queue = useRef({ busy: false, next: null });
  const objects = separate ? allObjects.filter((o) => o.area === room) : allObjects;
  const obj = objects.find((o) => o.id === objectId);
  const colorTables = t ? [t] : tables;
  const commonColor = (key) => new Set(colorTables.map((table) => table[key] ?? null));
  useEffect(() => { if (selected) setObjectId(null); }, [selected]);
  const saveObjects = async (list, message) => {
    setLocalObjects(list);
    const q = queue.current;
    q.next = { list, message };
    if (q.busy) return true;
    q.busy = true;
    let ok = true;
    while (q.next) {
      const job = q.next;
      q.next = null;
      const saved = (await update("floor.objects", { objects: job.list }, job.message)) || (await update("floor.objects", { objects: job.list }, job.message));
      if (!saved) { ok = false; q.next = null; }
    }
    q.busy = false;
    setLocalObjects(null);
    return ok;
  };
  const changeObject = (id, patch) => saveObjects(allObjects.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  const addObject = async (kind) => {
    const fresh = newObject(kind, separate ? room : undefined);
    const o = { ...fresh, ...fitRoom(fresh) };
    if (await saveObjects([...allObjects, o], `${OBJECT_KINDS[kind].name}: u shtua në mes. Tërhiqeni ku e doni.`)) (onSelect(null), setObjectId(o.id));
  };
  const removeObject = async (o) => {
    if (await saveObjects(allObjects.filter((x) => x.id !== o.id), `${OBJECT_KINDS[o.kind].name}: u hoq.`)) {
      onObjectColor(o.id, o.color ?? null);
      setObjectId(null);
    }
  };
  // Delete or Backspace takes the chosen object away (not while typing in a field).
  useEffect(() => {
    if (!obj || saving) return;
    const key = (e) => {
      if (document.activeElement?.closest("dialog[open]")) return;
      if ((e.key === "Delete" || e.key === "Backspace") && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) (e.preventDefault(), removeObject(obj));
      if (e.key === "Escape") setObjectId(null);
      // Arrows nudge it one grid step (Shift: a whole table cell).
      const arrow = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (arrow && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) {
        e.preventDefault();
        const k = e.shiftKey ? 4 : 1;
        changeObject(obj.id, fitRoom({ ...obj, x: obj.x + arrow[0] * STEP_X * k, y: obj.y + arrow[1] * STEP_Y * k }));
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  return (
    <div className="room-edit">
      <div className="room-edit-tools">
        <button type="button" className="primary" onClick={add}>
          <Icon name="plus" size={18} /> Shto tavolinë
        </button>
        {separate && zones.length > 1 && (
          <div className="tabs room-zones" role="group" aria-label="Salla që po ndryshoni">
            {zones.map((z) => (
              <button key={z} type="button" aria-pressed={room === z} onClick={() => (onSelect(null), onRoom(z))}>{z}</button>
            ))}
          </div>
        )}
        <label className="room-split">
          <input
            type="checkbox"
            checked={separate}
            onChange={(e) => update("floor.rooms", { separate: e.target.checked }, e.target.checked ? "Çdo zonë tani është sallë më vete." : "Të gjitha zonat janë në një sallë.")}
          />
          Çdo zonë sallë më vete
        </label>
        {/* How everyone sees the room on Tavolinat. */}
        <div className="tabs room-look" role="group" aria-label="Pamja e sallës">
          {[["3d", "3D"], ["flat", "E thjeshtë"]].map(([value, label]) => (
            <button key={value} type="button" aria-pressed={look === value} onClick={() => look !== value && update("floor.style", { style: value }, value === "3d" ? "Salla shfaqet në 3D." : "Salla shfaqet e thjeshtë.")}>
              {label}
            </button>
          ))}
        </div>
        <span className="room-edit-hint">Tërhiqni një tavolinë për ta lëvizur · prekeni për ta ndryshuar · tërhiqni qoshen për madhësinë</span>
        <div className="room-edit-actions">
          <button type="button" aria-pressed={colorsOpen} onClick={() => setColorsOpen((open) => !open)} disabled={saving}>
            <span className="room-color-mark" aria-hidden="true" /> Ngjyrat
          </button>
          <button type="button" className="primary" onClick={confirmDraft}
            disabled={saving || localObjects !== null || (!drafted.length && !changedColors.length)}>
            <Icon name="check" size={17} /> {saving ? "Po ruhet…" : "Ruaj"}
          </button>
          <button type="button" className="icon-button" aria-label="Mbyll editorin e sallës" title="Mbyll editorin" onClick={onDone} disabled={saving}>
            <Icon name="close" size={20} />
          </button>
        </div>
      </div>
      {inactive.length > 0 && (
        <div className="room-edit-inactive">
          <span>Jo në sallë:</span>
          {inactive.map((x) => (
            <button key={x.id} type="button" onClick={() => update("table.toggle", { id: x.id }, `${tableName(x)} u kthye në sallë.`)}>
              <Icon name="plus" size={15} /> {tableName(x)}
            </button>
          ))}
        </div>
      )}
      {busy && <p className="ai-reading" role="status"><span className="ai-spinner" /> AI po e vizaton… zakonisht 15–40 sekonda.</p>}
      {error && <p className="ai-error" role="alert">{error}</p>}
      <div className="room-edit-body with-panel" inert={saving}>
        <FloorPlan
          tables={tables}
          waiters={state.waiters}
          look={look}
          drafted={new Set(drafted)}
          texture={state.floorTexture}
          editing
          selected={selected}
          onSelectTable={(x) => onSelect(x?.id ?? null)}
          onLayoutChange={onDraft}
          material={state.floorMaterial}
          objects={objects}
          objectColors={objectColors}
          selectedObject={objectId}
          onSelectObject={setObjectId}
          onObjectChange={changeObject}
        />
        {colorsOpen ? (
          <aside className="panel room-panel room-colors" aria-labelledby="room-colors-title">
            <div className="room-panel-head">
              <h2 id="room-colors-title">Ngjyrat</h2>
              <button type="button" className="icon-button" aria-label="Mbyll ngjyrat" onClick={() => setColorsOpen(false)}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <p className="room-color-target">{obj ? OBJECT_KINDS[obj.kind].name : t ? tableName(t) : "Të gjitha tavolinat e sallës"}</p>
            {obj ? (
              <ColorControl label="Objekti" color={Object.hasOwn(objectColors, obj.id) ? objectColors[obj.id] : obj.color}
                fallback="#68725a" onChange={(color) => onObjectColor(obj.id, color)} />
            ) : colorTables.length > 0 && (
              <>
                {[["tableColor", "Tavolina", "#774e38"], ["chairColor", "Karriget", "#343b45"]].map(([key, label, fallback]) => {
                  const colors = commonColor(key);
                  return <ColorControl key={key} label={label} fallback={fallback}
                    color={colors.size === 1 ? colors.values().next().value : null} mixed={colors.size > 1}
                    onChange={(color) => colorTables.forEach((table) => onDraft(table.id, { [key]: color }))} />;
                })}
                {colorTables.some((table) => table.sprite) && <p className="helper">Për tavolinat me foto, ngjyrat përdorin modelin 3D. Parazgjedhja rikthen foton.</p>}
                <p className="helper">{look === "3d" ? "Zgjidhni një tavolinë ose objekt në plan për t’ia ndryshuar ngjyrën veçmas." : "Karriget dhe objektet shfaqen në pamjen 3D."}</p>
              </>
            )}
          </aside>
        ) : drawing?.kind === "floor" ? (
          <aside className="panel room-panel">
            <h2>Dyshemeja e re</h2>
            <img className="room-drawing floor" src={drawing.image} alt="Dyshemeja e vizatuar nga foto" />
            <div className="actions">
              <button type="button" onClick={() => setDrawing(null)}>Hidhe</button>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => {
                  const old = state.floorTexture;
                  run(async () => {
                    await saveFloorAsset("floor", "Dyshemeja", drawing.image);
                    if (old) await deleteFloorAsset(old);
                    setDrawing(null);
                  }, "Dyshemeja e re u shtrua.");
                }}
              >
                Shtroje
              </button>
            </div>
          </aside>
        ) : obj ? (
          <ObjectPanel
            key={obj.id}
            obj={obj}
            onClose={() => setObjectId(null)}
            onChange={(patch) => changeObject(obj.id, patch)}
            onDuplicate={async () => { const copy = { ...obj, id: newObject(obj.kind).id }; Object.assign(copy, fitRoom({ ...copy, x: obj.x + STEP_X, y: obj.y + STEP_Y })); if (await saveObjects([...allObjects, copy], `${OBJECT_KINDS[obj.kind].name}: u dyfishua.`)) setObjectId(copy.id); }}
            onRemove={() => removeObject(obj)}
          />
        ) : !t ? (
          <aside className="panel room-panel room-library">
            <h2>Salla</h2>
            {look === "3d" && (
              <section aria-labelledby="room-floor-title">
                <h3 id="room-floor-title">Dyshemeja</h3>
                <div className="room-floors" role="radiogroup" aria-label="Dyshemeja">
                  {FLOOR_MATERIALS.map(([m, label]) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={!state.floorTexture && (state.floorMaterial || "oak") === m}
                      onClick={() => (state.floorMaterial || "oak") !== m && update("floor.material", { material: m }, `Dyshemeja: ${label.toLowerCase()}.`)}
                    >
                      <span className="room-floor-swatch" style={{ backgroundImage: floorLook(m).image }} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
                <div className="room-floor-photo">
        <PhotoButton label={state.floorTexture ? "Ndrysho dyshemenë" : "Dysheme nga foto"} kind="floor" busy={busy} setBusy={setBusy} onError={setError} onDrawn={(image) => setDrawing({ kind: "floor", image })} />
        {state.floorTexture && (
          <button type="button" disabled={busy} onClick={() => { const old = state.floorTexture; run(() => setFloorTexture(null).then(() => deleteFloorAsset(old)), "Dyshemeja u hoq."); }}>
            Hiq dyshemenë
          </button>
        )}
                </div>
                {state.floorTexture && <p className="helper">Dyshemeja nga foto zëvendëson materialin. Hiqeni për t'u kthyer te materiali i zgjedhur.</p>}
              </section>
            )}
            {look !== "3d" ? (
              <p className="helper room-flat-note">Muret, bimët, divanet dhe shenjat shfaqen te pamja <b>3D</b>. Pamja e thjeshtë tregon vetëm tavolinat.</p>
            ) : (
            <section aria-labelledby="room-objects-title">
              <h3 id="room-objects-title">Shto në sallë</h3>
              <div className="room-objects">
                {Object.entries(OBJECT_KINDS).map(([kind, k]) => (
                  <button key={kind} type="button" onClick={() => addObject(kind)}>
                    <span className={`room-object-preview small fo-${kind}`} aria-hidden="true"><ObjectArt kind={kind} text={k.text} /></span>
                    <span>{k.name}</span>
                  </button>
                ))}
              </div>
              <p className="helper">Muret dhe dritaret ndajnë sallën; bimët, divanet dhe shenjat e bëjnë si në realitet. Kamarierët i shohin, por prekin vetëm tavolinat.</p>
              {objects.length > 0 && (
                <button
                  type="button"
                  className="room-align"
                  onClick={() => {
                    // Every object of this room onto the grid (or flush to the room's walls).
                    const mine = new Set(objects.map((o) => o.id));
                    saveObjects(allObjects.map((o) => { if (!mine.has(o.id)) return o; const r = Math.round((o.r || 0) / 45) * 45 % 360; const snapped = { ...o, r, ...snapPosition({ ...o, r }, []) }; return { ...snapped, ...fitRoom(snapped), guides: undefined }; }), "Objektet u drejtuan në rrjetë.");
                  }}
                >
                  <Icon name="check" size={16} /> Drejto objektet
                </button>
              )}
            </section>
            )}
          </aside>
        ) : (
          <aside className="panel room-panel" key={`${t.id}-${Boolean(draft[t.id])}`}>
            <div className="room-panel-head">
              <h2>{tableName(t)}</h2>
              <button type="button" className="icon-button" aria-label="Mbyll" onClick={() => onSelect(null)}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <label className="field">
              <span>Emri (opsional)</span>
              <input
                defaultValue={t.label || ""}
                maxLength={20}
                placeholder={`bosh = ${String(t.id).padStart(2, "0")}`}
                onBlur={(e) => e.target.value.trim() !== (t.label || "") && save({ label: e.target.value.trim() })}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              />
            </label>
            <label className="field">
              <span>Zona</span>
              <input
                defaultValue={t.area}
                list="room-areas"
                maxLength={40}
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  if (!value) e.target.value = t.area;
                  else if (value !== t.area) save({ area: value });
                }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              />
              <datalist id="room-areas">{areas.map((a) => <option key={a} value={a} />)}</datalist>
            </label>
            <TableShapePicker
              value={t.shape}
              onChange={(shape) => save({ shape, ...((shape === "Bar") !== (t.shape === "Bar") ? sizeFor(shape, span.cols, span.rows) : {}) })}
            />
            <div className="room-steppers">
              <div className="field">
                <span>Vende</span>
                <div className="quantity seats-stepper">
                  <button type="button" aria-label="Një vend më pak" disabled={t.seats <= 1} onClick={() => save({ seats: t.seats - 1 })}>−</button>
                  <span>{t.seats}</span>
                  <button type="button" aria-label="Një vend më shumë" disabled={t.seats >= 12} onClick={() => save({ seats: t.seats + 1 })}>+</button>
                </div>
              </div>
              <div className="field">
                <span>Gjerësia</span>
                <div className="quantity seats-stepper">
                  <button type="button" aria-label="Më e ngushtë" disabled={span.cols <= 1} onClick={() => resize(span.cols - 1, span.rows)}>−</button>
                  <span>{span.cols}</span>
                  <button type="button" aria-label="Më e gjerë" disabled={span.cols >= MAX_SPAN} onClick={() => resize(span.cols + 1, span.rows)}>+</button>
                </div>
              </div>
              {t.shape !== "Bar" && (
                <div className="field">
                  <span>Gjatësia</span>
                  <div className="quantity seats-stepper">
                    <button type="button" aria-label="Më e shkurtër" disabled={span.rows <= 1} onClick={() => resize(span.cols, span.rows - 1)}>−</button>
                    <span>{span.rows}</span>
                    <button type="button" aria-label="Më e gjatë" disabled={span.rows >= MAX_SPAN} onClick={() => resize(span.cols, span.rows + 1)}>+</button>
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                // An eighth of a turn: a square table on the diagonal, as many rooms set them.
                const rotation = (t.rotation + 45) % 360;
                place({ rotation });
              }}
            >
              <Icon name="rotate" size={17} /> Rrotullo
            </button>
            {look === "3d" && <div className="room-photo">
              {drawing?.kind === "table" ? (
                <>
                  <img className="room-drawing" src={drawing.image} alt="Tavolina e vizatuar nga foto" />
                  <div className="actions">
                    <button type="button" onClick={() => setDrawing(null)}>Hidhe</button>
                    <button
                      type="button"
                      className="primary"
                      disabled={busy}
                      onClick={() => {
                        const old = t.sprite;
                        run(async () => {
                          const { id } = await saveFloorAsset("table", tableName(t), drawing.image);
                          await setTableSprite(t.id, id);
                          forget(old);
                          setDrawing(null);
                        }, "Tavolina mori pamjen nga foto.");
                      }}
                    >
                      Vendose
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <PhotoButton label={t.sprite ? "Foto tjetër" : "Pamja nga foto (AI)"} kind="table" busy={busy} setBusy={setBusy} onError={setError} onDrawn={(image) => setDrawing({ kind: "table", image })} />
                  {t.sprite && (
                    <button type="button" disabled={busy} onClick={() => { const old = t.sprite; run(async () => { await setTableSprite(t.id, null); forget(old); }); }}>
                      Hiq foton
                    </button>
                  )}
                </>
              )}
            </div>}
            <div className="room-panel-foot">
              <button
                type="button"
                className="subtle-button"
                disabled={t.lines.length > 0}
                title={t.lines.length ? "Ka porosi të hapura" : undefined}
                onClick={() => update("table.toggle", { id: t.id }, `${tableName(t)} u hoq nga salla. E ktheni nga "Jo në sallë".`).then((ok) => ok && onSelect(null))}
              >
                Hiqe nga salla
              </button>
              <button
                type="button"
                className="subtle-button danger"
                disabled={t.lines.length > 0}
                onClick={() => removeTable(t)}
              >
                Fshije
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

// A size or a position in the room's px: type it, or step it a grid square at a time.
function PxField({ label, value, step, min, max, onCommit }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = (v) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return setText(String(value));
    const next = Math.min(max, Math.max(min, n));
    setText(String(next));
    if (next !== value) onCommit(next);
  };
  return (
    <div className="px-field">
      <span>{label}</span>
      <div className="px-stepper">
        <button type="button" aria-label={`${label}: më pak`} disabled={value <= min} onClick={() => commit(value - step)}>−</button>
        <input
          inputMode="numeric"
          aria-label={`${label} në px`}
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^0-9-]/g, ""))}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); commit(value + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? step : 1)); }
          }}
        />
        <i>px</i>
        <button type="button" aria-label={`${label}: më shumë`} disabled={value >= max} onClick={() => commit(value + step)}>+</button>
      </div>
    </div>
  );
}

// The chosen object's inspector: what it is (and swap it for another kind in the same place),
// its size and place in the room's px (1600 × 1000), its turn, a sign's text.
function ObjectPanel({ obj, onClose, onChange, onDuplicate, onRemove }) {
  const kind = OBJECT_KINDS[obj.kind];
  const gx = toPx(STEP_X, "x"), gy = toPx(STEP_Y, "y"); // one grid square: 50 × 50 px
  // Any change goes through fitRoom, so the object always stays inside the room.
  const apply = (patch) => { const next = { ...obj, ...patch }; onChange({ ...patch, ...fitRoom(next) }); };
  const setW = (px) => apply(kind.square ? { w: fromPx(px, "x"), h: fromPx(px, "y") } : { w: fromPx(px, "x") });
  return (
    <aside className="panel room-panel object-panel">
      <div className="object-head">
        <span className={`room-object-preview fo-${obj.kind}`} aria-hidden="true"><ObjectArt kind={obj.kind} text={obj.text} /></span>
        <div>
          <h2>{kind.name}</h2>
          <p>{toPx(obj.w, "x")} × {toPx(obj.h, "y")} px · {obj.r || 0}°</p>
        </div>
        <button type="button" className="icon-button" aria-label="Mbyll" onClick={onClose}><Icon name="close" size={18} /></button>
      </div>

      {obj.kind === "sign" && (
        <label className="field">
          <span>Teksti</span>
          <input
            defaultValue={obj.text || ""}
            maxLength={30}
            placeholder="p.sh. Hyrja, Bar, WC, Dalje emergjence"
            onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== obj.text && onChange({ text: e.target.value.trim() })}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        </label>
      )}

      <section className="object-section">
        <h3>Madhësia</h3>
        <div className="px-grid">
          {kind.square ? (
            <PxField label="Madhësia" value={toPx(obj.w, "x")} step={gx / 2} min={toPx(kind.min[0], "x")} max={ROOM_PX.y} onCommit={setW} />
          ) : (
            <>
              <PxField label={kind.fixed ? "Gjatësia" : "Gjerësia"} value={toPx(obj.w, "x")} step={gx} min={toPx(kind.min[0], "x")} max={ROOM_PX.x} onCommit={setW} />
              {!kind.fixed && <PxField label="Thellësia" value={toPx(obj.h, "y")} step={gy / 2} min={toPx(kind.min[1], "y")} max={ROOM_PX.y} onCommit={(px) => apply({ h: fromPx(px, "y") })} />}
            </>
          )}
        </div>
      </section>

      <section className="object-section">
        <h3>Pozicioni</h3>
        <div className="px-grid">
          <PxField label="Majtas–djathtas" value={toPx(obj.x, "x")} step={gx} min={0} max={ROOM_PX.x} onCommit={(px) => apply({ x: fromPx(px, "x") })} />
          <PxField label="Lart–poshtë" value={toPx(obj.y, "y")} step={gy} min={0} max={ROOM_PX.y} onCommit={(px) => apply({ y: fromPx(px, "y") })} />
        </div>
      </section>

      <section className="object-section">
        <h3>Rrotullimi</h3>
        <div className="rotation-chips" role="radiogroup" aria-label="Rrotullimi">
          {[0, 45, 90, 135, 180, 225, 270, 315].map((r) => (
            <button key={r} type="button" role="radio" aria-checked={(obj.r || 0) === r} onClick={() => apply({ r })}>{r}°</button>
          ))}
        </div>
      </section>

      <section className="object-section">
        <h3>Lloji</h3>
        <div className="kind-chips" role="radiogroup" aria-label="Lloji i objektit">
          {Object.entries(OBJECT_KINDS).map(([k, def]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={obj.kind === k}
              title={def.name}
              onClick={() => obj.kind !== k && apply({ kind: k, w: def.w, h: def.h, ...(def.text ? { text: obj.text || def.text } : {}) })}
            >
              <span className={`room-object-preview tiny fo-${k}`} aria-hidden="true"><ObjectArt kind={k} text={def.text} /></span>
              <span>{def.name}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="object-foot">
        <button type="button" onClick={onDuplicate}><Icon name="plus" size={16} /> Dyfisho</button>
        <button type="button" className="danger-soft" onClick={onRemove}><Icon name="trash" size={16} /> Hiqe</button>
      </div>
      <p className="helper object-tip">Tërhiqeni në sallë: kapet vetë te muret, objektet dhe rrjeta. Shigjetat e lëvizin 50 px; Alt e lë të lirë.</p>
    </aside>
  );
}
