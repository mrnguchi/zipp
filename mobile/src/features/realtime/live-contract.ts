import { date, record, string, uuid } from "../api/transport";
export interface LiveJobSnapshot {
  schemaVersion: 1;
  type: "job.snapshot";
  jobType: "RIDE" | "DELIVERY";
  jobId: string;
  version: number;
  status: string;
  terminal: boolean;
  position: {
    latitude: number;
    longitude: number;
    receivedAt: string;
    stale: boolean;
  } | null;
  resyncRequired: boolean;
  observedAt: string;
}
const states = [
  "SEARCHING",
  "ASSIGNED",
  "ARRIVED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_DRIVER",
  "AT_PICKUP",
  "COLLECTED",
  "IN_TRANSIT",
  "AT_DESTINATION",
  "RETURNING",
  "AT_RETURN",
  "DELIVERED",
  "RETURNED",
  "NO_COURIER",
];
/** Rebuild the minimal view; no remote credentials/contacts/money reach the map or cache. */
export function parseLiveSnapshot(value: unknown): LiveJobSnapshot {
  const r = record(value);
  if (
    r.schemaVersion !== 1 ||
    r.type !== "job.snapshot" ||
    !["RIDE", "DELIVERY"].includes(String(r.jobType)) ||
    typeof r.version !== "number" ||
    !Number.isInteger(r.version) ||
    r.version < 1 ||
    r.version > 2147483647 ||
    typeof r.terminal !== "boolean" ||
    typeof r.resyncRequired !== "boolean" ||
    !states.includes(String(r.status))
  )
    throw new Error("Invalid live snapshot");
  let position: LiveJobSnapshot["position"] = null;
  if (r.position !== null) {
    const p = record(r.position);
    if (
      typeof p.latitude !== "number" ||
      !Number.isFinite(p.latitude) ||
      Math.abs(p.latitude) > 90 ||
      typeof p.longitude !== "number" ||
      !Number.isFinite(p.longitude) ||
      Math.abs(p.longitude) > 180 ||
      typeof p.stale !== "boolean"
    )
      throw new Error("Invalid live position");
    position = {
      latitude: p.latitude,
      longitude: p.longitude,
      receivedAt: date(p.receivedAt),
      stale: p.stale,
    };
  }
  if (r.terminal && position)
    throw new Error("Terminal live snapshot cannot carry location");
  return {
    schemaVersion: 1,
    type: "job.snapshot",
    jobType: r.jobType as "RIDE" | "DELIVERY",
    jobId: uuid(r.jobId),
    version: r.version,
    status: string(r.status, 30),
    terminal: r.terminal,
    position,
    resyncRequired: r.resyncRequired,
    observedAt: date(r.observedAt),
  };
}
