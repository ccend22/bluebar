import { useState, useEffect, useRef, useCallback } from "react";
import { fetchState, sendCommand } from "./api.js";
const empty = {
  products: [],
  categories: [],
  waiters: [],
  tables: [],
  invoices: [],
  movements: [],
  shifts: [],
  shift: null,
};
const key = "bluebar-pending-command-v1";
export const pendingKey = key;
function readPending() {
  try {
    return JSON.parse(sessionStorage.getItem(key));
  } catch {
    return null;
  }
}
export function useDatabase() {
  const [snapshot, setSnapshot] = useState({
      state: empty,
      version: 0,
      provider: "PostgreSQL",
    }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(readPending),
    [ready, setReady] = useState(false);
  const snapshotRef = useRef(snapshot),
    lock = useRef(false),
    pendingRef = useRef(pending);
  const accept = useCallback((data) => {
    if (data.version >= snapshotRef.current.version) {
      snapshotRef.current = data;
      setSnapshot(data);
    }
    setReady(true);
    setError("");
  }, []);
  const refresh = useCallback(async () => {
    try {
      accept(await fetchState());
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [accept]);
  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (!lock.current && !pendingRef.current) refresh();
    }, 10000);
    const focus = () => {
      if (!lock.current && !pendingRef.current) refresh();
    };
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  async function execute(type, payload, retry = false) {
    if (lock.current) throw Error("Prisni përfundimin e veprimit aktual.");
    if (pendingRef.current && !retry)
      throw Error("Verifikoni veprimin e mëparshëm përpara se të vazhdoni.");
    const command = retry
      ? pendingRef.current
      : {
          id: crypto.randomUUID(),
          version: snapshotRef.current.version,
          type,
          payload,
        };
    if (!command) throw Error("Nuk ka veprim për të riprovuar.");
    // Persist before sending, so a lost response/reload can retry the exact same command ID.
    try {
      sessionStorage.setItem(key, JSON.stringify(command));
    } catch {
      throw Error(
        "Shfletuesi nuk lejon ruajtjen e kërkesës. Aktivizoni ruajtjen përpara veprimeve.",
      );
    }
    pendingRef.current = command;
    setPending(command);
    lock.current = true;
    setBusy(true);
    try {
      const data = await sendCommand(command);
      accept(data);
      pendingRef.current = null;
      setPending(null);
      sessionStorage.removeItem(key);
      return data;
    } catch (e) {
      if (e.status >= 400 && e.status < 500) {
        pendingRef.current = null;
        setPending(null);
        sessionStorage.removeItem(key);
        if (e.status === 409) await refresh();
      } else
        setError(
          "Rezultati i veprimit nuk u verifikua. Përdorni “Verifiko veprimin”; mos e regjistroni përsëri.",
        );
      throw e;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return {
    ...snapshot,
    loading,
    error,
    busy,
    pending,
    ready,
    refresh,
    execute,
  };
}
