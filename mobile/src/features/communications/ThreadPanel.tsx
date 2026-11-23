import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, TextInput, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { AppText as Text } from "../../components/AppText";
import { ActionButton } from "../../components/ActionButton";
import { sessionSnapshot } from "../identity/session";
import { ApiFailure, InputFailure } from "../api/transport";
import { plainText } from "./contracts";
import type { Message, Thread } from "./contracts";
import * as api from "./api";
import { styles } from "./styles";
export const communicationError = (e: unknown) =>
  e instanceof ApiFailure || e instanceof InputFailure
    ? e.message
    : "Unable to load messages. Refresh and try again.";
export function ThreadPanel({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) {
  const [thread, setThread] = useState<Thread | null>(null),
    [items, setItems] = useState<Message[]>([]),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [more, setMore] = useState(false),
    [retry, setRetry] = useState(false);
  const cursor = useRef(0),
    loading = useRef(false),
    alive = useRef(true),
    controller = useRef<AbortController | null>(null),
    focused = useIsFocused(),
    focusedRef = useRef(focused),
    mountedUser = useRef(sessionSnapshot()?.userId);
  focusedRef.current = focused;
  const load = useCallback(
    async (reset = false) => {
      if (
        loading.current ||
        !alive.current ||
        !focusedRef.current ||
        AppState.currentState !== "active" ||
        sessionSnapshot()?.userId !== mountedUser.current
      )
        return;
      loading.current = true;
      controller.current = new AbortController();
      try {
        const page = await api.messages(
          id,
          reset ? 0 : cursor.current,
          controller.current.signal,
        );
        if (
          !alive.current ||
          controller.current.signal.aborted ||
          sessionSnapshot()?.userId !== mountedUser.current
        )
          return;
        setThread(page.thread);
        setItems((old) =>
          reset
            ? page.items
            : [
                ...old,
                ...page.items.filter((m) => !old.some((v) => v.id === m.id)),
              ].slice(-200),
        );
        const last =
          page.items.at(-1)?.sequence ?? (reset ? 0 : cursor.current);
        cursor.current = last;
        setMore(page.nextAfter !== null);
        setError("");
        // Only acknowledge the bounded page actually rendered, not lastSequence of
        // unseen messages. Receipt recovery never depends on an optimistic bubble.
        if (last > 0) await api.acknowledge(id, last);
      } catch (e) {
        if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
          setItems([]);
          setThread(null);
        }
        if (alive.current && !controller.current?.signal.aborted)
          setError(communicationError(e));
      } finally {
        loading.current = false;
      }
    },
    [id],
  );
  useEffect(() => {
    alive.current = true;
    cursor.current = 0;
    setItems([]);
    setThread(null);
    if (focused && AppState.currentState === "active") void load(true);
    const timer = setInterval(() => {
      if (focused && AppState.currentState === "active") void load();
    }, 5000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && focused) void load();
      else controller.current?.abort();
    });
    return () => {
      alive.current = false;
      clearInterval(timer);
      sub.remove();
      controller.current?.abort();
    };
  }, [load, focused]);
  const send = async () => {
    if (busy) return;
    let body: string;
    try {
      body = plainText(text);
    } catch {
      setError(
        "Enter a message of 1–2,000 characters without unsupported controls.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.send(id, body);
      if (alive.current) {
        setRetry(false);
        setText("");
        await load();
      }
    } catch (e) {
      if (alive.current) {
        setRetry(api.ambiguousWrite(e));
        setError(communicationError(e));
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <View style={styles.group}>
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={styles.link}
      >
        <Text>Back to messages</Text>
      </Pressable>
      <Text accessibilityRole="header" style={styles.heading}>
        {thread?.subject ?? "Job conversation"}
      </Text>
      <Text style={styles.muted}>
        {thread?.writable
          ? "Private conversation. Updates while this screen is open."
          : "Conversation history. New messages may be unavailable."}
      </Text>
      {error !== "" && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {items.map((m) => (
        <View
          key={m.id}
          style={[
            styles.card,
            m.authorUserId === sessionSnapshot()?.userId && styles.own,
          ]}
        >
          <Text style={styles.label}>
            {m.authorUserId === sessionSnapshot()?.userId
              ? "You"
              : "Participant"}
          </Text>
          <Text selectable>{m.body}</Text>
          <Text style={styles.muted}>
            {new Date(m.createdAt).toLocaleString()}
          </Text>
        </View>
      ))}
      {items.length === 0 && thread && <Text>No messages yet.</Text>}
      <ActionButton
        accessibilityLabel={more ? "Load next messages" : "Refresh messages"}
        onPress={() => void load()}
      >
        {more ? "Load next messages" : "Refresh messages"}
      </ActionButton>
      {thread?.writable && (
        <>
          <Text accessibilityRole="header" style={styles.label}>
            Message
          </Text>
          <TextInput
            accessibilityLabel="Message text"
            value={text}
            onChangeText={setText}
            multiline
            maxLength={2000}
            editable={!busy && !retry}
            style={styles.input}
          />
          {retry && (
            <Text style={styles.muted}>
              The result is not confirmed. Retry this same message; its request
              identity is retained.
            </Text>
          )}
          <ActionButton
            accessibilityLabel={
              retry ? "Retry the same message" : "Send message"
            }
            disabled={busy || text.trim().length === 0}
            onPress={() => void send()}
          >
            {busy ? "Sending…" : retry ? "Retry same message" : "Send message"}
          </ActionButton>
        </>
      )}
    </View>
  );
}
