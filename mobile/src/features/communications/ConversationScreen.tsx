import { useEffect, useState, useSyncExternalStore } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";
import { AppText as Text } from "../../components/AppText";
import { environment } from "../../config/environment";
import { sessionSnapshot, subscribeSession } from "../identity/session";
import { openJob } from "./api";
import { ThreadPanel, communicationError } from "./ThreadPanel";
import { styles } from "./styles";
export function ConversationScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, "Conversation">) {
  const session = useSyncExternalStore(subscribeSession, sessionSnapshot);
  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {session && environment.communicationsEnabled ? (
            <JobThread
              key={`${session.userId}:${route.params.jobId}`}
              jobType={route.params.jobType}
              jobId={route.params.jobId}
              onBack={() => navigation.goBack()}
            />
          ) : (
            <>
              <Text>
                Sign in to open this conversation. If it is unavailable, please
                try again later.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => navigation.goBack()}
                style={styles.link}
              >
                <Text>Back</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
function JobThread({
  jobType,
  jobId,
  onBack,
}: {
  jobType: "RIDE" | "DELIVERY";
  jobId: string;
  onBack: () => void;
}) {
  const [id, setId] = useState<string | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    void openJob({ jobType, jobId })
      .then((t) => {
        if (alive) setId(t.id);
      })
      .catch((e) => {
        if (alive) setError(communicationError(e));
      });
    return () => {
      alive = false;
    };
  }, [jobType, jobId, attempt]);
  return id ? (
    <ThreadPanel id={id} onBack={onBack} />
  ) : (
    <>
      <Text accessibilityRole="header" style={styles.heading}>
        Job conversation
      </Text>
      <Text accessibilityRole={error ? "alert" : "text"}>
        {error || "Opening conversation…"}
      </Text>
      {error !== "" && (
        <Pressable
          accessibilityRole="button"
          style={styles.link}
          onPress={() => {
            setError("");
            setAttempt((v) => v + 1);
          }}
        >
          <Text>Retry</Text>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={styles.link}
      >
        <Text>Back</Text>
      </Pressable>
    </>
  );
}
