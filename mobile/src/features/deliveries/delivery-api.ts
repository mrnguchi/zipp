import { InputFailure } from "../api/transport";
import { digest, CryptoDigestAlgorithm } from "expo-crypto";
import { authenticated, normalizePhone } from "../identity/session";
import { date, money, record, request, uuid } from "../api/transport";
import { deliveryPage, point, quote, snapshot, tracking } from "./contracts";
import type { DeliveryDraft } from "../../services/deliveryFlow";
import { readPhoto } from "./photo-bytes";
import { requestId } from "./crypto";
export const activeDeliveries = async () =>
  deliveryPage(await authenticated("/deliveries/active"));
export const deliveryHistory = async () =>
  deliveryPage(await authenticated("/deliveries?limit=50"));
export const getDelivery = async (id: string, signal?: AbortSignal) =>
  snapshot(await authenticated(`/deliveries/${uuid(id)}`, { signal }));
export const getTracking = async (id: string, signal?: AbortSignal) =>
  tracking(await authenticated(`/deliveries/${uuid(id)}/tracking`, { signal }));
export const getWallet = async () => {
  const b = record(await authenticated("/wallet"));
  return money(b.availableAmountXaf);
};
export async function getQuote(draft: DeliveryDraft) {
  if (!draft.pickup || !draft.dropoff)
    throw new InputFailure("Choose both locations");
  const value = await authenticated("/pricing/service-areas");
  const root = record(value),
    rows = root.items;
  if (!Array.isArray(rows) || rows.length > 50)
    throw new Error("Invalid service area response");
  let id: string | undefined;
  for (const value of rows) {
    const a = record(value),
      points = [draft.pickup.coordinate, draft.dropoff.coordinate];
    if (
      [
        a.minimumLatitude,
        a.maximumLatitude,
        a.minimumLongitude,
        a.maximumLongitude,
      ].every((v) => typeof v === "number" && Number.isFinite(v)) &&
      points.every(
        (p) =>
          p.latitude >= Number(a.minimumLatitude) &&
          p.latitude <= Number(a.maximumLatitude) &&
          p.longitude >= Number(a.minimumLongitude) &&
          p.longitude <= Number(a.maximumLongitude),
      )
    ) {
      id = uuid(a.id);
      break;
    }
  }
  if (!id)
    throw new InputFailure(
      "Both locations must be in an available delivery area",
    );
  return quote(
    await authenticated("/pricing/quotes", {
      method: "POST",
      headers: { "Idempotency-Key": await requestId() },
      body: JSON.stringify({
        serviceAreaId: id,
        serviceClass:
          draft.mode === "express" ? "DELIVERY_EXPRESS" : "DELIVERY_STANDARD",
        pickup: draft.pickup.coordinate,
        destination: draft.dropoff.coordinate,
      }),
    }),
  );
}
export async function uploadPhoto(draft: DeliveryDraft) {
  if (!draft.photo) throw new InputFailure("Add a package photo");
  const bytes = await readPhoto(draft.photo.uri),
    png =
      bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71,
    jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!png && !jpeg) throw new InputFailure("Choose a JPEG or PNG photo");
  const hash = Array.from(
      new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, bytes)),
      (b) => b.toString(16).padStart(2, "0"),
    ).join(""),
    intent = record(
      await authenticated("/delivery-photos", {
        method: "POST",
        body: JSON.stringify({
          contentType: png ? "image/png" : "image/jpeg",
          byteLength: bytes.length,
          contentSha256: hash,
        }),
      }),
    ),
    id = uuid(intent.id);
  await authenticated(`/delivery-photos/${id}/content`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes.length),
    },
    body: new Uint8Array(bytes).buffer,
  });
  return id;
}
export function bookingInput(
  draft: DeliveryDraft,
  quoteId: string,
  photoId: string,
) {
  return {
    quoteId,
    perspective: draft.perspective === "sending" ? "SENDING" : "RECEIVING",
    sender: {
      name: draft.senderName.trim(),
      phone: normalizePhone(draft.senderPhone),
    },
    recipient: {
      name: draft.recipientName.trim(),
      phone: normalizePhone(draft.recipientPhone),
    },
    package: {
      description: draft.description.trim(),
      size: draft.size.toUpperCase(),
      weightGrams: draft.weightGrams,
      photoId,
    },
    contactSharingConsent: true,
    acceptTerms: true,
  };
}
export const bookDelivery = async (
  key: string,
  body: ReturnType<typeof bookingInput>,
) =>
  snapshot(
    await authenticated("/deliveries", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(body),
    }),
  );
export const action = async (
  id: string,
  path: string,
  key: string,
  body: unknown,
) =>
  snapshot(
    await authenticated(
      path.startsWith("courier:")
        ? `/courier/deliveries/${uuid(id)}/${path.slice(8)}`
        : `/deliveries/${uuid(id)}/${path}`,
      {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify(body),
      },
    ),
  );
export async function requestCode(
  id: string,
  purpose: "PICKUP" | "HANDOVER" | "RETURN",
) {
  const r = record(
    await authenticated(`/deliveries/${uuid(id)}/contact-codes`, {
      method: "POST",
      body: JSON.stringify({ purpose }),
    }),
  );
  return { requestId: uuid(r.requestId), expiresAt: date(r.expiresAt) };
}
export async function issueCapability(
  id: string,
  input: { id: string; secret: string; ttlSeconds: number },
) {
  const r = record(
    await authenticated(`/deliveries/${uuid(id)}/tracking-capabilities`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
  return {
    id: uuid(r.id),
    expiresAt: date(r.expiresAt),
    revokedAt: r.revokedAt === null ? null : date(r.revokedAt),
  };
}
export async function capabilities(id: string) {
  const r = record(
    await authenticated(`/deliveries/${uuid(id)}/tracking-capabilities`),
  );
  if (!Array.isArray(r.items) || r.items.length > 20)
    throw new Error("Invalid capability list");
  return r.items.map((v) => {
    const c = record(v);
    return {
      id: uuid(c.id),
      expiresAt: date(c.expiresAt),
      revokedAt: c.revokedAt === null ? null : date(c.revokedAt),
    };
  });
}
export const revokeCapability = (id: string, capId: string) =>
  authenticated(
    `/deliveries/${uuid(id)}/tracking-capabilities/${uuid(capId)}`,
    { method: "DELETE" },
  );
export async function publicTracking(token: string) {
  if (!/^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(token))
    throw new InputFailure("Paste a valid tracking credential");
  const r = record(await request("/delivery-tracking", {}, token));
  return {
    status: String(r.status),
    position: r.position === null ? null : point(r.position),
  };
}
export async function receipt(id: string) {
  const r = record(await authenticated(`/deliveries/${uuid(id)}/receipt`));
  return {
    chargedAmountXaf: money(r.chargedAmountXaf),
    refundedAmountXaf: money(r.refundedAmountXaf),
    netAmountXaf: money(r.netAmountXaf),
    rating: r.rating === null ? null : record(r.rating),
  };
}
export async function courierOffers() {
  const r = record(await authenticated("/courier/deliveries/offers"));
  if (!Array.isArray(r.items) || r.items.length > 30)
    throw new Error("Invalid delivery offers");
  return r.items.map((value) => {
    const o = record(value);
    return {
      id: uuid(o.id),
      deliveryId: uuid(o.deliveryId),
      expiresAt: date(o.expiresAt),
      pickup: point(o.pickup),
      quotedAmountXaf: money(o.quotedAmountXaf),
    };
  });
}
export async function respondToOffer(id: string, key: string, accept: boolean) {
  const r = record(
    await authenticated(
      `/courier/deliveries/offers/${uuid(id)}/${accept ? "accept" : "decline"}`,
      { method: "POST", headers: { "Idempotency-Key": key } },
    ),
  );
  return { deliveryId: uuid(r.deliveryId), status: r.status };
}
