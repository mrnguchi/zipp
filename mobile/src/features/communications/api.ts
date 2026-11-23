import {
  digestStringAsync,
  CryptoDigestAlgorithm,
  randomUUID,
} from "expo-crypto";
import { authenticated, sessionSnapshot } from "../identity/session";
import {
  ApiFailure,
  InputFailure,
  record,
  uuid,
  date,
  string,
} from "../api/transport";
import { environment } from "../../config/environment";
import { readPending, writePending, removePending } from "./pending-store";
import { thread, receipt, history, integer } from "./contracts";
function enabled() {
  if (!environment.communicationsEnabled)
    throw new InputFailure("Messages are not available yet.");
}
export const definitiveRejections = [
  "TICKET_LIMIT",
  "CONVERSATION_READ_ONLY",
  "MESSAGE_LIMIT",
  "VERSION_LIMIT",
];
export const ambiguousWrite = (e: unknown) =>
  !(e instanceof InputFailure) &&
  !(e instanceof ApiFailure && definitiveRejections.includes(e.code));
let writing = false;
/** Persist only key/salted input digest/path, never message text. An ambiguous
 * command keeps its identity across native restarts; reenter the same details. */
async function command(path: string, body: unknown, expectedThread?: string) {
  enabled();
  const user = sessionSnapshot()?.userId;
  if (!user) throw new ApiFailure("UNAUTHENTICATED", 401);
  if (writing) throw new InputFailure("Wait for the current message request.");
  writing = true;
  try {
    // Scope recovery to the target path: a now-inaccessible job must not prevent
    // opening a support ticket or communicating on another authorized job.
    const owner = `${user}.${await digestStringAsync(CryptoDigestAlgorithm.SHA256, path)}`;
    const stored = await readPending(owner),
      previous = stored ? record(JSON.parse(stored) as unknown) : null;
    const salt = previous ? uuid(previous.salt) : randomUUID(),
      key = previous ? uuid(previous.key) : randomUUID();
    const hash = await digestStringAsync(
      CryptoDigestAlgorithm.SHA256,
      `${salt}:${JSON.stringify(body)}`,
    );
    if (previous && (previous.path !== path || previous.hash !== hash))
      throw new InputFailure(
        "An earlier message request is unresolved. Retry its original details before starting another.",
      );
    if (!previous)
      await writePending(owner, JSON.stringify({ path, key, hash, salt }));
    if (sessionSnapshot()?.userId !== user)
      throw new ApiFailure("UNAUTHENTICATED", 401);
    try {
      const result = receipt(
        await authenticated(path, {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body: JSON.stringify(body),
        }),
      );
      if (result.messageId === null || result.sequence === null)
        throw new Error("Missing accepted message receipt");
      if (expectedThread && result.threadId !== expectedThread)
        throw new Error("Mismatched command receipt");
      if (sessionSnapshot()?.userId !== user)
        throw new ApiFailure("UNAUTHENTICATED", 401);
      await removePending(owner);
      return result;
    } catch (e) {
      // These business rejections occur after receipt lookup and establish that
      // this scoped key was not accepted. Availability/auth/unknown outcomes keep it.
      if (e instanceof ApiFailure && definitiveRejections.includes(e.code))
        await removePending(owner);
      throw e;
    }
  } finally {
    writing = false;
  }
}
export async function tickets(cursor?: string) {
  enabled();
  const r = record(
    await authenticated(
      `/communications/tickets?limit=20${cursor ? `&cursor=${uuid(cursor)}` : ""}`,
    ),
  );
  if (!Array.isArray(r.items) || r.items.length > 20)
    throw new Error("Invalid ticket page");
  const items = r.items.map(thread);
  if (items.some((t) => t.kind !== "SUPPORT"))
    throw new Error("Invalid support category");
  return {
    items,
    nextCursor: r.nextCursor === null ? null : uuid(r.nextCursor),
  };
}
export async function openJob(job: {
  jobType: "RIDE" | "DELIVERY";
  jobId: string;
}) {
  enabled();
  const raw = await authenticated("/communications/job-conversations", {
    method: "POST",
    body: JSON.stringify({ ...job, jobId: uuid(job.jobId) }),
  });
  const context = record(record(raw).job),
    result = thread(raw);
  if (
    result.kind !== "JOB" ||
    context.jobType !== job.jobType ||
    uuid(context.jobId) !== uuid(job.jobId)
  )
    throw new Error("Mismatched job conversation");
  return result;
}
export const createTicket = (subject: string, body: string) =>
  command("/communications/tickets", { subject, body, category: "OTHER" });
export const send = (id: string, body: string) =>
  command(`/communications/threads/${uuid(id)}/messages`, { body }, uuid(id));
export async function messages(id: string, after = 0, signal?: AbortSignal) {
  enabled();
  const page = history(
    await authenticated(
      `/communications/threads/${uuid(id)}/messages?after=${integer(after)}&limit=50`,
      { signal },
    ),
    uuid(id),
  );
  if (page.items.length && page.items[0].sequence !== after + 1)
    throw new Error("Message history needs resynchronization");
  return page;
}
export async function acknowledge(id: string, sequence: number) {
  enabled();
  const r = record(
    await authenticated(`/communications/threads/${uuid(id)}/read-cursor`, {
      method: "PUT",
      body: JSON.stringify({ sequence: integer(sequence) }),
    }),
  );
  return integer(r.readSequence);
}
export async function inbox(cursor?: string) {
  if (!environment.notificationInboxEnabled)
    throw new InputFailure("Activity notifications are not available yet.");
  const r = record(
    await authenticated(
      `/notifications/inbox?limit=20${cursor ? `&cursor=${uuid(cursor)}` : ""}`,
    ),
  );
  if (!Array.isArray(r.items) || r.items.length > 20)
    throw new Error("Invalid activity page");
  return {
    items: r.items.map((value) => {
      const n = record(value);
      if (
        n.type !== "ACTIVITY" ||
        n.text !== "You have new activity. Open Zipp to view it."
      )
        throw new Error("Invalid notification");
      return {
        id: uuid(n.id),
        text: string(n.text, 100),
        createdAt: date(n.createdAt),
        readAt: n.readAt === null ? null : date(n.readAt),
      };
    }),
    nextCursor: r.nextCursor === null ? null : uuid(r.nextCursor),
  };
}
export async function readNotification(id: string) {
  if (!environment.notificationInboxEnabled)
    throw new InputFailure("Activity notifications are not available yet.");
  await authenticated(`/notifications/inbox/${uuid(id)}/read`, {
    method: "PUT",
    body: "{}",
  });
}
