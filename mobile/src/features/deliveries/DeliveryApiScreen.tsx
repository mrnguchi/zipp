import { CourierOffers } from "./CourierOffers";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { AppText as Text } from "../../components/AppText";
import { ActionButton } from "../../components/ActionButton";
import type { RootStackParamList } from "../../navigation/types";
import { createDeliveryDraft } from "../../services/deliveryFlow";
import type { DeliveryDraft } from "../../services/deliveryFlow";
import { sessionSnapshot, subscribeSession } from "../identity/session";
import { useProfile } from "../../contexts/ProfileContext";
import { useDeliveryApi } from "./use-delivery-api";
import { styles, titles } from "./delivery-presentation";
import { colors } from "../../constants/colors";
import { DeliveryBooking } from "./DeliveryBooking";
import { DeliveryStatus } from "./DeliveryStatus";
export function DeliveryApiScreen() {
  const navigation =
      useNavigation<NativeStackNavigationProp<RootStackParamList>>(),
    session = useSyncExternalStore(subscribeSession, sessionSnapshot),
    { profile } = useProfile(),
    flow = useDeliveryApi(),
    d = flow.selected;
  const [draft, setDraft] = useState<DeliveryDraft>(() =>
    createDeliveryDraft(profile?.name ?? "", session?.phone ?? ""),
  );
  useEffect(() => {
    if (session)
      setDraft((current) => ({
        ...current,
        ...(current.perspective === "receiving"
          ? { recipientPhone: session.phone }
          : { senderPhone: session.phone }),
      }));
  }, [session?.userId]);
  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {" "}
          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => navigation.goBack()}
              style={styles.link}
            >
              <Text>Back</Text>
            </Pressable>
            <Text style={styles.title}>Zipp delivery</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate("DeliveryTrackingViewer")}
              style={styles.link}
            >
              <Text>View shared tracking</Text>
            </Pressable>
          </View>
          {flow.busy && (
            <ActivityIndicator
              accessibilityLabel="Updating delivery"
              color={colors.primary}
            />
          )}
          {flow.error !== "" && (
            <Text accessibilityRole="alert" style={styles.error}>
              {flow.error}
            </Text>
          )}
          {!session ? (
            <>
              <Text>Sign in to book, claim or manage a delivery.</Text>
              <ActionButton
                accessibilityLabel="Sign in"
                onPress={() => navigation.navigate("Login")}
              >
                Sign in
              </ActionButton>
              <ActionButton
                accessibilityLabel="Retry session recovery"
                disabled={flow.busy}
                onPress={flow.refresh}
              >
                Restore session
              </ActionButton>
            </>
          ) : (
            <>
              <ActionButton
                accessibilityLabel="Refresh delivery status"
                disabled={flow.busy}
                onPress={flow.refresh}
              >
                Refresh status
              </ActionButton>
              {flow.rows.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.heading}>Your deliveries</Text>
                  {flow.rows.map((row) => (
                    <Pressable
                      key={row.id}
                      accessibilityRole="button"
                      onPress={() => flow.select(row)}
                      style={styles.item}
                    >
                      <Text>
                        {titles[row.status]} · {row.id.slice(0, 8)}
                      </Text>
                      <Text style={styles.copy}>
                        {new Date(row.createdAt).toLocaleString()}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {!d && session.roles.includes("DRIVER") && (
                <CourierOffers onAssigned={flow.refresh} />
              )}
              {!d && !flow.uncertain && (
                <DeliveryBooking
                  draft={draft}
                  setDraft={setDraft}
                  flow={flow}
                />
              )}{" "}
              {flow.uncertain && (
                <View style={styles.card}>
                  <Text>
                    Your booking outcome is not confirmed. Keep these details
                    unchanged and retry the same request or refresh existing
                    deliveries.
                  </Text>
                  <ActionButton
                    accessibilityLabel="Recover original booking"
                    disabled={flow.busy}
                    onPress={() => {
                      void flow.book(draft);
                    }}
                  >
                    Recover booking
                  </ActionButton>
                </View>
              )}
              {d && <DeliveryStatus key={d.id} flow={flow} />}
            </>
          )}{" "}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
