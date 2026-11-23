import { requireApiBaseUrl } from "../../config/environment";
export class ApiFailure extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly retryAfter: number | null = null,
  ) {
    super(
      messages[code] ??
        (status === 401
          ? "Sign in to continue."
          : status === 403
            ? "You do not have permission for this action."
            : status === 429
              ? "Too many requests. Please wait before trying again."
              : status === 503
                ? "This service is not available yet. Please try later."
                : "The request could not be completed. Refresh the status before retrying."),
    );
  }
}
/** Only deliberately authored local validation text may bypass the safe remote error map. */
export class InputFailure extends Error {}
const messages: Record<string, string> = {
  ROUTE_NOT_AVAILABLE: "Delivery quotes are not available for this route yet.",
  NETWORK_UNAVAILABLE:
    "Connection lost. Check your network, refresh the status, then retry the same action.",
  INSUFFICIENT_FUNDS: "Your wallet does not cover this delivery.",
  QUOTE_EXPIRED: "This quote expired. Review a new quote before booking.",
  VALIDATION_ERROR: "Check the entered details and try again.",
  DELIVERY_CUSTODY_REQUIRES_REVIEW:
    "The package is with the courier. Open a support issue to arrange a return.",
  DELIVERIES_NOT_CONFIGURED: "Delivery booking is not enabled on this server.",
  DELIVERY_MEDIA_NOT_CONFIGURED:
    "Package photo uploads are not enabled on this server.",
  ROUTE_UNAVAILABLE:
    "This route is not available from the configured routing provider.",
  IDEMPOTENCY_CONFLICT:
    "This request identity has different details. Refresh the existing delivery.",
  UNAUTHENTICATED: "Sign in to continue.",
};
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid server response");
  return value as Record<string, unknown>;
}
export function string(value: unknown, max = 4096): string {
  if (typeof value !== "string" || value.length > max)
    throw new Error("Invalid server response");
  return value;
}
export const uuid = (v: unknown) => {
  const id = string(v, 36);
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      id,
    )
  )
    throw new Error("Invalid server identity");
  return id.toLowerCase();
};
export const money = (v: unknown) => {
  const value = string(v, 16);
  if (!/^[0-9]+$/.test(value)) throw new Error("Invalid server amount");
  return value;
};
export const date = (v: unknown) => {
  const value = string(v, 40);
  if (!Number.isFinite(Date.parse(value)))
    throw new Error("Invalid server date");
  return value;
};
/** No automatic mutation retries. Callers retain their original request identity/body. */
export async function request(
  path: string,
  init: RequestInit = {},
  bearer?: string,
): Promise<unknown> {
  if (!path.startsWith("/") || path.includes("://"))
    throw new Error("Invalid API path");
  const base = requireApiBaseUrl(),
    controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000),
    abort = () => controller.abort();
  init.signal?.addEventListener("abort", abort, { once: true });
  if (init.signal?.aborted) controller.abort();
  try {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body && typeof init.body === "string")
      headers.set("Content-Type", "application/json");
    if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
      credentials: "omit",
    });
    const data: unknown =
      response.status === 204 ? null : await response.json();
    if (!response.ok) {
      let code = "REQUEST_FAILED";
      if (
        data &&
        typeof data === "object" &&
        "code" in data &&
        typeof data.code === "string" &&
        /^[A-Z_]{1,80}$/.test(data.code)
      )
        code = data.code;
      const raw = response.headers.get("Retry-After");
      throw new ApiFailure(
        code,
        response.status,
        raw && /^\d+$/.test(raw) ? Math.min(3600, Number(raw)) : null,
      );
    }
    return data;
  } catch (e) {
    if (e instanceof ApiFailure) throw e;
    throw new ApiFailure("NETWORK_UNAVAILABLE", 0);
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", abort);
  }
}
export const errorMessage = (e: unknown) =>
  e instanceof ApiFailure || e instanceof InputFailure
    ? e.message
    : "Unable to load valid delivery data. Please refresh and try again.";
