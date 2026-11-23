// Written source only. Native crypto/storage/device behavior needs separate execution evidence.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const ts = require("typescript");
function modules(
  fetchImpl = async () => {
    throw Error("Unexpected request");
  },
  extra = {},
) {
  const cache = new Map();
  function load(relative) {
    const file = path.resolve(__dirname, "../src", relative),
      exported = {};
    if (cache.has(file)) return cache.get(file);
    cache.set(file, exported);
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText;
    vm.runInNewContext(code, {
      exports: exported,
      require: (name) => {
        if (name in extra) return extra[name];
        if (name === "expo-crypto")
          return {
            getRandomBytesAsync: async (length) =>
              new Uint8Array(crypto.randomBytes(length)),
          };
        return load(
          path.relative(
            path.resolve(__dirname, "../src"),
            path.resolve(path.dirname(file), `${name}.ts`),
          ),
        );
      },
      fetch: fetchImpl,
      Headers,
      URL,
      AbortController,
      setTimeout,
      clearTimeout,
      process: {
        env: { EXPO_PUBLIC_API_URL: "https://api.example.invalid/api/v1" },
      },
      __DEV__: false,
    });
    return exported;
  }
  return load;
}
test("tracking credentials contain a UUID v4 and canonical 256-bit secret from async crypto", async () => {
  const { trackingCredential } = modules()("features/deliveries/crypto.ts");
  const a = await trackingCredential(),
    b = await trackingCredential();
  assert.match(
    a.id,
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
  );
  assert.equal(Buffer.from(a.secret, "base64url").length, 32);
  assert.equal(
    Buffer.from(a.secret, "base64url").toString("base64url"),
    a.secret,
  );
  assert.notEqual(a.secret, b.secret);
});
const snapshot = () => ({
  id: crypto.randomUUID(),
  status: "IN_TRANSIT",
  custody: "WITH_COURIER",
  version: 4,
  viewerRole: "BOOKER",
  perspective: "SENDING",
  serviceClass: "DELIVERY_STANDARD",
  sender: { name: "Sender", phone: "+237612345678", roles: ["CUSTOMER"] },
  recipient: { name: "Recipient", phone: "+237698765432" },
  package: {
    description: "Documents",
    size: "SMALL",
    weightGrams: 500,
    photoId: crypto.randomUUID(),
  },
  pickup: { latitude: 4.05, longitude: 9.7 },
  destination: { latitude: 4.06, longitude: 9.72 },
  cancellationFeeXaf: "500",
  quotedAmountXaf: "1450",
  chargedAmountXaf: "0",
  refundedAmountXaf: "0",
  createdAt: new Date().toISOString(),
  completedAt: null,
});
test("remote delivery boundaries preserve money strings and discard private internal fields", () => {
  const { snapshot: parse } = modules()("features/deliveries/contracts.ts");
  const result = parse({
    ...snapshot(),
    completionPinHash: "private",
    secret: "private",
    reservationId: "private",
  });
  assert.equal(result.quotedAmountXaf, "1450");
  assert.equal("completionPinHash" in result, false);
  assert.equal("secret" in result, false);
  assert.equal("reservationId" in result, false);
  assert.throws(() => parse({ ...snapshot(), status: "FAKE_COMPLETE" }));
  assert.throws(() => parse({ ...snapshot(), quotedAmountXaf: 1450 }));
  assert.throws(() =>
    parse({ ...snapshot(), destination: { latitude: NaN, longitude: 0 } }),
  );
});
test("custody and terminal policies keep collected and returning deliveries uncancellable", () => {
  const { preCollection, terminal } = modules()(
    "features/deliveries/contracts.ts",
  );
  assert.equal(preCollection("AT_PICKUP"), true);
  for (const state of ["COLLECTED", "IN_TRANSIT", "RETURNING", "AT_RETURN"]) {
    assert.equal(preCollection(state), false);
    assert.equal(terminal(state), false);
  }
  for (const state of ["DELIVERED", "RETURNED", "CANCELLED", "NO_COURIER"])
    assert.equal(terminal(state), true);
});
test("HTTP failures keep stable codes and Retry-After without exposing server internals", async () => {
  const load = modules(async () => ({
    ok: false,
    status: 429,
    headers: new Headers({ "Retry-After": "60" }),
    json: async () => ({
      code: "RATE_LIMITED",
      message: "postgresql://private-password@private-host",
    }),
  }));
  const { request, ApiFailure } = load("features/api/transport.ts");
  await assert.rejects(
    request("/deliveries"),
    (error) =>
      error instanceof ApiFailure &&
      error.status === 429 &&
      error.retryAfter === 60 &&
      !error.message.includes("private-password"),
  );
});
test("a lost mutation response is not automatically submitted a second time", async () => {
  let calls = 0;
  const { request } = modules(async () => {
    calls++;
    throw Error("connection lost after commit");
  })("features/api/transport.ts");
  await assert.rejects(
    request("/deliveries", {
      method: "POST",
      body: JSON.stringify({ quoteId: crypto.randomUUID() }),
    }),
  );
  assert.equal(calls, 1);
});
test("simultaneous authenticated reads share one refresh rotation", async () => {
  let rotations = 0,
    stored = "r".repeat(43);
  const storage = {
    readRefresh: async () => stored,
    saveRefresh: async (value) => {
      stored = value;
    },
    removeRefresh: async () => {
      stored = null;
    },
  };
  const load = modules(
    async (url, init) => {
      if (url.endsWith("/auth/refresh")) {
        rotations++;
        await new Promise((resolve) => setTimeout(resolve, 1));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            accessToken: "access.token.value",
            refreshToken: "s".repeat(43),
            expiresIn: 600,
            user: {
              id: crypto.randomUUID(),
              phone: "+237612345678",
              roles: ["CUSTOMER"],
            },
          }),
        };
      }
      assert.equal(
        init.headers.get("Authorization"),
        "Bearer access.token.value",
      );
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: "available" }),
      };
    },
    { "./credential-store": storage },
  );
  const { authenticated } = load("features/identity/session.ts");
  await Promise.all([
    authenticated("/wallet"),
    authenticated("/deliveries/active"),
  ]);
  assert.equal(rotations, 1);
  assert.equal(stored, "s".repeat(43));
});
test("an ambiguous refresh response clears local credentials instead of replaying the old token", async () => {
  let rotations = 0,
    stored = "r".repeat(43);
  const load = modules(
    async () => {
      rotations++;
      throw Error("lost refresh response");
    },
    {
      "./credential-store": {
        readRefresh: async () => stored,
        saveRefresh: async (value) => {
          stored = value;
        },
        removeRefresh: async () => {
          stored = null;
        },
      },
    },
  );
  const { authenticated, sessionSnapshot } = load(
    "features/identity/session.ts",
  );
  await assert.rejects(authenticated("/wallet"));
  assert.equal(rotations, 1);
  assert.equal(stored, null);
  assert.equal(sessionSnapshot(), null);
});
test("a delayed refresh response cannot restore a signed-out account", async () => {
  let stored = "r".repeat(43),
    release,
    started;
  const reached = new Promise((resolve) => {
    started = resolve;
  });
  const load = modules(
    async () => {
      started();
      await new Promise((resolve) => {
        release = resolve;
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          accessToken: "old.access.token",
          refreshToken: "s".repeat(43),
          expiresIn: 600,
          user: {
            id: crypto.randomUUID(),
            phone: "+237612345678",
            roles: ["CUSTOMER"],
          },
        }),
      };
    },
    {
      "./credential-store": {
        readRefresh: async () => stored,
        saveRefresh: async (value) => {
          stored = value;
        },
        removeRefresh: async () => {
          stored = null;
        },
      },
    },
  );
  const { authenticated, signOut, sessionSnapshot } = load(
    "features/identity/session.ts",
  );
  const pending = authenticated("/wallet");
  await reached;
  await signOut();
  release();
  await assert.rejects(pending);
  assert.equal(stored, null);
  assert.equal(sessionSnapshot(), null);
});
