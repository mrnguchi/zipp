import {
  ApiFailure,
  InputFailure,
  record,
  request,
  string,
  uuid,
} from "../api/transport";
import { readRefresh, saveRefresh, removeRefresh } from "./credential-store";
type Session = {
  accessToken: string;
  expiresAt: number;
  userId: string;
  phone: string;
  roles: readonly string[];
};
let current: Session | null = null,
  refreshing: Promise<Session> | null = null;
let generation = 0,
  credentialWrites: Promise<void> = Promise.resolve();
function storeChange(change: () => Promise<void>) {
  const next = credentialWrites.then(change, change);
  credentialWrites = next.catch(() => {});
  return next;
}
async function clearLocal() {
  generation++;
  publish(null);
  await storeChange(removeRefresh);
}
const listeners = new Set<() => void>();
export const subscribeSession = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const sessionSnapshot = () => current;
function publish(value: Session | null) {
  current = value;
  listeners.forEach((listener) => listener());
}
async function grant(value: unknown, expectedGeneration = generation) {
  const r = record(value),
    u = record(r.user),
    refresh = string(r.refreshToken, 43),
    access = string(r.accessToken, 4096);
  if (
    !Array.isArray(u.roles) ||
    u.roles.length > 5 ||
    !u.roles.every(
      (v) =>
        typeof v === "string" &&
        ["CUSTOMER", "DRIVER", "SUPPORT", "FINANCE", "ADMIN"].includes(v),
    ) ||
    !/^[A-Za-z0-9_-]{43}$/.test(refresh) ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(access) ||
    typeof r.expiresIn !== "number" ||
    !Number.isInteger(r.expiresIn) ||
    r.expiresIn < 1 ||
    r.expiresIn > 900 ||
    !/^\+[1-9]\d{7,14}$/.test(string(u.phone, 16))
  )
    throw new Error("Invalid authentication response");
  const session = {
    accessToken: access,
    expiresAt: Date.now() + r.expiresIn * 1000,
    userId: uuid(u.id),
    phone: string(u.phone, 16),
    roles: u.roles.filter((v): v is string => typeof v === "string"),
  };
  // Do not let an old refresh/sign-in response restore an account after sign-out or a new login.
  await storeChange(async () => {
    if (generation !== expectedGeneration)
      throw new ApiFailure("UNAUTHENTICATED", 401);
    await saveRefresh(refresh);
    if (generation !== expectedGeneration) {
      await removeRefresh();
      throw new ApiFailure("UNAUTHENTICATED", 401);
    }
  });
  if (generation !== expectedGeneration)
    throw new ApiFailure("UNAUTHENTICATED", 401);
  publish(session);
  return session;
}
async function refreshSession() {
  if (refreshing) return refreshing;
  const expectedGeneration = generation;
  refreshing = (async () => {
    try {
      const refreshToken = await readRefresh();
      if (!refreshToken) throw new ApiFailure("UNAUTHENTICATED", 401);
      return await grant(
        await request("/auth/refresh", {
          method: "POST",
          body: JSON.stringify({ refreshToken }),
        }),
        expectedGeneration,
      );
    } catch (e) {
      if (expectedGeneration === generation) await clearLocal();
      throw e;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}
export async function authenticated(path: string, init: RequestInit = {}) {
  const session =
    current && current.expiresAt > Date.now() + 15000
      ? current
      : await refreshSession();
  const expectedGeneration = generation;
  try {
    const result = await request(path, init, session.accessToken);
    if (expectedGeneration !== generation)
      throw new ApiFailure("UNAUTHENTICATED", 401);
    return result;
  } catch (e) {
    if (
      e instanceof ApiFailure &&
      e.status === 401 &&
      expectedGeneration === generation
    ) {
      await clearLocal();
    }
    throw e;
  }
}
/** Reuses single-flight rotation for socket handshake auth; never encode in a URL. */
export async function currentAccessToken() {
  const session =
    current && current.expiresAt > Date.now() + 15000
      ? current
      : await refreshSession();
  return session.accessToken;
}
export function normalizePhone(input: string) {
  const compact = input.replace(/[\s()-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(compact))
    throw new InputFailure(
      "Use an international phone number such as +237612345678.",
    );
  return compact;
}
export type Challenge = {
  challengeId: string;
  next: "phone_code" | "two_factor";
  phone: string;
  purpose: "signup" | "login";
};
let challenge: Challenge | null = null;
export const pendingChallenge = () => challenge;
export async function beginAuthentication(
  purpose: "signup" | "login",
  phone: string,
  password: string,
  displayName?: string,
) {
  await clearLocal();
  challenge = null;
  const expectedGeneration = generation;
  const normalized = normalizePhone(phone);
  const data = record(
    await request(`/auth/${purpose}`, {
      method: "POST",
      body: JSON.stringify({
        phone: normalized,
        password,
        ...(purpose === "signup" ? { displayName } : {}),
      }),
    }),
  );
  if (!["phone_code", "two_factor"].includes(String(data.next)))
    throw new Error("Invalid authentication challenge");
  if (expectedGeneration !== generation)
    throw new ApiFailure("UNAUTHENTICATED", 401);
  challenge = {
    challengeId: uuid(data.challengeId),
    next: data.next as Challenge["next"],
    phone: normalized,
    purpose,
  };
  return challenge;
}
export async function verifyAuthentication(code: string) {
  if (!challenge) throw new ApiFailure("UNAUTHENTICATED", 401);
  const c = challenge,
    path =
      c.next === "two_factor" ? "/auth/2fa/login" : `/auth/${c.purpose}/verify`,
    body =
      c.next === "two_factor"
        ? { challengeId: c.challengeId, proof: { method: "totp", code } }
        : { challengeId: c.challengeId, code };
  const expectedGeneration = generation;
  const session = await grant(
    await request(path, { method: "POST", body: JSON.stringify(body) }),
    expectedGeneration,
  );
  challenge = null;
  return session;
}
export async function resendAuthentication() {
  if (!challenge || challenge.next === "two_factor")
    throw new ApiFailure("VALIDATION_ERROR", 400);
  const expectedGeneration = generation,
    previousId = challenge.challengeId;
  const data = record(
    await request("/auth/challenges/resend", {
      method: "POST",
      body: JSON.stringify({ challengeId: challenge.challengeId }),
    }),
  );
  if (
    expectedGeneration !== generation ||
    challenge?.challengeId !== previousId
  )
    throw new ApiFailure("UNAUTHENTICATED", 401);
  challenge = { ...challenge, challengeId: uuid(data.challengeId) };
}
export async function signOut() {
  try {
    if (current)
      await authenticated("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ allSessions: false }),
      });
  } finally {
    await clearLocal();
    challenge = null;
  }
}
