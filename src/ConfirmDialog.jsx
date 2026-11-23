import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { Icon } from "./components.jsx";
import "./confirm-dialog.css";

const ConfirmContext = createContext(null);

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }) {
  const dialog = useRef(null);
  const cancel = useRef(null);
  const pending = useRef(null);
  const [request, setRequest] = useState(null);
  const titleId = useId();
  const bodyId = useId();

  const confirm = useCallback((options) => {
    // Only the first action can own the visible confirmation.
    if (pending.current) return Promise.resolve(false);
    return new Promise((resolve) => {
      pending.current = resolve;
      setRequest(options);
    });
  }, []);

  useEffect(() => {
    const box = dialog.current;
    if (!request || !box || box.open) return;
    box.returnValue = "";
    box.showModal();
    cancel.current?.focus({ preventScroll: true });
  }, [request]);

  useEffect(() => () => {
    pending.current?.(false);
    pending.current = null;
  }, []);

  const finish = () => {
    const resolve = pending.current;
    pending.current = null;
    setRequest(null);
    resolve?.(dialog.current?.returnValue === "confirm");
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog
        ref={dialog}
        className="bb-confirm"
        role="alertdialog"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onClose={finish}
      >
        {request && (
          <form method="dialog" className={request.destructive ? "bb-confirm-form danger" : "bb-confirm-form"}>
            <div className="bb-confirm-content">
              <span className="bb-confirm-icon" aria-hidden="true">
                <Icon name={request.icon || "trash"} size={21} />
              </span>
              <div className="bb-confirm-copy">
                <h2 id={titleId}>{request.title}</h2>
                <div id={bodyId} className="bb-confirm-description">
                  {request.detail && (
                    <div className="bb-confirm-detail">
                      <span>{request.detail.name}</span>
                      {request.detail.value && <strong>{request.detail.value}</strong>}
                    </div>
                  )}
                  <p>{request.description}</p>
                </div>
              </div>
            </div>
            <div className="bb-confirm-actions">
              <button ref={cancel} type="submit" value="cancel">{request.cancelLabel || "Anulo"}</button>
              <button type="submit" value="confirm" className="bb-confirm-commit">{request.action}</button>
            </div>
          </form>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}
