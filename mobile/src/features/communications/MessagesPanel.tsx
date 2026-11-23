import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppText as Text } from "../../components/AppText";
import { ActionButton } from "../../components/ActionButton";
import { sessionSnapshot, subscribeSession } from "../identity/session";
import { environment } from "../../config/environment";
import { plainText } from "./contracts";
import type { Thread } from "./contracts";
import * as api from "./api";
import { ThreadPanel, communicationError } from "./ThreadPanel";
import { styles } from "./styles";
export function MessagesPanel({ bottomInset = 24 }: { bottomInset?: number }) {
  const session = useSyncExternalStore(subscribeSession, sessionSnapshot);
  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.content,
            { paddingBottom: bottomInset },
          ]}
        >
          {!session ? (
            <>
              <Text style={styles.heading}>Messages</Text>
              <Text>Sign in to view your private conversations.</Text>
            </>
          ) : (
            <MessageContent key={session.userId} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
function MessageContent() {
  const [selected, setSelected] = useState<string | null>(null),
    [tickets, setTickets] = useState<Thread[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [error, setError] = useState(""),
    [subject, setSubject] = useState(""),
    [body, setBody] = useState(""),
    [busy, setBusy] = useState(false),
    [activities, setActivities] = useState<
      Awaited<ReturnType<typeof api.inbox>>["items"]
    >([]),
    [inboxCursor, setInboxCursor] = useState<string | null>(null),
    [retry, setRetry] = useState(false);
  const alive = useRef(true),
    loading = useRef(false);
  const load = async (kind: "refresh" | "tickets" | "inbox" = "refresh") => {
    if (loading.current) return;
    loading.current = true;
    try {
      const [ticketResult, inboxResult] = await Promise.allSettled([
        environment.communicationsEnabled && kind !== "inbox"
          ? api.tickets(kind === "tickets" ? (cursor ?? undefined) : undefined)
          : Promise.resolve(null),
        environment.notificationInboxEnabled && kind !== "tickets"
          ? api.inbox(kind === "inbox" ? (inboxCursor ?? undefined) : undefined)
          : Promise.resolve(null),
      ] as const);
      const page =
          ticketResult.status === "fulfilled" ? ticketResult.value : null,
        inbox = inboxResult.status === "fulfilled" ? inboxResult.value : null;
      if (!alive.current) return;
      if (page) {
        setTickets((old) =>
          kind === "tickets"
            ? [
                ...old,
                ...page.items.filter((t) => !old.some((v) => v.id === t.id)),
              ].slice(-100)
            : page.items,
        );
        setCursor(page.nextCursor);
      }
      if (inbox) {
        setActivities((old) =>
          kind === "inbox"
            ? [
                ...old,
                ...inbox.items.filter((t) => !old.some((v) => v.id === t.id)),
              ].slice(-100)
            : inbox.items,
        );
        setInboxCursor(inbox.nextCursor);
      }
      const failure =
        ticketResult.status === "rejected"
          ? ticketResult.reason
          : inboxResult.status === "rejected"
            ? inboxResult.reason
            : null;
      setError(failure ? communicationError(failure) : "");
    } catch (e) {
      if (alive.current) setError(communicationError(e));
    } finally {
      loading.current = false;
    }
  };
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, []);
  const create = async () => {
    if (busy) return;
    let s: string, b: string;
    try {
      s = plainText(subject, 3, 120);
      b = plainText(body);
    } catch {
      setError(
        "Enter a subject of 3–120 characters and a message of 1–2,000 characters.",
      );
      return;
    }
    setBusy(true);
    try {
      const r = await api.createTicket(s, b);
      if (alive.current) {
        setSelected(r.threadId);
        setSubject("");
        setBody("");
        setRetry(false);
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
  if (selected)
    return (
      <ThreadPanel
        key={selected}
        id={selected}
        onBack={() => {
          setSelected(null);
          void load();
        }}
      />
    );
  return (
    <View style={styles.group}>
      <Text accessibilityRole="header" style={styles.heading}>
        Messages & support
      </Text>
      <Text style={styles.muted}>
        Open a job conversation from your booking. Support requests stay here.
      </Text>
      {error !== "" && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {(environment.communicationsEnabled ||
        environment.notificationInboxEnabled) && (
        <ActionButton
          accessibilityLabel="Refresh messages and activity"
          onPress={() => void load()}
        >
          Refresh
        </ActionButton>
      )}
      {environment.communicationsEnabled ? (
        <>
          <Text accessibilityRole="header" style={styles.label}>
            Support requests
          </Text>
          {tickets.length === 0 && <Text>No support requests yet.</Text>}
          {tickets.map((t) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open support request ${t.subject ?? ""}`}
              style={styles.card}
              key={t.id}
              onPress={() => setSelected(t.id)}
            >
              <Text style={styles.label}>{t.subject}</Text>
              <Text>{t.status === "OPEN" ? "Open" : "Resolved"}</Text>
            </Pressable>
          ))}
          {cursor && (
            <ActionButton
              accessibilityLabel="Load more support requests"
              onPress={() => void load("tickets")}
            >
              More support requests
            </ActionButton>
          )}
          <Text accessibilityRole="header" style={styles.label}>
            Contact support
          </Text>
          <TextInput
            accessibilityLabel="Support request subject"
            placeholder="Subject"
            maxLength={120}
            editable={!busy && !retry}
            value={subject}
            onChangeText={setSubject}
            style={styles.input}
          />
          <TextInput
            accessibilityLabel="Support request details"
            placeholder="How can we help?"
            multiline
            maxLength={2000}
            editable={!busy && !retry}
            value={body}
            onChangeText={setBody}
            style={styles.input}
          />
          {retry && (
            <Text style={styles.muted}>
              Keep these details and retry the same request to recover its
              result.
            </Text>
          )}
          <ActionButton
            accessibilityLabel={
              retry
                ? "Retry the same support request"
                : "Create support request"
            }
            disabled={
              busy || subject.trim().length < 3 || body.trim().length === 0
            }
            onPress={() => void create()}
          >
            {busy
              ? "Sending…"
              : retry
                ? "Retry same request"
                : "Create support request"}
          </ActionButton>
        </>
      ) : (
        <Text>Conversations are not available yet.</Text>
      )}
      {environment.notificationInboxEnabled && (
        <>
          <Text accessibilityRole="header" style={styles.label}>
            Activity
          </Text>
          {activities.length === 0 && (
            <Text>No activity notifications yet.</Text>
          )}
          {activities.map((n) => (
            <View style={styles.card} key={n.id}>
              <Text>{n.text}</Text>
              <Text style={styles.muted}>
                {new Date(n.createdAt).toLocaleString()}
              </Text>
              {!n.readAt && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Mark activity notification as read"
                  style={styles.link}
                  onPress={() => {
                    void api
                      .readNotification(n.id)
                      .then(() => load())
                      .catch((e) => {
                        if (alive.current) setError(communicationError(e));
                      });
                  }}
                >
                  <Text>Mark as read</Text>
                </Pressable>
              )}
            </View>
          ))}
          {inboxCursor && (
            <ActionButton
              accessibilityLabel="Load more activity notifications"
              onPress={() => void load("inbox")}
            >
              More activity
            </ActionButton>
          )}
        </>
      )}
    </View>
  );
}
