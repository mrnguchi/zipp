import { useState } from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { AppText as Text } from "../../components/AppText";
import { ActionButton } from "../../components/ActionButton";
import { RideMap } from "../../components/maps/RideMap";
import { publicTracking } from "./delivery-api";
import { errorMessage } from "../api/transport";
import { colors } from "../../constants/colors";
export function SharedTrackingScreen() {
  const navigation = useNavigation(),
    [token, setToken] = useState(""),
    [view, setView] = useState<Awaited<
      ReturnType<typeof publicTracking>
    > | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    if (busy) return;
    setBusy(true);
    setError("");
    setView(null);
    try {
      setView(await publicTracking(token.trim()));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <ActionButton
          accessibilityLabel="Back"
          onPress={() => navigation.goBack()}
        >
          Back
        </ActionButton>
        <Text style={styles.title}>Shared delivery tracking</Text>
        <Text>
          Paste the private tracking credential shared with you. You can view
          status and an approximate courier location.
        </Text>
        <TextInput
          accessibilityLabel="Private tracking credential"
          value={token}
          onChangeText={(v) => {
            setToken(v);
            setView(null);
          }}
          maxLength={80}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={styles.input}
        />
        <ActionButton
          accessibilityLabel="View shared delivery status"
          disabled={busy}
          onPress={() => {
            void refresh();
          }}
        >
          {busy ? "Loading…" : "Refresh tracking"}
        </ActionButton>
        {error !== "" && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
        {view && (
          <>
            <Text style={styles.title}>{view.status.replaceAll("_", " ")}</Text>
            {view.position ? (
              <View style={styles.map}>
                <RideMap
                  pickup={view.position}
                  topInset={0}
                  bottomInset={0}
                  showControls={false}
                />
              </View>
            ) : (
              <Text>No current courier position is available.</Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: { padding: 20, gap: 18 },
  title: { fontSize: 20, fontWeight: "600", color: colors.navy },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    borderRadius: 14,
  },
  error: { color: colors.error },
  map: { height: 260, borderRadius: 20, overflow: "hidden" },
});
