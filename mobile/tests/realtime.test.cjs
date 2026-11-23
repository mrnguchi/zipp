// Source only; no native socket/device/recovery evidence until explicitly executed.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { randomUUID } = require("node:crypto");
function harness() {
  const sockets = [],
    timers = new Map(),
    frames = [],
    unavailable = [];
  let token = "first.access.token",
    index = 0;
  class FakeSocket {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.listeners = new Map();
      this.closed = false;
    }
    on(name, handler) {
      this.listeners.set(name, handler);
      return this;
    }
    removeAllListeners() {
      this.listeners.clear();
      return this;
    }
    disconnect() {
      this.closed = true;
      return this;
    }
    connect() {
      this.connected = true;
    }
    receive(name, value) {
      this.listeners.get(name)?.(value);
    }
  }
  const cache = new Map();
  function load(relative) {
    const file = path.resolve(__dirname, "../src", relative);
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    vm.runInNewContext(
      ts.transpileModule(fs.readFileSync(file, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
      }).outputText,
      {
        exports,
        require: (name) => {
          if (name === "socket.io-client")
            return {
              io: (url, options) => {
                const c = new FakeSocket(url, options);
                sockets.push(c);
                return c;
              },
            };
          if (name === "../identity/session")
            return { currentAccessToken: async () => token };
          return load(
            path.relative(
              path.resolve(__dirname, "../src"),
              path.resolve(path.dirname(file), name + ".ts"),
            ),
          );
        },
        URL,
        Headers,
        AbortController,
        process: {
          env: { EXPO_PUBLIC_API_URL: "https://api.example.invalid/api/v1" },
        },
        __DEV__: false,
        setTimeout: (fn, ms) => {
          timers.set(++index, { fn, ms });
          return index;
        },
        clearTimeout: (id) => timers.delete(id),
      },
    );
    return exports;
  }
  return {
    load,
    sockets,
    timers,
    frames,
    unavailable,
    setToken: (v) => {
      token = v;
    },
    nextTimer: async () => {
      const [id, timer] = timers.entries().next().value ?? [];
      if (!timer) return;
      timers.delete(id);
      timer.fn();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}
const frame = (jobId, patch = {}) => ({
  schemaVersion: 1,
  type: "job.snapshot",
  jobType: "DELIVERY",
  jobId,
  version: 3,
  status: "IN_TRANSIT",
  custody: "WITH_COURIER",
  terminal: false,
  position: {
    latitude: 4.05,
    longitude: 9.7,
    receivedAt: new Date().toISOString(),
    stale: false,
  },
  resyncRequired: false,
  observedAt: new Date().toISOString(),
  ...patch,
});
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
test("live handshake sends the current JWT only in auth and never in a query URL", async () => {
  const h = harness(),
    id = randomUUID(),
    { subscribeLiveJob } = h.load("features/realtime/subscribe-live-job.ts"),
    stop = subscribeLiveJob({
      jobType: "DELIVERY",
      jobId: id,
      afterVersion: () => 2,
      onSnapshot: (v) => h.frames.push(v),
      onUnavailable: () => h.unavailable.push(true),
    });
  await flush();
  assert.equal(h.sockets.length, 1);
  const c = h.sockets[0];
  assert.equal(c.url, "https://api.example.invalid");
  assert.equal(c.options.path, "/api/v1/live/socket.io");
  assert.equal(c.options.auth.accessToken, "first.access.token");
  assert.equal(c.options.query, undefined);
  assert.deepEqual(Array.from(c.options.transports), ["websocket"]);
  c.receive("job.snapshot", frame(id));
  assert.equal(h.frames.length, 1);
  assert.equal("accessToken" in h.frames[0], false);
  stop();
  assert.equal(c.closed, true);
});
test("a mismatched job or regressed version clears the live view instead of applying it", async () => {
  const h = harness(),
    id = randomUUID(),
    { subscribeLiveJob } = h.load("features/realtime/subscribe-live-job.ts"),
    stop = subscribeLiveJob({
      jobType: "DELIVERY",
      jobId: id,
      afterVersion: () => 4,
      onSnapshot: (v) => h.frames.push(v),
      onUnavailable: () => h.unavailable.push(true),
    });
  await flush();
  h.sockets[0].receive("job.snapshot", frame(id, { version: 3 }));
  assert.equal(h.frames.length, 0);
  assert.equal(h.unavailable.length, 1);
  stop();
});
test("reconnect obtains a new token and latest cursor with bounded nonbuffering options", async () => {
  const h = harness(),
    id = randomUUID();
  let version = 2;
  const { subscribeLiveJob } = h.load(
      "features/realtime/subscribe-live-job.ts",
    ),
    stop = subscribeLiveJob({
      jobType: "DELIVERY",
      jobId: id,
      afterVersion: () => version,
      onSnapshot: () => {},
      onUnavailable: () => {},
    });
  await flush();
  h.sockets[0].receive("disconnect", "transport close");
  assert.equal(h.timers.size, 1);
  h.setToken("rotated.access.token");
  version = 8;
  await h.nextTimer();
  assert.equal(h.sockets[1].options.auth.accessToken, "rotated.access.token");
  assert.equal(h.sockets[1].options.auth.afterVersion, 8);
  assert.equal(h.sockets[1].options.reconnection, false);
  stop();
  assert.equal(h.timers.size, 0);
});
test("forbidden streams do not create an automatic reconnect loop", async () => {
  const h = harness(),
    { subscribeLiveJob } = h.load("features/realtime/subscribe-live-job.ts"),
    stop = subscribeLiveJob({
      jobType: "DELIVERY",
      jobId: randomUUID(),
      afterVersion: () => 0,
      onSnapshot: () => {},
      onUnavailable: () => {},
    });
  await flush();
  h.sockets[0].receive("live.error", {
    schemaVersion: 1,
    code: "FORBIDDEN",
    retryAfterSeconds: 0,
  });
  assert.equal(h.timers.size, 0);
  stop();
});
test("terminal updates carry no location and close without reconnecting", async () => {
  const h = harness(),
    id = randomUUID(),
    { subscribeLiveJob } = h.load("features/realtime/subscribe-live-job.ts"),
    stop = subscribeLiveJob({
      jobType: "DELIVERY",
      jobId: id,
      afterVersion: () => 2,
      onSnapshot: (v) => h.frames.push(v),
      onUnavailable: () => {},
    });
  await flush();
  h.sockets[0].receive(
    "job.snapshot",
    frame(id, {
      version: 4,
      status: "DELIVERED",
      custody: "WITH_RECIPIENT",
      terminal: true,
      position: null,
    }),
  );
  assert.equal(h.frames.length, 1);
  assert.equal(h.sockets[0].closed, true);
  assert.equal(h.timers.size, 0);
  stop();
});
test("terminal location leakage and invalid coordinate payloads fail runtime validation", () => {
  const { parseLiveSnapshot } = harness().load(
      "features/realtime/live-contract.ts",
    ),
    id = randomUUID();
  assert.throws(() => parseLiveSnapshot(frame(id, { terminal: true })));
  assert.throws(() =>
    parseLiveSnapshot(
      frame(id, {
        position: {
          latitude: Infinity,
          longitude: 9.7,
          receivedAt: new Date().toISOString(),
          stale: false,
        },
      }),
    ),
  );
  const result = parseLiveSnapshot({
    ...frame(id),
    token: "private",
    recipientPhone: "private",
  });
  assert.equal("token" in result, false);
  assert.equal("recipientPhone" in result, false);
});
