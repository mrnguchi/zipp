import { record, string, uuid, date } from "../api/transport";
export interface Thread {
  id: string;
  kind: "JOB" | "SUPPORT";
  subject: string | null;
  status: "OPEN" | "RESOLVED";
  writable: boolean;
  version: number;
  lastSequence: number;
}
export interface Message {
  id: string;
  sequence: number;
  authorUserId: string;
  body: string;
  createdAt: string;
}
export function integer(v: unknown, min = 0, max = 2000) {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max)
    throw new Error("Invalid server number");
  return v;
}
export function thread(value: unknown): Thread {
  const r = record(value);
  if (
    !["JOB", "SUPPORT"].includes(String(r.kind)) ||
    !["OPEN", "RESOLVED"].includes(String(r.status)) ||
    typeof r.writable !== "boolean"
  )
    throw new Error("Invalid conversation");
  return {
    id: uuid(r.id),
    kind: r.kind as Thread["kind"],
    subject: r.subject === null ? null : string(r.subject, 120),
    status: r.status as Thread["status"],
    writable: r.writable,
    version: integer(r.version, 1, 1000000),
    lastSequence: integer(r.lastSequence),
  };
}
export function receipt(value: unknown) {
  const r = record(value);
  return {
    threadId: uuid(r.threadId),
    messageId: r.messageId === null ? null : uuid(r.messageId),
    sequence: r.sequence === null ? null : integer(r.sequence, 1),
    version: integer(r.version, 1, 1000000),
  };
}
export function history(value: unknown, expectedId: string) {
  const r = record(value),
    t = thread(r.thread);
  if (t.id !== expectedId || !Array.isArray(r.items) || r.items.length > 50)
    throw new Error("Invalid conversation page");
  const items: Message[] = r.items.map((v) => {
    const m = record(v);
    return {
      id: uuid(m.id),
      sequence: integer(m.sequence, 1),
      authorUserId: uuid(m.authorUserId),
      body: string(m.body, 2000),
      createdAt: date(m.createdAt),
    };
  });
  if (
    items.some(
      (m, i) =>
        m.sequence > t.lastSequence ||
        (i > 0 && m.sequence !== items[i - 1].sequence + 1),
    )
  )
    throw new Error("Invalid message order");
  const nextAfter = r.nextAfter === null ? null : integer(r.nextAfter, 1),
    readSequence = integer(r.readSequence);
  if (
    readSequence > t.lastSequence ||
    (nextAfter !== null && nextAfter !== items.at(-1)?.sequence)
  )
    throw new Error("Invalid history cursor");
  return {
    thread: t,
    items,
    nextAfter,
    readSequence,
  };
}
export function plainText(value: string, min = 1, max = 2000) {
  const text = value.trim();
  if (
    text.length < min ||
    text.length > max ||
    new TextEncoder().encode(text).length > 8000 ||
    !/^(?:[^\p{Cc}]|[\t\n\r])*$/u.test(text)
  )
    throw new Error(
      "Check the message length and remove unsupported characters.",
    );
  return text;
}
