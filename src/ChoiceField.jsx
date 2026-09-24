import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./components.jsx";

export function ChoiceField({
  label,
  options,
  value,
  defaultValue,
  onChange,
  name,
  disabled = false,
  compact = false,
}) {
  const id = useId();
  const trigger = useRef(null);
  const menu = useRef(null);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState({});
  const [localValue, setLocalValue] = useState(defaultValue ?? options[0]?.value ?? "");
  const selectedValue = value === undefined ? localValue : value;
  const selected = options.find((option) => String(option.value) === String(selectedValue));

  useEffect(() => {
    setLocalValue(defaultValue ?? options[0]?.value ?? "");
  }, [defaultValue]);

  useEffect(() => {
    if (!open) return;
    const selectedOption = menu.current?.querySelector('[aria-pressed="true"]');
    (selectedOption || menu.current?.querySelector(".choice-option"))?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const escape = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", escape);
    const closeOnResize = () => setOpen(false);
    const closeOnScroll = (event) => {
      if (!menu.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener("resize", closeOnResize);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", closeOnResize);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = trigger.current.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 210), window.innerWidth - 16);
    const height = Math.min(options.length * 58 + 12, 400, window.innerHeight - 16);
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const placeBelow = below >= height || below >= above;
    const available = Math.max(80, placeBelow ? below : above);
    setMenuStyle({
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
      top: placeBelow ? rect.bottom + 6 : Math.max(8, rect.top - Math.min(height, available) - 6),
      width,
      maxHeight: Math.min(height, available),
    });
    setOpen(true);
  };

  const choose = (option) => {
    if (value === undefined) setLocalValue(option.value);
    onChange?.(option.value);
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  };

  const onMenuKeyDown = (event) => {
    const buttons = [...menu.current.querySelectorAll(".choice-option")];
    const current = buttons.indexOf(document.activeElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
        : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus({ preventScroll: false });
    } else if (event.key === "Tab") {
      const focusable = [...document.querySelectorAll('a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), textarea:not([disabled])')]
        .filter((element) => !menu.current.contains(element) && element.getClientRects().length);
      const index = focusable.indexOf(trigger.current);
      const next = focusable[index + (event.shiftKey ? -1 : 1)];
      if (next) {
        event.preventDefault();
        setOpen(false);
        next.focus();
      }
    }
  };

  return (
    <div className={`${compact ? "compact-select" : "field"} choice-field`}>
      <span id={`${id}-label`}>{label}</span>
      {name && <input type="hidden" name={name} value={selectedValue ?? ""} />}
      <button
        ref={trigger}
        type="button"
        className="choice-trigger"
        disabled={disabled || !options.length}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) toggle();
          }
        }}
      >
        <span id={`${id}-value`} className="choice-value">{selected?.label ?? "Zgjidhni"}</span>
        <Icon name="chevronDown" size={20} />
      </button>
      {open && createPortal(
        <div className="choice-layer" onPointerDown={() => setOpen(false)}>
          <div ref={menu} className="choice-menu" style={menuStyle} onKeyDown={onMenuKeyDown} onPointerDown={(event) => event.stopPropagation()}>
            <div id={`${id}-list`} className="choice-options" role="group" aria-label={label}>
              {options.map((option) => {
                const isSelected = String(option.value) === String(selectedValue);
                return <button
                  type="button"
                  className="choice-option"
                  key={option.value}
                  aria-pressed={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => choose(option)}
                >
                  <span>{option.label}</span>
                  {isSelected && <Icon name="check" size={20} />}
                </button>;
              })}
            </div>
          </div>
        </div>, document.body,
      )}
    </div>
  );
}
