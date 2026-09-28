import React from "react";

const paths = {
  tables: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 7h6M9 11h6M9 15h3" />
    </>
  ),
  stock: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Zm-9 5v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5" />
    </>
  ),
  menu: (
    <>
      <path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4V4Zm9 3a3 3 0 0 1 3-3h4v15h-3a4 4 0 0 0-4 2" />
      <path d="M7 8h3M7 12h3M16 8h1M16 12h1" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <path d="m9 5 7 7-7 7" />,
  chevronDown: <path d="m5 9 7 7 7-7" />,
  back: <path d="m14 5-7 7 7 7" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m5 12 4 4L19 6" />,
  backspace: (
    <>
      <path d="M9 6h11a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-6-6 6-6Z" />
      <path d="m11 10 4 4m0-4-4 4" />
    </>
  ),
  print: (
    <>
      <path d="M7 8V3h10v5M7 17H4V9h16v8h-3M7 14h10v7H7z" />
      <path d="M16 11h1" />
    </>
  ),
  edit: (
    <>
      <path d="m15 4 5 5-11 11H4v-5L15 4Zm-2 2 5 5" />
    </>
  ),
  coffee: (
    <>
      <path d="M5 8h11v7a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V8ZM16 9h2a3 3 0 0 1 0 6h-2M4 22h14M8 3v2M12 2v3" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7v1" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M6 15h4" />
    </>
  ),
  cash: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M5 9h1M18 15h1" />
    </>
  ),
  power: (
    <>
      <path d="M12 2v10" />
      <path d="M6.4 5.6a8 8 0 1 0 11.2 0" />
    </>
  ),
  location: (
    <>
      <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  rotate: (
    <>
      <path d="M3 12a9 9 0 1 1 3 6.7" />
      <path d="M3 21v-6h6" />
    </>
  ),
  fingerprint: (
    <>
      <path d="M12 3a8 8 0 0 1 8 8v2.5a5 5 0 0 1-5 5" />
      <path d="M12 3a8 8 0 0 0-8 8v3.5" />
      <path d="M12 7a4 4 0 0 1 4 4v3a3 3 0 0 1-1.2 2.4" />
      <path d="M12 7a4 4 0 0 0-4 4v6" />
      <path d="M12 11v5" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V10M12 20V4M20 20v-7" />
      <path d="M3 20h18" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h12M9 12h12M9 18h12" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </>
  ),
};
export function Icon({ name, size = 20, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] || paths.info}
    </svg>
  );
}
export function Search({
  value,
  onChange,
  label = "Kërko",
  placeholder = label,
}) {
  return (
    <div className="search">
      <Icon name="search" size={18} />
      <input
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          className="icon-button"
          aria-label={`Pastro: ${label}`}
          onClick={() => onChange("")}
        >
          <Icon name="close" size={15} />
        </button>
      )}
    </div>
  );
}
export function Empty({ icon = "search", title, children, action }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
// Each department gets a stable colour from its name, so a new "Grill" is tagged
// without anyone picking a colour.
const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
export function DepartmentTag({ name }) {
  if (!name) return null;
  return (
    <span
      className={`dept-tag ${name === "Tjetër" ? "neutral" : ""}`}
      style={{ "--tag-hue": hue(name) }}
    >
      {name}
    </span>
  );
}
export function Badge({ children, tone = "" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Field({ label, children, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children || <input {...props} />}
    </label>
  );
}
const PIN_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];
export function PinPad({ value, onChange, onComplete, length = 6, disabled }) {
  const press = (key) => {
    if (disabled) return;
    if (key === "clear") return onChange("");
    if (key === "back") return onChange(value.slice(0, -1));
    if (value.length >= length) return;
    const next = value + key;
    onChange(next);
    if (next.length === length) onComplete(next);
  };
  return (
    <div className="pin-pad">
      <div className="pin-dots" aria-hidden="true">
        {Array.from({ length }, (_, i) => (
          <span key={i} className={i < value.length ? "filled" : ""} />
        ))}
      </div>
      <span className="sr-only" aria-live="polite">
        {value.length} nga {length} shifra
      </span>
      <div className="pin-keys">
        {PIN_KEYS.map((key) =>
          key === "clear" ? (
            <button
              type="button"
              key={key}
              className="pin-clear"
              disabled={disabled || !value}
              onClick={() => press(key)}
            >
              Pastro
            </button>
          ) : key === "back" ? (
            <button
              type="button"
              key={key}
              className="icon-button"
              aria-label="Fshi shifrën e fundit"
              disabled={disabled || !value}
              onClick={() => press(key)}
            >
              <Icon name="backspace" />
            </button>
          ) : (
            <button
              type="button"
              key={key}
              aria-label={`Shifra ${key}`}
              disabled={disabled || value.length >= length}
              onClick={() => press(key)}
            >
              {key}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
export function SectionHeading({ title, description, children }) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
// Every restaurant lays out tables differently; shape is an optional label so a
// manager can match the icon to the real furniture. Unset (or "Drejtkëndësh") keeps
// the original rectangular symbol, so existing tables look the same as before.
const tableShapes = {
  Rreth: (
    <>
      <circle
        cx="41"
        cy="29"
        r="17"
        fill="currentColor"
        fillOpacity=".045"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M37 8V5h8v3M37 50v3h8v-3M14 25h-3v8h3M70 25h3v8h-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </>
  ),
  Katror: (
    <>
      <rect
        x="24"
        y="12"
        width="34"
        height="34"
        rx="7"
        fill="currentColor"
        fillOpacity=".045"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M33 7V5h16v2M33 51v2h16v-2M18 22h-2v14h2M66 22h2v14h-2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </>
  ),
  // A counter: stools sit on one side only, no chairs opposite.
  Bar: (
    <>
      <rect
        x="10"
        y="9"
        width="62"
        height="15"
        rx="4"
        fill="currentColor"
        fillOpacity=".045"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M22 33v9M41 33v9M60 33v9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </>
  ),
  Oval: (
    <>
      <ellipse
        cx="41"
        cy="29"
        rx="24"
        ry="15"
        fill="currentColor"
        fillOpacity=".045"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M31 8V5h20v3M31 50v3h20v-3M11 24h-3v10h3M71 24h3v10h-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </>
  ),
};
export function TableSymbol({ shape }) {
  return (
    <svg
      className="table-symbol"
      width="82"
      height="58"
      viewBox="0 0 82 58"
      fill="none"
      aria-hidden="true"
    >
      {(shape && tableShapes[shape]) || (
        <>
          <rect
            x="18"
            y="12"
            width="46"
            height="34"
            rx="7"
            fill="currentColor"
            fillOpacity=".045"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M29 7V5h24v2M29 51v2h24v-2M12 22h-2v14h2M70 22h2v14h-2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

const tableShapeOptions = ["Rreth", "Katror", "Drejtkëndësh", "Oval", "Bar"];
// Controlled: every click reports the shape straight away, so the table being edited
// can preview it before anything is saved.
export function TableShapePicker({ value = "Drejtkëndësh", onChange }) {
  return (
    <fieldset className="shape-picker">
      <legend>Forma e tavolinës</legend>
      <div className="shape-options">
        {tableShapeOptions.map((shape) => (
          <label className="shape-option" key={shape}>
            <input
              type="radio"
              name="shape"
              value={shape}
              checked={shape === (value || "Drejtkëndësh")}
              onChange={() => onChange(shape)}
            />
            <TableSymbol shape={shape} />
            <span>{shape}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
