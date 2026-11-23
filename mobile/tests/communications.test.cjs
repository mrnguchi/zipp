// Written, not run. Pure contracts and transport/storage doubles; no native UI,
// server security, real SecureStore, background or provider acceptance evidence.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { randomUUID, createHash } = require("node:crypto");
function harness() {
  const storage = new Map(),
    requests = [],
    user = randomUUID();
  let currentUser = user,
    response = null,
    failure = null;
  class ApiFailure extends Error {
    constructor(code, status) {
      super(code);
      this.code = code;
      this.status = status;
    }
  }
  class InputFailure extends Error {}
  const boundary = {
    ApiFailure,
    InputFailure,
    record: (v) => {
      if (!v || typeof v !== "object" || Array.isArray(v))
        throw new Error("record");
      return v;
    },
    string: (v, max = 4096) => {
      if (typeof v !== "string" || v.length > max) throw new Error("string");
      return v;
    },
    uuid: (v) => {
      if (typeof v !== "string" || !/^[-a-f0-9]{36}$/i.test(v))
        throw new Error("uuid");
      return v.toLowerCase();
    },
    date: (v) => {
      if (!Number.isFinite(Date.parse(v))) throw new Error("date");
      return v;
    },
  };
  const cache = new Map();
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const exports = {};
    cache.set(name, exports);
    const source = fs.readFileSync(
      path.resolve(__dirname, "../src/features/communications", name + ".ts"),
      "utf8",
    );
    vm.runInNewContext(
      ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
      }).outputText,
      {
        exports,
        TextEncoder,
        require: (p) => {
          if (p === "../api/transport") return boundary;
          if (p === "../../config/environment")
            return {
              environment: {
                communicationsEnabled: true,
                notificationInboxEnabled: true,
              },
            };
          if (p === "../identity/session")
            return {
              sessionSnapshot: () => ({ userId: currentUser }),
              authenticated: async (url, init) => {
                requests.push({ url, init });
                if (failure) throw failure;
                return response;
              },
            };
          if (p === "expo-crypto")
            return {
              randomUUID,
              CryptoDigestAlgorithm: { SHA256: "sha256" },
              digestStringAsync: async (_, v) =>
                createHash("sha256").update(v).digest("hex"),
            };
          if (p === "./pending-store")
            return {
              readPending: async (u) => storage.get(u) ?? null,
              writePending: async (u, v) => storage.set(u, v),
              removePending: async (u) => storage.delete(u),
            };
          if (p === "./contracts") return load("contracts");
          throw new Error("Unexpected dependency " + p);
        },
      },
    );
    return exports;
  }
  return {
    api: load("api"),
    contracts: load("contracts"),
    storage,
    requests,
    user,
    ApiFailure,
    setResponse: (v) => (response = v),
    setFailure: (v) => (failure = v),
    setUser: (v) => (currentUser = v),
  };
}
test("ambiguous send reuses its original identity without persisting message text", async () => {
  const h = harness(),
    id = randomUUID();
  h.setFailure(new h.ApiFailure("NETWORK_UNAVAILABLE", 0));
  await assert.rejects(h.api.send(id, "Private message"));
  const oldKey = h.requests[0].init.headers["Idempotency-Key"];
  assert.equal(h.storage.size, 1);
  assert.ok(![...h.storage.values()][0].includes("Private message"));
  await assert.rejects(h.api.send(id, "Changed message"), /unresolved/);
  assert.equal(h.requests.length, 1);
  h.setFailure(null);
  h.setResponse({
    threadId: id,
    messageId: randomUUID(),
    sequence: 1,
    version: 2,
  });
  await h.api.send(id, "Private message");
  assert.equal(h.requests[1].init.headers["Idempotency-Key"], oldKey);
  assert.equal(h.storage.size, 0);
});
test("account changes never reuse another account pending request", async () => {
  const h = harness(),
    id = randomUUID();
  h.setFailure(new h.ApiFailure("NETWORK_UNAVAILABLE", 0));
  await assert.rejects(h.api.send(id, "First account message"));
  const key = h.requests[0].init.headers["Idempotency-Key"];
  h.setUser(randomUUID());
  await assert.rejects(h.api.send(id, "Second account message"));
  assert.notEqual(h.requests[1].init.headers["Idempotency-Key"], key);
  assert.equal(h.storage.size, 2);
});
test("an inaccessible pending job does not block contacting support", async () => {
  const h = harness();
  h.setFailure(new h.ApiFailure("FORBIDDEN", 403));
  await assert.rejects(h.api.send(randomUUID(), "A pending job message"));
  h.setFailure(null);
  const id = randomUUID();
  h.setResponse({
    threadId: id,
    messageId: randomUUID(),
    sequence: 1,
    version: 1,
  });
  const result = await h.api.createTicket(
    "Help with job",
    "I cannot access the earlier conversation.",
  );
  assert.equal(result.threadId, id);
  assert.equal(h.storage.size, 1);
});
test("history rejects another thread, oversized pages and noncontiguous sequences", () => {
  const h = harness(),
    id = randomUUID(),
    thread = {
      id,
      kind: "JOB",
      subject: null,
      status: "OPEN",
      writable: true,
      version: 4,
      lastSequence: 4,
    },
    message = (n) => ({
      id: randomUUID(),
      sequence: n,
      authorUserId: randomUUID(),
      body: "Text",
      createdAt: new Date().toISOString(),
    });
  assert.throws(() =>
    h.contracts.history(
      { thread, items: [message(1)], nextAfter: null, readSequence: 0 },
      randomUUID(),
    ),
  );
  assert.throws(() =>
    h.contracts.history(
      {
        thread,
        items: [message(1), message(3)],
        nextAfter: null,
        readSequence: 0,
      },
      id,
    ),
  );
  assert.throws(() =>
    h.contracts.history(
      {
        thread,
        items: Array.from({ length: 51 }, (_, n) => message(n + 1)),
        nextAfter: null,
        readSequence: 0,
      },
      id,
    ),
  );
  assert.equal(
    h.contracts.history(
      {
        thread,
        items: [message(1), message(2)],
        nextAfter: 2,
        readSequence: 0,
      },
      id,
    ).items.length,
    2,
  );
});
test("private inbox rejects injected content and does not invent a deep link", async () => {
  const h = harness();
  h.setResponse({
    items: [
      {
        id: randomUUID(),
        type: "ACTIVITY",
        text: "Injected private job data",
        createdAt: new Date().toISOString(),
        readAt: null,
      },
    ],
    nextCursor: null,
  });
  await assert.rejects(h.api.inbox());
});
