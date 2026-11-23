import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { environment } from "../../config/environment";
import { sessionSnapshot, subscribeSession } from "../identity/session";
import { subscribeLiveJob } from "./subscribe-live-job";
import type { LiveJobSnapshot } from "./live-contract";
export function useLiveJob(
  jobType: "RIDE" | "DELIVERY",
  id: string | undefined,
  enabled: boolean,
  version: number,
  onSnapshot: (value: LiveJobSnapshot) => void,
  onUnavailable: () => void,
) {
  const session = useSyncExternalStore(subscribeSession, sessionSnapshot),
    callbacks = useRef({ version, onSnapshot, onUnavailable }),
    last = useRef(0);
  callbacks.current = { version, onSnapshot, onUnavailable };
  useEffect(() => {
    last.current = 0;
    if (!environment.realtimeEnabled || !id || !enabled || !session) return;
    const stop = subscribeLiveJob({
      jobType,
      jobId: id,
      afterVersion: () => callbacks.current.version,
      onSnapshot: (s) => {
        last.current = Date.now();
        callbacks.current.onSnapshot(s);
      },
      onUnavailable: () => {
        last.current = 0;
        callbacks.current.onUnavailable();
      },
    });
    return () => {
      last.current = 0;
      stop();
    };
  }, [jobType, id, enabled, session?.userId]);
  return useCallback(
    () => last.current > 0 && Date.now() - last.current < 10000,
    [],
  );
}
