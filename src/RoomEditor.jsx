import React, { useEffect, useState } from "react";
import { MAX_SPAN, inRoom, rectFits, rectOf, sizeFor, spanOf } from "./floorGeometry.js";
import { tableName } from "./domain.js";
import { deleteFloorAsset, drawFloorAsset, saveFloorAsset, setFloorTexture, setTableSprite } from "./api.js";
import { shrink } from "./OnlineMenu.jsx";
import { FloorPlan } from "./FloorPlan.jsx";
import { Icon, TableShapePicker } from "./components.jsx";

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

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

// A photo → Gemini's drawing → shown to the manager before it is used.
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
            onError(err.message);
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
export function RoomEditor({ state, tables: allTables, update, notify, refresh, selected, onSelect, draft, onDraft, onDiscard, onDone, area, onRoom }) {
  // Rooms of their own: the room being arranged, and only its tables.
  const separate = state.separateRooms === true;
  const zones = [...new Set(allTables.map((x) => x.area))].sort((a, b) => a.localeCompare(b, "sq"));
  const room = zones.includes(area) ? area : zones[0];
  const tables = separate ? allTables.filter((x) => x.area === room) : allTables;
  const [saving, setSaving] = useState(false);
  const drafted = Object.keys(draft).map(Number);
  const confirmDraft = async () => {
    setSaving(true);
    const ok = await update("tables.save", { tables: drafted.map((id) => ({ id, ...draft[id] })) }, `U ruajt: ${drafted.length === 1 ? "1 tavolinë e ndryshuar" : `${drafted.length} tavolina të ndryshuara`}.`);
    setSaving(false);
    if (ok) onDiscard();
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
        {look === "3d" && (
        <PhotoButton label={state.floorTexture ? "Ndrysho dyshemenë" : "Dysheme nga foto"} kind="floor" busy={busy} setBusy={setBusy} onError={setError} onDrawn={(image) => setDrawing({ kind: "floor", image })} />
        )}
        {look === "3d" && state.floorTexture && (
          <button type="button" disabled={busy} onClick={() => { const old = state.floorTexture; run(() => setFloorTexture(null).then(() => deleteFloorAsset(old)), "Dyshemeja u hoq."); }}>
            Hiq dyshemenë
          </button>
        )}
        <span className="room-edit-hint">Tërhiqni një tavolinë për ta lëvizur · prekeni për ta ndryshuar · tërhiqni qoshen për madhësinë</span>
        {/* The same button that opened editing closes it: pressed while the room is open. */}
        <button type="button" className="room-done" aria-pressed="true" onClick={onDone}>
          <Icon name="edit" size={18} /> Ndrysho sallën
        </button>
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
      <div className={`room-edit-body ${t || drawing ? "with-panel" : ""}`}>
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
        />
        {drawing?.kind === "floor" ? (
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
        ) : t && (
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
                onClick={() => confirm(`Të fshihet ${tableName(t)} përgjithmonë?`) && update("table.delete", { id: t.id }, `${tableName(t)} u fshi.`).then((ok) => ok && onSelect(null))}
              >
                Fshije
              </button>
            </div>
          </aside>
        )}
      </div>
      {drafted.length > 0 && (
        <div className="draft-bar room-draft" role="status">
          <span>
            <b>Pa konfirmuar:</b> {drafted.length === 1 ? "1 tavolinë e ndryshuar" : `${drafted.length} tavolina të ndryshuara`} (me të verdhë)
          </span>
          <button type="button" onClick={onDiscard} disabled={saving}>Anulo</button>
          <button type="button" className="primary" onClick={confirmDraft} disabled={saving}>
            <Icon name="check" size={17} />
            {saving ? "Po ruhet…" : "Konfirmo"}
          </button>
        </div>
      )}
    </div>
  );
}
