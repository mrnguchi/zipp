import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { requireApiBaseUrl } from "../../config/environment";
import { currentAccessToken } from "../identity/session";
import { record } from "../api/transport";
import { parseLiveSnapshot } from "./live-contract";
import type { LiveJobSnapshot } from "./live-contract";
export interface LiveSubscription {
  jobType: "RIDE" | "DELIVERY";
  jobId: string;
  afterVersion: () => number;
  onSnapshot: (s: LiveJobSnapshot) => void;
  onUnavailable: () => void;
}
/** Reconnect reconstructs auth and REST resync. Socket.IO offline mutation buffering is unused. */
export function subscribeLiveJob(input: LiveSubscription) {
  let stopped = false,
    attempt = 0,
    client: Socket | undefined,
    timer: ReturnType<typeof setTimeout> | undefined,
    retryAfter = 0,
    permanent = false,
    watchdog: ReturnType<typeof setTimeout> | undefined,
    lastFrame = 0;
  const unavailable = () => {
    if (!stopped) input.onUnavailable();
  };
  const retry = () => {
    unavailable();
    if (stopped || permanent || timer || attempt >= 8) return;
    const delay =
      Math.max(retryAfter, Math.min(30000, 1000 * 2 ** attempt++)) +
      Math.floor(Math.random() * 500);
    retryAfter = 0;
    timer = setTimeout(() => {
      timer = undefined;
      void connect();
    }, delay);
  };
  async function connect() {
    if (stopped) return;
    try {
      const token = await currentAccessToken();
      if (stopped) return;
      const url = new URL(requireApiBaseUrl()),
        prefix = url.pathname.replace(/\/+$/, ""),
        socket = io(url.origin, {
          path: `${prefix}/live/socket.io`,
          transports: ["websocket"],
          upgrade: false,
          forceNew: true,
          multiplex: false,
          reconnection: false,
          autoConnect: false,
          timeout: 8000,
          auth: {
            schemaVersion: 1,
            accessToken: token,
            jobType: input.jobType,
            jobId: input.jobId,
            afterVersion: input.afterVersion(),
          },
        });
      client = socket;
      let failed = false;
      const fail = () => {
        if (failed || stopped) return;
        failed = true;
        clearTimeout(watchdog);
        socket.auth = {};
        socket.removeAllListeners();
        socket.disconnect();
        retry();
      };
      const watch = () => {
        if (stopped || client !== socket) return;
        if (Date.now() - lastFrame > 12000) {
          fail();
          return;
        }
        watchdog = setTimeout(watch, 5000);
      };
      socket.on("connect", () => {
        lastFrame = Date.now();
        socket.auth = {};
        watchdog = setTimeout(watch, 5000);
      });
      socket.on("job.snapshot", (value: unknown) => {
        if (stopped || client !== socket) return;
        try {
          const snapshot = parseLiveSnapshot(value);
          if (
            snapshot.jobType !== input.jobType ||
            snapshot.jobId !== input.jobId
          )
            throw new Error("Wrong live job");
          if (snapshot.version < input.afterVersion()) {
            fail();
            return;
          }
          lastFrame = Date.now();
          attempt = 0;
          input.onSnapshot(snapshot);
          if (snapshot.terminal) {
            permanent = true;
            clearTimeout(watchdog);
            socket.auth = {};
            socket.removeAllListeners();
            socket.disconnect();
          }
        } catch {
          fail();
        }
      });
      socket.on("live.error", (value: unknown) => {
        try {
          const e = record(value);
          if (
            [
              "FORBIDDEN",
              "INVALID_SUBSCRIPTION",
              "UNSUPPORTED_COMMAND",
            ].includes(String(e.code))
          )
            permanent = true;
          if (
            typeof e.retryAfterSeconds === "number" &&
            Number.isInteger(e.retryAfterSeconds)
          )
            retryAfter = Math.max(0, Math.min(300, e.retryAfterSeconds)) * 1000;
        } catch {
          /* Unknown error never becomes visible private text. */
        }
        fail();
      });
      socket.on("connect_error", fail);
      socket.on("disconnect", fail);
      socket.connect();
    } catch {
      retry();
    }
  }
  void connect();
  return () => {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(watchdog);
    if (client) client.auth = {};
    client?.removeAllListeners();
    client?.disconnect();
    client = undefined;
  };
}
