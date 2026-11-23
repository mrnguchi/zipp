import { useLiveJob } from "../realtime/use-live-job";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import * as api from "./delivery-api";
import { requestId } from "./crypto";
import { ApiFailure, errorMessage } from "../api/transport";
import type { DeliveryDraft } from "../../services/deliveryFlow";
import type { DeliverySnapshot, ServerQuote, Tracking } from "./contracts";
import { terminal } from "./contracts";
import { sessionSnapshot, subscribeSession } from "../identity/session";
type Pending = { key: string; body: ReturnType<typeof api.bookingInput> };
/** Server snapshots own money and lifecycle; no simulation or local ledger mutation. */
export function useDeliveryApi() {
  const focused = useIsFocused(),
    [rows, setRows] = useState<DeliverySnapshot[]>([]),
    [selected, setSelected] = useState<DeliverySnapshot | null>(null),
    [position, setPosition] = useState<Tracking["position"]>(null),
    [quote, setQuote] = useState<ServerQuote | null>(null),
    [available, setAvailable] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [foreground, setForeground] = useState(AppState.currentState === "active");
  const running = useRef(false),
    pending = useRef<Pending | null>(null),
    alive = useRef(true),
    mutations = useRef(new Map<string, string>()),
    latestSelected = useRef(selected),
    liveRefresh = useRef<(() => void) | null>(null);
  latestSelected.current = selected;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let owner = sessionSnapshot()?.userId ?? null;
    return subscribeSession(() => {
      const next = sessionSnapshot()?.userId ?? null;
      if (owner !== null && owner !== next) {
        setRows([]);
        setSelected(null);
        setPosition(null);
        setQuote(null);
        setAvailable(null);
        setReady(false);
        setUncertain(false);
        pending.current = null;
        mutations.current.clear();
      }
      owner = next;
    });
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) =>
      setForeground(s === "active"),
    );
    return () => sub.remove();
  }, []);
  const merge = useCallback((d: DeliverySnapshot) => {
    if (!alive.current) return;
    setRows((old) => [d, ...old.filter((v) => v.id !== d.id)]);
    setSelected((old) =>
      !old || old.id !== d.id || d.version >= old.version ? d : old,
    );
  }, []);
  const load = useCallback(async () => {
    const [active, history, wallet] = await Promise.all([
      api.activeDeliveries(),
      api.deliveryHistory(),
      api.getWallet(),
    ]);
    if (!alive.current) return;
    setRows([
      ...active,
      ...history.filter((h) => !active.some((a) => a.id === h.id)),
    ]);
    setSelected((old) =>
      old
        ? (active.find((d) => d.id === old.id) ??
          history.find((d) => d.id === old.id) ??
          old)
        : (active[0] ?? null),
    );
    setAvailable(wallet);
    setReady(true);
  }, []);
  const perform = useCallback(async (fn: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (alive.current) setError(errorMessage(e));
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    if (focused && foreground) void perform(load);
  }, [focused, foreground, load, perform]);
  const id = selected?.id,
    ended = selected ? terminal(selected.status) : true;
  const liveFresh = useLiveJob(
    "DELIVERY",
    id,
    !ended && focused && foreground,
    selected?.version ?? 0,
    (s) => {
      const current = latestSelected.current;
      if (current?.id !== s.jobId || s.version < current.version) return;
      setPosition(s.position);
      if (s.resyncRequired || s.version > current.version)
        liveRefresh.current?.();
    },
    () => {
      setPosition(null);
      liveRefresh.current?.();
    },
  );
  useEffect(() => {
    if (!id || ended || !focused || !foreground) return;
    let stopped = false,
      inFlight = false,
      refreshRequested = false;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (stopped) return;
      if (inFlight) {
        refreshRequested = true;
        return;
      }
      inFlight = true;
      let delay = liveFresh() ? 15000 : 5000;
      try {
        const d = await api.getDelivery(id, controller.signal);
        if (!stopped) {
          merge(d);
          const t = await api.getTracking(id, controller.signal);
          if (!stopped) setPosition(t.position);
        }
      } catch (e) {
        if (!stopped) {
          setPosition(null);
          setError(errorMessage(e));
        }
        delay =
          e instanceof ApiFailure && e.retryAfter
            ? Math.max(5000, e.retryAfter * 1000)
            : 15000;
      } finally {
        inFlight = false;
        if (!stopped)
          timer = setTimeout(
            () => {
              void poll();
            },
            refreshRequested ? 0 : delay,
          );
        refreshRequested = false;
      }
    };
    liveRefresh.current = () => {
      clearTimeout(timer);
      void poll();
    };
    void poll();
    return () => {
      liveRefresh.current = null;
      stopped = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [id, ended, focused, foreground, merge, liveFresh]);
  const review = (draft: DeliveryDraft) =>
    perform(async () => {
      setQuote(await api.getQuote(draft));
    });
  const book = (draft: DeliveryDraft) =>
    perform(async () => {
      if (!ready || !quote) throw new Error("Review a current quote first");
      if (!pending.current) {
        if (Date.parse(quote.expiresAt) <= Date.now())
          throw new ApiFailure("QUOTE_EXPIRED", 409);
        pending.current = {
          key: await requestId(),
          body: api.bookingInput(draft, quote.id, await api.uploadPhoto(draft)),
        };
      }
      setUncertain(true);
      let d: DeliverySnapshot;
      try {
        d = await api.bookDelivery(pending.current.key, pending.current.body);
      } catch (e) {
        // These responses are issued only after the scoped replay lookup; there is no committed booking.
        if (
          e instanceof ApiFailure &&
          ["QUOTE_EXPIRED", "INSUFFICIENT_FUNDS"].includes(e.code)
        ) {
          pending.current = null;
          setUncertain(false);
          if (e.code === "QUOTE_EXPIRED") setQuote(null);
        }
        throw e;
      }
      pending.current = null;
      setUncertain(false);
      merge(d);
      setQuote(null);
      setAvailable(await api.getWallet());
    });
  const mutate = (path: string, body: unknown) =>
    perform(async () => {
      if (!selected) return;
      const scope = JSON.stringify([selected.id, path, body]);
      let key = mutations.current.get(scope);
      if (!key) {
        key = await requestId();
        mutations.current.set(scope, key);
      }
      const d = await api.action(selected.id, path, key, body);
      merge(d);
      setAvailable(await api.getWallet());
    });
  return {
    rows,
    selected,
    position,
    quote,
    available,
    busy,
    error,
    ready,
    uncertain,
    review,
    book,
    mutate,
    perform,
    refresh: () => perform(load),
    select: (d: DeliverySnapshot | null) => {
      setSelected(d);
      setPosition(null);
    },
    invalidateQuote: () => {
      if (!pending.current) setQuote(null);
    },
    setError,
  };
}

export type DeliveryApiModel = ReturnType<typeof useDeliveryApi>;
