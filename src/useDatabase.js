import { useState, useEffect, useRef, useCallback } from "react";
import { fetchState, sendCommand, venueSlug } from "./api.js";
import { addItem } from "./domain.js";

const empty = {
  products: [], categories: [], waiters: [], tables: [], invoices: [],
  movements: [], shifts: [], shift: null,
};
const key = `bluebar-pending-command-v2:${venueSlug}`;
const orderQueueKey = `bluebar-order-queue-v2:${venueSlug}`;
export const pendingKey = key;

function readStorage(storageKey, fallback) {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey)) || fallback;
  } catch {
    return fallback;
  }
}

function changeOrder(state, type, payload) {
  if (type === "order.add")
    return addItem(state, payload.tableId, payload.productId, payload.waiterId);
  const table = state.tables.find((item) => item.id === payload.tableId);
  if (!state.shift) throw Error("Turni është i mbyllur.");
  if (!table?.active) throw Error("Tavolina nuk ekziston ose është joaktive.");
  if (!table.lines.some((line) => line.id === payload.productId))
    throw Error("Produkti nuk është në porosi.");
  return {
    ...state,
    tables: state.tables.map((item) =>
      item.id !== payload.tableId
        ? item
        : {
            ...item,
            lines: item.lines
              .map((line) =>
                line.id === payload.productId
                  ? { ...line, qty: line.qty - 1 }
                  : line,
              )
              .filter((line) => line.qty > 0),
          },
    ),
  };
}

export function useDatabase() {
  const initial = { state: empty, version: 0, provider: "PostgreSQL" };
  const [snapshot, setSnapshot] = useState(initial),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [syncingOrders, setSyncingOrders] = useState(false),
    [pending, setPending] = useState(() => readStorage(key, null)),
    [orderUncertain, setOrderUncertain] = useState(() =>
      readStorage(orderQueueKey, []).length > 0,
    ),
    [ready, setReady] = useState(false);
  const snapshotRef = useRef(snapshot),
    confirmedRef = useRef(initial),
    lock = useRef(false),
    pendingRef = useRef(pending),
    orderQueue = useRef(readStorage(orderQueueKey, [])),
    orderProcessing = useRef(null),
    orderWaiters = useRef(new Map());

  const storeOrderQueue = () => {
    if (orderQueue.current.length)
      sessionStorage.setItem(orderQueueKey, JSON.stringify(orderQueue.current));
    else sessionStorage.removeItem(orderQueueKey);
  };
  const publish = useCallback(() => {
    let state = confirmedRef.current.state;
    for (const command of orderQueue.current) {
      try {
        state = changeOrder(state, command.type, command.payload);
      } catch {
        // The server remains authoritative and returns the actionable error.
      }
    }
    const view = { ...confirmedRef.current, state };
    snapshotRef.current = view;
    setSnapshot(view);
  }, []);
  const accept = useCallback(
    (data) => {
      if (data.version < confirmedRef.current.version) return;
      if (data.patch?.table) {
        const table = data.patch.table;
        confirmedRef.current = {
          ...confirmedRef.current,
          version: data.version,
          provider: data.provider || confirmedRef.current.provider,
          state: {
            ...confirmedRef.current.state,
            tables: confirmedRef.current.state.tables.map((item) =>
              item.id === table.id ? table : item,
            ),
          },
        };
      } else confirmedRef.current = data;
      publish();
      setReady(true);
      setError("");
    },
    [publish],
  );
  const refresh = useCallback(async () => {
    try {
      accept(await fetchState());
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [accept]);

  const processOrders = useCallback(() => {
    if (orderProcessing.current) return orderProcessing.current;
    const run = async () => {
      setSyncingOrders(true);
      let latest = null;
      try {
        while (orderQueue.current.length) {
          const command = orderQueue.current[0];
          command.version ??= confirmedRef.current.version;
          storeOrderQueue();
          try {
            latest = await sendCommand(command);
          } catch (requestError) {
            if (requestError.status === 409 && (command.rebases || 0) < 2) {
              command.rebases = (command.rebases || 0) + 1;
              confirmedRef.current = await fetchState();
              for (const queued of orderQueue.current) delete queued.version;
              storeOrderQueue();
              publish();
              continue;
            }
            if (requestError.status >= 400 && requestError.status < 500) {
              orderQueue.current.shift();
              storeOrderQueue();
              orderWaiters.current.get(command.id)?.reject(requestError);
              orderWaiters.current.delete(command.id);
              confirmedRef.current = await fetchState();
              for (const queued of orderQueue.current) delete queued.version;
              publish();
              continue;
            }
            setOrderUncertain(true);
            setError(
              "Rezultati i veprimit nuk u verifikua. Përdorni “Verifiko veprimin”; porosia nuk do të dyfishohet.",
            );
            throw requestError;
          }
          orderQueue.current.shift();
          storeOrderQueue();
          accept(latest);
          orderWaiters.current.get(command.id)?.resolve(latest);
          orderWaiters.current.delete(command.id);
        }
        setOrderUncertain(false);
        return latest;
      } finally {
        setSyncingOrders(false);
        orderProcessing.current = null;
      }
    };
    orderProcessing.current = run();
    return orderProcessing.current;
  }, [accept, publish]);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (!lock.current && !pendingRef.current && !orderQueue.current.length)
        refresh();
    }, 10000);
    const focus = () => {
      if (!lock.current && !pendingRef.current && !orderQueue.current.length)
        refresh();
    };
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);

  async function execute(type, payload, retry = false) {
    if (retry && orderUncertain && orderQueue.current.length) {
      setOrderUncertain(false);
      setError("");
      return processOrders();
    }
    if (["order.add", "order.remove"].includes(type)) {
      if (orderUncertain)
        throw Error("Verifikoni veprimin e mëparshëm përpara se të vazhdoni.");
      changeOrder(snapshotRef.current.state, type, payload);
      const command = { id: crypto.randomUUID(), type, payload };
      const completion = new Promise((resolve, reject) =>
        orderWaiters.current.set(command.id, { resolve, reject }),
      );
      orderQueue.current.push(command);
      storeOrderQueue();
      publish();
      processOrders().catch(() => {});
      return completion;
    }
    if (orderQueue.current.length) await processOrders();
    if (lock.current) throw Error("Prisni përfundimin e veprimit aktual.");
    if (pendingRef.current && !retry)
      throw Error("Verifikoni veprimin e mëparshëm përpara se të vazhdoni.");
    const command = retry
      ? pendingRef.current
      : {
          id: crypto.randomUUID(),
          version: confirmedRef.current.version,
          type,
          payload,
        };
    if (!command) throw Error("Nuk ka veprim për të riprovuar.");
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
    } catch (requestError) {
      if (requestError.status >= 400 && requestError.status < 500) {
        pendingRef.current = null;
        setPending(null);
        sessionStorage.removeItem(key);
        if (requestError.status === 409) await refresh();
      } else
        setError(
          "Rezultati i veprimit nuk u verifikua. Përdorni “Verifiko veprimin”; mos e regjistroni përsëri.",
        );
      throw requestError;
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
    syncingOrders,
    saving: busy || syncingOrders,
    pending: pending || (orderUncertain ? orderQueue.current[0] : null),
    ready,
    refresh,
    execute,
  };
}
