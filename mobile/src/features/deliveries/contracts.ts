import { date, money, record, string, uuid } from "../api/transport";
export const deliveryStates = [
  "SEARCHING",
  "ASSIGNED",
  "AT_PICKUP",
  "COLLECTED",
  "IN_TRANSIT",
  "AT_DESTINATION",
  "RETURNING",
  "AT_RETURN",
  "DELIVERED",
  "RETURNED",
  "CANCELLED",
  "NO_COURIER",
] as const;
export type DeliveryState = (typeof deliveryStates)[number];
export type Point = { latitude: number; longitude: number };
export type DeliverySnapshot = {
  id: string;
  status: DeliveryState;
  custody: string;
  version: number;
  viewerRole: "BOOKER" | "SENDER" | "RECIPIENT" | "COURIER";
  perspective: "SENDING" | "RECEIVING";
  serviceClass: "DELIVERY_STANDARD" | "DELIVERY_EXPRESS";
  sender: { name: string; phone: string | null };
  recipient: { name: string; phone: string | null };
  package: {
    description: string;
    size: "SMALL" | "MEDIUM" | "LARGE";
    weightGrams: number;
    photoId: string | null;
  };
  pickup: Point;
  destination: Point;
  cancellationFeeXaf?: string;
  quotedAmountXaf?: string;
  chargedAmountXaf?: string;
  refundedAmountXaf?: string;
  createdAt: string;
  completedAt: string | null;
};
function member<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T))
    throw new Error("Invalid delivery state");
  return value as T;
}
function integer(value: unknown, min: number, max: number) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    throw new Error("Invalid server quantity");
  return value;
}
export function point(value: unknown): Point {
  const p = record(value);
  if (
    typeof p.latitude !== "number" ||
    !Number.isFinite(p.latitude) ||
    Math.abs(p.latitude) > 90 ||
    typeof p.longitude !== "number" ||
    !Number.isFinite(p.longitude) ||
    Math.abs(p.longitude) > 180
  )
    throw new Error("Invalid server position");
  return { latitude: p.latitude, longitude: p.longitude };
}
function contact(value: unknown) {
  const c = record(value);
  return {
    name: string(c.name, 100),
    phone: c.phone === null ? null : string(c.phone, 16),
  };
}
export function snapshot(value: unknown): DeliverySnapshot {
  const d = record(value),
    p = record(d.package);
  return {
    id: uuid(d.id),
    status: member(d.status, deliveryStates),
    custody: member(d.custody, [
      "WITH_SENDER",
      "WITH_COURIER",
      "WITH_RECIPIENT",
      "RETURNED_TO_SENDER",
    ]),
    version: integer(d.version, 1, 2147483647),
    viewerRole: member(d.viewerRole, [
      "BOOKER",
      "SENDER",
      "RECIPIENT",
      "COURIER",
    ]),
    perspective: member(d.perspective, ["SENDING", "RECEIVING"]),
    serviceClass: member(d.serviceClass, [
      "DELIVERY_STANDARD",
      "DELIVERY_EXPRESS",
    ]),
    sender: contact(d.sender),
    recipient: contact(d.recipient),
    package: {
      description: string(p.description, 300),
      size: member(p.size, ["SMALL", "MEDIUM", "LARGE"]),
      weightGrams: integer(p.weightGrams, 1, 20000),
      photoId: p.photoId === null ? null : uuid(p.photoId),
    },
    pickup: point(d.pickup),
    destination: point(d.destination),
    ...(d.quotedAmountXaf !== undefined
      ? {
          cancellationFeeXaf: money(d.cancellationFeeXaf),
          quotedAmountXaf: money(d.quotedAmountXaf),
          chargedAmountXaf: money(d.chargedAmountXaf),
          refundedAmountXaf: money(d.refundedAmountXaf),
        }
      : {}),
    createdAt: date(d.createdAt),
    completedAt: d.completedAt === null ? null : date(d.completedAt),
  };
}
export function deliveryPage(value: unknown) {
  const p = record(value);
  if (!Array.isArray(p.items) || p.items.length > 50)
    throw new Error("Invalid server page");
  return p.items.map(snapshot);
}
export type ServerQuote = {
  id: string;
  totalAmountXaf: string;
  expiresAt: string;
  distanceMeters: number;
  durationSeconds: number;
};
export function quote(value: unknown): ServerQuote {
  const q = record(value);
  return {
    id: uuid(q.id),
    totalAmountXaf: money(q.totalAmountXaf),
    expiresAt: date(q.expiresAt),
    distanceMeters: integer(q.distanceMeters, 1, 200000),
    durationSeconds: integer(q.durationSeconds, 1, 43200),
  };
}
export const terminal = (s: DeliveryState) =>
  ["DELIVERED", "RETURNED", "CANCELLED", "NO_COURIER"].includes(s);
export const preCollection = (s: DeliveryState) =>
  ["SEARCHING", "ASSIGNED", "AT_PICKUP"].includes(s);
export type Tracking = {
  status: DeliveryState;
  position: (Point & { receivedAt: string; stale: boolean }) | null;
};
export function tracking(value: unknown): Tracking {
  const v = record(value),
    p = v.position === null ? null : record(v.position);
  return {
    status: member(v.status, deliveryStates),
    position: p
      ? { ...point(p), receivedAt: date(p.receivedAt), stale: p.stale === true }
      : null,
  };
}
